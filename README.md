# Segundo Cérebro

Construa o app "Segundo Cérebro": um segundo cérebro pessoal, privado, com visual e funcionamento inspirados no Obsidian, em português do Brasil. Faça tudo nesta primeira versão, completo e funcional, sem placeholders. Use Lovable Cloud (auth, Postgres, Storage, Edge Functions) e Lovable AI (Gemini) para toda a IA; não peça chaves de API externas.

## Visual (estilo Obsidian)
- Tema escuro por padrão (fundo #1e1e1e / painéis #252526, bordas #333), acento roxo #8b5cf6, tipografia Inter, ícones lucide. Tema claro opcional.
- Layout de 3 painéis redimensionáveis: barra lateral esquerda (busca, "Nova captura", lista de notas agrupada por tipo, tags), área central (nota aberta em abas, ou o grafo), painel direito (backlinks, ligações sugeridas, grafo local da nota, propriedades).
- Paleta de comandos com Ctrl/Cmd+K (abrir nota, criar nota, ir para grafo, buscar).
- Responsivo: no celular vira uma tela de captura rápida com botão grande de gravar áudio, e navegação por abas inferiores. Configure como PWA instalável.

## Login
- Supabase Auth com e-mail e senha. Tudo é do usuário logado (RLS em todas as tabelas: user_id = auth.uid()).

## Modelo de dados
- notes: id, user_id, title, content (markdown), summary, type ('ideia','tarefa','cliente','projeto','conteudo','pessoa','referencia','diario','aprendizado'), tags text[], source_kind ('texto','audio','imagem','arquivo','link'), attachment_path, source_url, status ('processando','pronta','erro'), is_shared boolean default false, share_token, pinned, created_at, updated_at.
- links: id, user_id, source_note_id, target_note_id, kind ('manual','wikilink','ia'), reason text, confidence numeric, status ('sugerida','aceita','rejeitada'), created_at. Único por par.
- tasks: id, user_id, note_id, text, due_date, done.
- Bucket privado "anexos" no Storage.

## Captura (o coração do app)
Uma caixa de captura sempre acessível (topo da área central e botão flutuante "+") que aceita:
1. Texto livre.
2. Áudio: gravar no navegador (MediaRecorder) ou enviar arquivo de áudio.
3. Imagens: enviar, colar (Ctrl+V) ou arrastar.
4. Arquivos: PDF, DOCX, TXT, MD.
5. Links: colar uma URL.
Ao enviar, a nota é criada com status 'processando' e aparece na hora; uma Edge Function "processar-nota" faz em segundo plano:
- Áudio → transcrição em português (Gemini com entrada de áudio). Guardar a transcrição no content.
- Imagem → descrição detalhada + todo texto visível (OCR). Mostrar a imagem no topo da nota.
- PDF/DOCX/TXT → extrair o texto (limitar a ~30 mil caracteres) e resumir.
- Link → buscar a página (fetch na Edge Function), extrair título, descrição, imagem og e o texto principal; resumir.
- Depois, análise com IA retornando JSON estruturado (tool calling): title, summary (2-3 frases), type, tags (3-6, minúsculas), tarefas com datas detectadas (ex.: "ligar para a Vanine quinta" → tarefa com data real calculada a partir de hoje), e entidades (pessoas, clientes, projetos).
- Ligações: enviar à IA a lista das notas existentes (id, título, resumo, tags; até as 150 mais recentes/relevantes por sobreposição de tags e palavras) e pedir até 6 notas relacionadas com motivo curto e confiança 0–1. Gravar como links status 'sugerida'. Confiança ≥ 0.85 já entra como 'aceita'.
- Ao final, status 'pronta'. Em caso de falha, status 'erro' com botão "Tentar de novo".
Mostrar o progresso com um indicador sutil na nota ("Transcrevendo…", "Analisando…", "Encontrando conexões…"), atualizado via Realtime.

## Notas
- Editor markdown com prévia ao vivo. Suporte a [[wikilinks]] com autocomplete de títulos ao digitar [[; ao salvar, wikilinks viram links kind 'wikilink'. Clicar abre a nota; wikilink para nota inexistente cria a nota.
- #tags no texto viram tags.
- Painel direito: "Ligações sugeridas" (cada uma com motivo e confiança, botões Aceitar / Rejeitar), "Backlinks" (notas que apontam para esta, com trecho), "Menções não ligadas" (notas que citam o título sem link, com botão Ligar), lista de tarefas da nota, e grafo local (vizinhos de 1 e 2 níveis).
- Botão "Reanalisar com IA" na nota.

## Grafo (visão principal)
- react-force-graph-2d, fundo escuro, nós como círculos coloridos por tipo, tamanho pelo número de ligações, rótulos aparecem ao dar zoom.
- Ao passar o mouse: destacar o nó e vizinhos, esmaecer o resto. Clique abre a nota.
- Arestas aceitas sólidas; sugestões de IA tracejadas e mais claras (com opção para ocultar).
- Filtros: por tipo, por tag, busca que destaca nós, "mostrar órfãs", controles de força (repulsão, distância) como no Obsidian.
- Legenda de cores por tipo.

## Busca
- Busca de texto completo (Postgres full text search em português sobre título, conteúdo, resumo e tags), com destaque dos trechos.

## Extras que tornam isso um segundo cérebro de verdade
- "Lampejo do dia": na página inicial, um cartão que traz uma nota antiga (mais de 14 dias) relacionada ao que foi capturado recentemente, com o motivo da conexão. Também uma lista de "Notas órfãs" (sem ligações) para revisar.
- Nota diária: botão "Hoje" cria/abre a nota do dia (tipo 'diario'), onde as capturas do dia são listadas automaticamente.
- Página "Tarefas": todas as tarefas extraídas, agrupadas por data (Atrasadas, Hoje, Próximos dias, Sem data), com link para a nota de origem.
- Compartilhar por nota: interruptor "Compartilhar" em cada nota (desligado por padrão). Ligado gera share_token e uma página pública somente leitura em /s/:token mostrando título, conteúdo e anexo (via URL assinada), sem expor outras notas nem os links. Uma tela "Compartilhadas" lista o que está público, com botão para revogar.
- Exportar tudo: baixar um .zip com uma pasta de arquivos .md (frontmatter com tipo, tags, datas; links como [[wikilinks]]), compatível com abrir no Obsidian.

## Dados iniciais
No primeiro login, criar automaticamente estas notas (já com tipo e tags) e as ligações aceitas indicadas, para o grafo não começar vazio:
- Clientes: "PROLAV" (higienização de estofados, Maceió), "Organize Consultoria" (RH, parceria com percentual), "Center Frios / 381 Distribuidora" (trabalho CLT), "Vanine, arquiteta" (negociação), "Clínica de fisioterapia" (proposta enviada), "Aida, fotógrafa" (proposta enviada).
- Projetos/áreas: "Consultoria de marketing", "Desafio 100 vídeos", "Segundo Cérebro", "Meta Ads (BM)", "Google Ads (MCC)".
- Conhecimento: "Playbook PROLAV", "Kit de marca PROLAV", "Fluxo Lovable → GitHub → Antigravity", "Precificação de consultoria", "Nicho: arquitetos de alto padrão".
- Ideias: "App de recibos e contratos para autônomos", "E-book / produto digital", "Vídeo: 3 erros de marketing de pequenas empresas".
- Ligações: PROLAV↔Consultoria de marketing, PROLAV↔Playbook PROLAV, PROLAV↔Kit de marca PROLAV, PROLAV↔Meta Ads (BM), PROLAV↔Google Ads (MCC), Organize↔Consultoria de marketing, Vanine↔Nicho: arquitetos de alto padrão, Vanine↔Precificação de consultoria, Clínica↔Precificação de consultoria, Aida↔Precificação de consultoria, Desafio 100 vídeos↔Vídeo: 3 erros…, Consultoria de marketing↔Precificação de consultoria, Segundo Cérebro↔Fluxo Lovable → GitHub → Antigravity, App de recibos↔Fluxo Lovable → GitHub → Antigravity.

## Qualidade
- Código organizado em componentes, tipado, com estados de carregamento e vazios bem desenhados, toasts de erro claros em português, e limites de tamanho de upload (áudio 25 MB, arquivos 20 MB, imagens 10 MB).
- Conecte o projeto ao GitHub se possível, para eu poder fazer os próximos ajustes fora do Lovable.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5492fd6a-c524-441d-a514-995184839718).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
