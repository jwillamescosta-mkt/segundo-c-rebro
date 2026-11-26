# Estratégia de evolução do Segundo Cérebro

Base: vídeo "13 dicas para montar o Segundo Cérebro definitivo com IA (2027)", de Victor Baggio (transcrição completa lida em 26/11/2026), cruzado com o código atual do app.

## A ideia central do vídeo

O vídeo diz que um segundo cérebro bom não precisa de milhares de notas. Mais de 80% das tarefas dependem de **poucos documentos de contexto muito bons**: quem você é, estratégia, cliente ideal, oferta, tom de voz, equipe e rotina. Em volta disso:

- um **mapa** (AGENTS.md), com índices por área, para a IA achar as coisas sem ler tudo;
- **resumos** no lugar do dado bruto, com o caminho até a origem;
- **rotinas automáticas** que atualizam todo dia e limpam toda semana;
- um **painel (OS)** para ver tudo sem precisar ler o chat;
- uma **fonte única da verdade** que todas as skills leem.

O app já é forte em captura, ligações e grafo. Falta a camada que o vídeo chama de "OS": núcleo de contexto, mapa, rotinas e painel.

## As 13 dicas e o que o app já tem

| # | Dica | O que o app já tem | O que falta |
|---|------|--------------------|-------------|
| 1 | Brain dump por entrevista e por voz | Gravação de áudio, divisão de capturas por assunto, nota "Quem sou eu" | **Entrevista guiada** que gera os documentos-núcleo |
| 2 | Uma pasta local, portátil entre IAs | Exportação .zip em .md, MCP só para capturar | **MCP de leitura** (Claude e GPT usarem o cérebro como contexto) e **espelho no GitHub** |
| 3 | Visualizar o cérebro | Grafo 2D/3D, busca, nota aberta | **Vista "Mapa"** por áreas, como pastas, com leitura no painel |
| 4 | Um bom AGENTS.md | Nota "Regras do meu cérebro" | **Nota "Mapa do cérebro"** gerada sozinha, exportada como `AGENTS.md` |
| 5 | Um cérebro só (trabalho e pessoal juntos) | Já é um cérebro só; metas têm área (`GOAL_AREAS`) | **Área** nas notas (trabalho, pessoal…) como filtro |
| 6 | Não mexer na estrutura à mão | Sincronização de wikilinks ao salvar | **Renomear nota atualiza os `[[links]]`** nas outras notas (hoje não atualiza) |
| 7 | Índice em cada subpasta | Agrupamento por tipo na barra lateral | **Notas-índice (MOC)** por área, tipo e cliente, mantidas pela IA; `_indice.md` em cada pasta do export |
| 8 | Resumo, não dado bruto | `summary` e `source_url` | Transcrições longas **recolhidas**; a IA consulta pelo resumo; **YouTube vira transcrição + resumo** |
| 9 | Atualizar todo dia | Briefing do dia e da semana (só por botão) | **Rotina "Fim do dia"** automática |
| 10 | Check-up semanal | Notas órfãs, passada inteligente | **Faxina semanal**: duplicadas, índices velhos, notas longas, sugestões paradas (a IA propõe, você aprova) |
| 11 | Painel (OS) | Início com pulso, agenda, briefing, lampejo | **Início vira painel**: briefing da manhã, tarefas, metas, pipeline de clientes, números da semana |
| 12 | Fonte única da verdade | `goalsContext` e "Quem sou eu" usados em parte | **Uma função `coreContext()`** que todos os prompts (perguntar, briefing, pipeline, divisão) e o MCP usam |
| 13 | Rotinas na nuvem | `authenticateCronRequest` existe, mas nenhum cron usa | **Cron no Supabase** chamando rotas do app; **rotinas do Claude** usando o MCP |

Nota sobre a dica 2: o app fica na nuvem (Supabase), o que já atende a dica 13 e resolve a crítica dos comentários ao vídeo sobre "dados só no PC". Então não vale trocar para uma pasta local. A portabilidade vem de duas coisas: o MCP de leitura e o espelho em .md.

## Princípio de construção

- **Sem mudar o esquema sempre que der.** Núcleo = notas com a tag `núcleo` e `pinned`. Área = tag `area/trabalho` ou `area/pessoal`. Índices = notas do tipo `referencia` com `entities.indice = <escopo>`. Estado das rotinas = `entities` da nota diária. Isso evita depender do Lovable para o banco.
- **A IA sugere e você decide.** A faxina, os índices e a entrevista mostram uma prévia antes de gravar.
- Tudo continua privado e exportável em .md.

## Plano em 4 fases

### Fase 1: Núcleo de contexto e fonte única (fundação, 1 a 2 dias)
1. **`coreContext(db)`** em `src/lib/core-context.server.ts`. Junta "Quem sou eu", as notas `núcleo` (só os resumos e as seções-chave, até cerca de 2 mil tokens), as metas ativas e as regras. Passa a ser usada em `ask.server.ts`, `briefing.server.ts`, `pipeline.server.ts` e `split.server.ts`, no lugar dos trechos soltos de hoje (dica 12).
2. **Entrevista "Montar meu cérebro"** em `/entrevista`, com link no Início quando faltar núcleo. A IA faz uma pergunta por vez, na ordem: quem sou eu, trabalho e oferta, clientes ideais, tom de voz, equipe e parceiros, rotina, metas, vida pessoal. Você responde **por voz**, reaproveitando o gravador do `CaptureBox` e `transcribe.server.ts`. No fim, mostra a prévia de 6 a 8 notas-núcleo (Estratégia, Cliente ideal, Oferta, Tom de voz, Equipe, Rotina, Vida pessoal) para você aprovar. Dá para refazer só um tema depois (dica 1).
3. **Seção "Núcleo" fixa na barra lateral** e um selo "núcleo" na nota.

### Fase 2: Mapa, índices e portabilidade (2 a 3 dias)
4. **Nota "Mapa do cérebro"**, gerada sem IA a partir dos dados: áreas, tipos, contagens, notas-núcleo e índices, mais como navegar. É atualizada pelas rotinas (dica 4).
5. **Notas-índice (MOC)** por área, por cliente e por projeto, com o que existe, o status e a próxima ação. A IA escreve; você vê a prévia (dica 7).
6. **Exportação no formato do vídeo** (`src/lib/export.ts`): `AGENTS.md` e `CLAUDE.md` na raiz, com o mapa, uma pasta por tipo, `_indice.md` em cada pasta e a pasta `nucleo/`. Assim o zip aberto no Obsidian ou entregue ao Claude Code já vira um "segundo cérebro em pasta" (dicas 2, 3 e 7).
7. **MCP de leitura** (`src/lib/mcp-utils.ts`), pensado para gastar pouco token, que é a crítica do vídeo ao MCP:
   - `contexto_essencial`: o `coreContext` pronto;
   - `mapa_do_cerebro`;
   - `buscar_notas(q)`: só título, resumo e id, usando `search_notes`;
   - `ler_nota(id)`;
   - `tarefas_e_agenda(dias)`.

   O token do MCP passa a ter escopo (`capture_tokens.scope` já existe): "capturar" ou "ler e capturar". A leitura fica desligada por padrão, porque é dado privado.
8. **Renomear propaga** os `[[links]]`: ao mudar o título, atualiza o conteúdo das notas que linkavam para o nome antigo (dica 6).

### Fase 3: Rotinas automáticas (2 dias)
9. **Rotas de rotina** em `src/routes/api/rotina.$tipo.ts`, protegidas por `authenticateCronRequest`:
   - `manha`: briefing do dia na nota diária (já existe `generateBriefing`, só passa a ser agendado);
   - `fim-do-dia` (dica 9): consolida as capturas do dia na nota diária, com o que aconteceu, decisões, aprendizados e pendências para amanhã. Atualiza o Mapa e os índices tocados e roda a passada inteligente;
   - `faxina` às sextas (dica 10): procura títulos parecidos ou duplicados, índices desatualizados, notas longas sem resumo, sugestões paradas há mais de 14 dias, tarefas vencidas há mais de 30 dias e órfãs. Grava uma **nota "Faxina da semana"** com uma caixa por item. Nada é apagado sem você marcar.
10. **Agendamento** com pg_cron e pg_net no Supabase. ⚠️ Isso é configuração de banco: **pedir ao Lovable** (ou autorizar por `query_database`, como foi feito antes).
11. **Rotinas do Claude**, sem código no app: uma rotina na nuvem às 18h lê o Gmail, o Google Agenda e as reuniões (conectores que você já tem no Claude). Ela manda **só resumos e links** pelo `capturar_nota`. É a dica 8 aplicada: o e-mail bruto fica no Gmail.

### Fase 4: Painel (OS) e visualização (3 a 4 dias)
12. **Início vira o painel**, com blocos em grade (mobile em coluna):
    - Briefing da manhã (texto da nota diária, recolhível);
    - Hoje: agenda e tarefas, com check direto;
    - Metas e KRs com barra de progresso (reaproveita `GoalCard`);
    - **Pipeline de clientes**: notas `cliente` por etapa (lead, proposta, negociação, ativo), lida de `entities.etapa` que a IA preenche, com "próxima ação" e "parado há X dias";
    - Números da semana com recharts: capturas, ligações aceitas, cards revisados, tarefas feitas;
    - Pendências do cérebro: sugestões, faxina, notas com erro.
13. **Vista "Mapa"** em `/mapa`: árvore Área → Tipo → Nota, com índices no topo de cada grupo, busca que destaca, e leitura da nota no painel direito sem sair. É a "visão de pastas" do vídeo, ao lado do grafo.
14. **Grafo**: colorir por área, alternar entre "só núcleo e índices" e "tudo", e um botão "focar nesta área".
15. **Paleta Ctrl+K com ações**: "rodar fim do dia", "abrir faxina", "entrevista: refazer Tom de voz", "copiar contexto essencial" (para colar em qualquer IA).

## Integrações, por custo e benefício

| Integração | Como | Esforço | Ganho |
|---|---|---|---|
| Rotina do Claude (Gmail, Agenda, reuniões → resumos) | MCP existente e uma rotina agendada | Baixo | Alto |
| MCP de leitura (Claude, ChatGPT, Cursor usam seu contexto) | Fase 2, item 7 | Médio | Muito alto |
| YouTube → transcrição e resumo | Ao capturar um link do YouTube, buscar as legendas no servidor; se falhar, usar a descrição e os capítulos | Médio | Alto (aprendizados de vídeo, como este) |
| Espelho no GitHub (vault .md) | Rotina semanal que faz commit do export num repositório privado | Médio | Backup e cérebro em pasta para o Claude Code |
| Importar vault do Obsidian ou Notion (.md, .zip) | Reaproveita o pipeline de captura por arquivo | Baixo | Médio |
| Google Agenda nos dois sentidos | Conector do Lovable (hoje só sai o feed .ics) | Médio (Lovable) | Médio |
| Bot do Telegram ou WhatsApp para capturar | Webhook e um segredo no Lovable | Médio | Médio (os Atalhos do iPhone já cobrem parte) |

## Ordem recomendada

**Fase 1 → item 7 (MCP de leitura) → Fase 3 → Fase 4 → resto da Fase 2.**

O núcleo e a fonte única melhoram todas as respostas da IA na hora, sem tela nova. O MCP de leitura faz o cérebro servir a todas as suas IAs. As rotinas fazem o cérebro crescer sozinho. O painel é o que você vê todo dia, então vale mais depois que os dados existem.

## O que depende do Lovable ou do banco
- O pg_cron e o pg_net (Fase 3, item 10).
- Opcional: uma coluna `area` nas notas. Por enquanto vai em tag, sem mudar o esquema.
- Registrar nas migrações as tabelas criadas fora delas (`events`, `cards`, `goals`, `key_results`, `capture_tokens`). É uma pendência antiga.
