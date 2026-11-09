
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT 'Sem título',
  content text NOT NULL DEFAULT '',
  summary text,
  type text NOT NULL DEFAULT 'ideia' CHECK (type IN ('ideia','tarefa','cliente','projeto','conteudo','pessoa','referencia','diario','aprendizado')),
  tags text[] NOT NULL DEFAULT '{}',
  source_kind text NOT NULL DEFAULT 'texto' CHECK (source_kind IN ('texto','audio','imagem','arquivo','link')),
  attachment_path text,
  source_url text,
  og_image text,
  status text NOT NULL DEFAULT 'pronta' CHECK (status IN ('processando','pronta','erro')),
  progress text,
  error_message text,
  entities jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  share_token text UNIQUE,
  pinned boolean NOT NULL DEFAULT false,
  daily_date date,
  search_vector tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_own" ON public.notes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX notes_user_idx ON public.notes(user_id, updated_at DESC);
CREATE INDEX notes_search_idx ON public.notes USING gin(search_vector);
CREATE UNIQUE INDEX notes_daily_uniq ON public.notes(user_id, daily_date) WHERE daily_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notes_before_write() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.search_vector :=
    setweight(to_tsvector('portuguese', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('portuguese', array_to_string(NEW.tags,' ')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(NEW.summary,'')), 'B') ||
    setweight(to_tsvector('portuguese', left(coalesce(NEW.content,''), 100000)), 'C');
  RETURN NEW;
END $$;
CREATE TRIGGER notes_before_write BEFORE INSERT OR UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.notes_before_write();

CREATE TABLE public.links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  source_note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  target_note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','wikilink','ia')),
  reason text,
  confidence numeric,
  status text NOT NULL DEFAULT 'aceita' CHECK (status IN ('sugerida','aceita','rejeitada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_note_id, target_note_id),
  CHECK (source_note_id <> target_note_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.links TO authenticated;
GRANT ALL ON public.links TO service_role;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "links_own" ON public.links FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX links_user_idx ON public.links(user_id);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  note_id uuid REFERENCES public.notes(id) ON DELETE CASCADE,
  text text NOT NULL,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_own" ON public.tasks FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.links;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- Full text search
CREATE OR REPLACE FUNCTION public.search_notes(q text)
RETURNS TABLE (id uuid, title text, type text, tags text[], headline text, rank real)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT n.id, n.title, n.type, n.tags,
    ts_headline('portuguese', coalesce(n.summary,'') || ' ' || left(n.content, 5000), websearch_to_tsquery('portuguese', q),
      'StartSel=<mark>,StopSel=</mark>,MaxWords=30,MinWords=10,MaxFragments=2') AS headline,
    ts_rank(n.search_vector, websearch_to_tsquery('portuguese', q)) AS rank
  FROM public.notes n
  WHERE n.user_id = auth.uid()
    AND (n.search_vector @@ websearch_to_tsquery('portuguese', q) OR n.title ILIKE '%' || q || '%')
  ORDER BY rank DESC, n.updated_at DESC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.search_notes(text) TO authenticated;

-- Public sharing
CREATE OR REPLACE FUNCTION public.get_shared_note(_token text)
RETURNS TABLE (title text, content text, type text, tags text[], attachment_path text, source_kind text, source_url text, created_at timestamptz, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT title, content, type, tags, attachment_path, source_kind, source_url, created_at, updated_at
  FROM public.notes WHERE share_token = _token AND is_shared = true AND _token IS NOT NULL AND length(_token) >= 16 LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_shared_note(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_shared_attachment(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.notes WHERE attachment_path = _path AND is_shared = true);
$$;
GRANT EXECUTE ON FUNCTION public.is_shared_attachment(text) TO anon, authenticated;

-- Storage policies
CREATE POLICY "anexos_own_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'anexos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "anexos_own_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'anexos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "anexos_own_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'anexos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "anexos_own_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'anexos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "anexos_shared_select" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'anexos' AND public.is_shared_attachment(name));

-- Seed on signup
CREATE OR REPLACE FUNCTION public.seed_user_brain(_uid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ids jsonb := '{}'::jsonb;
  r record;
  nid uuid;
  pairs text[][] := ARRAY[
    ['PROLAV','Consultoria de marketing'],['PROLAV','Playbook PROLAV'],['PROLAV','Kit de marca PROLAV'],
    ['PROLAV','Meta Ads (BM)'],['PROLAV','Google Ads (MCC)'],['Organize Consultoria','Consultoria de marketing'],
    ['Vanine, arquiteta','Nicho: arquitetos de alto padrão'],['Vanine, arquiteta','Precificação de consultoria'],
    ['Clínica de fisioterapia','Precificação de consultoria'],['Aida, fotógrafa','Precificação de consultoria'],
    ['Desafio 100 vídeos','Vídeo: 3 erros de marketing de pequenas empresas'],['Consultoria de marketing','Precificação de consultoria'],
    ['Segundo Cérebro','Fluxo Lovable → GitHub → Antigravity'],['App de recibos e contratos para autônomos','Fluxo Lovable → GitHub → Antigravity']
  ];
  i int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.notes WHERE user_id = _uid) THEN RETURN; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('PROLAV','cliente',ARRAY['cliente','higienizacao','maceio','marketing'],'Cliente de higienização de estofados em Maceió. Atendimento de consultoria de marketing com campanhas pagas e posicionamento de marca.','# PROLAV\n\nHigienização de estofados em **Maceió**.\n\n- Serviço: limpeza de sofás, colchões, tapetes e bancos automotivos\n- Frentes: [[Consultoria de marketing]], [[Meta Ads (BM)]], [[Google Ads (MCC)]]\n- Materiais: [[Playbook PROLAV]], [[Kit de marca PROLAV]]\n\n#cliente #maceio'),
    ('Organize Consultoria','cliente',ARRAY['cliente','rh','parceria'],'Consultoria de RH com quem existe uma parceria comercial baseada em percentual sobre os contratos fechados.','# Organize Consultoria\n\nConsultoria de RH. Parceria com **percentual** sobre contratos indicados.\n\nRelacionado: [[Consultoria de marketing]]\n\n#parceria #rh'),
    ('Center Frios / 381 Distribuidora','cliente',ARRAY['clt','trabalho','distribuidora'],'Trabalho CLT atual em distribuidora de frios. Fonte de renda fixa que divide o tempo com a consultoria.','# Center Frios / 381 Distribuidora\n\nTrabalho **CLT**. Organizar a agenda para conciliar com os projetos de consultoria.\n\n#clt'),
    ('Vanine, arquiteta','pessoa',ARRAY['cliente','arquitetura','negociacao'],'Arquiteta em negociação para serviços de marketing. Ponte para o nicho de arquitetos de alto padrão.','# Vanine, arquiteta\n\nEm **negociação**. Pode abrir portas para o [[Nicho: arquitetos de alto padrão]].\n\nDefinir proposta com base na [[Precificação de consultoria]].\n\n#negociacao'),
    ('Clínica de fisioterapia','cliente',ARRAY['cliente','saude','proposta'],'Clínica de fisioterapia que recebeu proposta de consultoria de marketing; aguardando retorno.','# Clínica de fisioterapia\n\nProposta **enviada**. Fazer follow-up.\n\nValores baseados na [[Precificação de consultoria]].\n\n#proposta'),
    ('Aida, fotógrafa','pessoa',ARRAY['cliente','fotografia','proposta'],'Fotógrafa que recebeu proposta de marketing; aguardando resposta.','# Aida, fotógrafa\n\nProposta **enviada**.\n\nVer [[Precificação de consultoria]].\n\n#proposta'),
    ('Consultoria de marketing','projeto',ARRAY['consultoria','marketing','negocio'],'Área principal de atuação: consultoria de marketing para pequenas empresas locais, com tráfego pago e posicionamento.','# Consultoria de marketing\n\nÁrea principal de negócio.\n\n- Clientes: [[PROLAV]], [[Organize Consultoria]]\n- Base de preços: [[Precificação de consultoria]]\n\n#consultoria'),
    ('Desafio 100 vídeos','projeto',ARRAY['conteudo','video','desafio'],'Desafio pessoal de publicar 100 vídeos para construir autoridade e audiência.','# Desafio 100 vídeos\n\nMeta: publicar 100 vídeos curtos.\n\nPróximo roteiro: [[Vídeo: 3 erros de marketing de pequenas empresas]]\n\n#conteudo'),
    ('Segundo Cérebro','projeto',ARRAY['produtividade','app','conhecimento'],'Este app: um segundo cérebro pessoal que captura, organiza e conecta ideias com IA.','# Segundo Cérebro\n\nSistema pessoal de conhecimento conectado.\n\nConstruído com o [[Fluxo Lovable → GitHub → Antigravity]].\n\n#produtividade'),
    ('Meta Ads (BM)','projeto',ARRAY['trafego','meta','anuncios'],'Gestão do Business Manager da Meta para campanhas de clientes.','# Meta Ads (BM)\n\nBusiness Manager com contas de anúncios dos clientes.\n\n#trafego'),
    ('Google Ads (MCC)','projeto',ARRAY['trafego','google','anuncios'],'Conta MCC do Google Ads para gerenciar campanhas de clientes.','# Google Ads (MCC)\n\nConta gerenciadora para campanhas de pesquisa e local.\n\n#trafego'),
    ('Playbook PROLAV','aprendizado',ARRAY['playbook','processo','prolav'],'Playbook de processos de marketing e atendimento da PROLAV.','# Playbook PROLAV\n\nProcessos de atendimento, scripts de WhatsApp e rotina de campanhas.\n\n#playbook'),
    ('Kit de marca PROLAV','referencia',ARRAY['marca','design','prolav'],'Kit de identidade visual da PROLAV: logo, cores, tipografia e modelos de post.','# Kit de marca PROLAV\n\nLogo, paleta, tipografia e templates.\n\n#marca'),
    ('Fluxo Lovable → GitHub → Antigravity','aprendizado',ARRAY['dev','fluxo','ferramentas'],'Fluxo de desenvolvimento: criar no Lovable, sincronizar com GitHub e continuar ajustes no Antigravity.','# Fluxo Lovable → GitHub → Antigravity\n\n1. Construir no Lovable\n2. Sincronizar com o GitHub\n3. Ajustes finos no Antigravity\n\n#dev'),
    ('Precificação de consultoria','aprendizado',ARRAY['preco','consultoria','negocio'],'Como precificar a consultoria: custo da hora, escopo, valor percebido e pacotes.','# Precificação de consultoria\n\n- Calcular custo da hora\n- Definir pacotes por escopo\n- Ancorar no valor percebido\n\n#preco'),
    ('Nicho: arquitetos de alto padrão','aprendizado',ARRAY['nicho','arquitetura','posicionamento'],'Estudo do nicho de arquitetos de alto padrão como mercado para consultoria de marketing.','# Nicho: arquitetos de alto padrão\n\nTicket alto, portfólio visual forte, decisão baseada em indicação.\n\n#nicho'),
    ('App de recibos e contratos para autônomos','ideia',ARRAY['ideia','saas','autonomos'],'Ideia de SaaS para autônomos gerarem recibos e contratos com IA e precificarem melhor.','# App de recibos e contratos para autônomos\n\nRecibos e contratos com IA + calculadora de preço.\n\n#saas'),
    ('E-book / produto digital','ideia',ARRAY['ideia','produto-digital','ebook'],'Ideia de criar um e-book ou produto digital a partir da experiência em consultoria.','# E-book / produto digital\n\nTransformar a experiência de consultoria em produto escalável.\n\n#produto-digital'),
    ('Vídeo: 3 erros de marketing de pequenas empresas','conteudo',ARRAY['video','roteiro','marketing'],'Roteiro de vídeo sobre os 3 erros de marketing mais comuns em pequenas empresas.','# Vídeo: 3 erros de marketing de pequenas empresas\n\n1. Não ter oferta clara\n2. Postar sem estratégia\n3. Não medir resultados\n\n#roteiro')
  ) AS t(title, type, tags, summary, content)
  LOOP
    INSERT INTO public.notes (user_id, title, type, tags, summary, content, source_kind, status)
    VALUES (_uid, r.title, r.type, r.tags, r.summary, replace(r.content, '\n', E'\n'), 'texto', 'pronta')
    RETURNING id INTO nid;
    ids := ids || jsonb_build_object(r.title, nid);
  END LOOP;
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    INSERT INTO public.links (user_id, source_note_id, target_note_id, kind, status, confidence, reason)
    VALUES (_uid, (ids->>pairs[i][1])::uuid, (ids->>pairs[i][2])::uuid, 'manual', 'aceita', 1, 'Ligação inicial')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.seed_user_brain(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user_brain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.seed_user_brain(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed failed: %', SQLERRM;
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_brain AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_brain();
