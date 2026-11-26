# Segundo Cérebro

@AGENTS.md

App pessoal e privado, estilo Obsidian, em português do Brasil: o usuário captura texto, áudio, imagem, arquivo ou link, e a IA transcreve, resume, etiqueta e sugere ligações com as notas existentes, mostradas num grafo.

A especificação completa está no `README.md` (é o prompt original). Quando o README e o código divergirem, o código vale mais.

## Regras

- Interface, mensagens de erro e textos da IA em português do Brasil.
- Edite o código aqui para não gastar créditos do Lovable. Banco de dados, migrações, segredos e conectores são do Lovable (veja `AGENTS.md`): quando precisar mudar o esquema, descreva a mudança e peça ao usuário para enviá-la ao Lovable.
- Nunca reescreva o histórico do git (sem force push, rebase ou amend em commits já enviados). Mantenha a branch funcionando.
- A IA sugere e o usuário decide: ligações de confiança alta entram sozinhas, as demais ficam como sugestão.
- Tudo é privado por padrão (RLS em todas as tabelas). Compartilhar é sempre uma escolha explícita, nota por nota.
- Exportar tudo em `.md` (compatível com Obsidian) tem de continuar funcionando.
- Não coloque dados de clientes, telefones ou valores de contrato em exemplos ou dados iniciais.
- Antes de dizer que terminou: rode build e lint e teste o fluxo alterado. Diga o que ficou sem testar.
