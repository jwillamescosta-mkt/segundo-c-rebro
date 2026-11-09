import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { syncWikilinks } from "./wikilink-sync";
import { PROFILE_TEMPLATE, PROFILE_TITLE } from "./split-utils";

export const RULES_TITLE = "Regras do meu cérebro";

export const RULES_CONTENT = `# Regras do meu cérebro

Ligada a [[Segundo Cérebro]]. Releia antes de capturar algo sensível.

## O que colocar
- **Ideias soltas e insights**, mesmo pela metade.
- **Decisões e o motivo delas**: por que aceitei um preço, escolhi uma ferramenta ou fechei um combinado.
- **Clientes e leads**: o que foi combinado, a próxima ação, o que funcionou e o que não funcionou.
- **Playbooks, roteiros e prompts** que deram certo.
- **Aprendizados** de vídeos, aulas, livros e conversas, com as minhas palavras.
- **Material do desafio**: ideias de vídeo, o que gravei e o que aprendi em cada dia.
- **Links, prints e PDFs**, com uma linha dizendo por que guardei.
- **Tarefas ditas por áudio**, como "ligar para a Vanine quinta".

## O que não colocar
- **Senhas, chaves de API e códigos de verificação.** Usar um gerenciador de senhas.
- **Números de documentos e de contas**: CPF, RG, cartão, conta bancária.
- **Dados pessoais de terceiros**: telefone, endereço, fotos de crianças de clientes, informações de saúde de outras pessoas.
- **Contratos e conversas confidenciais de clientes na íntegra.** Guardar só o resumo do que importa.
- **Desabafos e anotações íntimas** que eu não quero que uma IA leia. Todo texto, áudio e imagem passa por IA para ser analisado.

## Regras práticas
1. Antes de colar algo: eu me incomodaria se isso vazasse ou fosse lido por outra pessoa? Se sim, não vai.
2. Guardar o **resumo**, não o documento inteiro.
3. Interruptor de compartilhar desligado. Só ligar em notas que eu escreveria num post.
4. Não colocar notas reais no GitHub. O repositório guarda o código, não as minhas anotações.
5. Exportar em .md de tempos em tempos, como cópia de segurança.

#regras #segundo-cerebro
`;

/** Nota "Quem sou eu": modelo para o usuário preencher; a IA a lê antes de analisar cada captura. */
const profileRuns = new Map<string, Promise<boolean>>();
export function ensureProfileNote(db: SupabaseClient<Database>, userId: string) {
  const running = profileRuns.get(userId) ?? createProfileNote(db, userId).catch(() => false);
  profileRuns.set(userId, running);
  return running;
}

async function createProfileNote(db: SupabaseClient<Database>, userId: string) {
  const { data: found, error } = await db.from("notes").select("id").eq("title", PROFILE_TITLE).limit(1);
  if (error || found?.length) return false;
  const { error: insErr } = await db.from("notes").insert({
    user_id: userId,
    title: PROFILE_TITLE,
    content: PROFILE_TEMPLATE,
    type: "referencia",
    tags: ["perfil"],
    source_kind: "texto",
    status: "pronta",
    pinned: true,
    summary: "Perfil lido pela IA para entender o contexto das capturas: família, trabalho, rotina e papéis.",
    entities: {},
  });
  return !insErr;
}

// Uma execução por usuário e aba (evita corrida com o efeito duplo do React em desenvolvimento).
const runs = new Map<string, Promise<boolean>>();

/**
 * Complemento do seed (a função SQL do primeiro login fica nas migrações, que não mexemos):
 * cria a nota fixada de regras só se o usuário ainda não tiver uma com esse título.
 * Nunca altera nem apaga notas existentes. Devolve true quando criou.
 */
export function ensureRulesNote(db: SupabaseClient<Database>, userId: string) {
  const running = runs.get(userId) ?? (async () => {
    const { data: found, error } = await db.from("notes").select("id").eq("title", RULES_TITLE).limit(1);
    if (error || found?.length) return false;
    const { data: note, error: insErr } = await db
      .from("notes")
      .insert({
        user_id: userId,
        title: RULES_TITLE,
        content: RULES_CONTENT,
        type: "referencia",
        tags: ["regras", "segundo-cerebro", "privacidade"],
        source_kind: "texto",
        status: "pronta",
        pinned: true,
        summary: "Regras de captura do segundo cérebro: o que guardar, o que nunca guardar e cinco regras práticas.",
        entities: {},
      })
      .select("id")
      .single();
    if (insErr || !note) return false;
    // Cria a ligação aceita (kind "wikilink") para a nota "Segundo Cérebro", se ela existir.
    await syncWikilinks(db, userId, note.id, RULES_CONTENT);
    return true;
  })().catch(() => false);
  runs.set(userId, running);
  return running;
}
