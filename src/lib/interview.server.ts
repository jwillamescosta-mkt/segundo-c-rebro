import { GatewayError } from "@lovable.dev/ai-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatText, chatTool } from "./pipeline.server";
import { transcribeWithFallbacks } from "./transcribe.server";
import { CORE_TAG, topicByKey } from "./core-utils";
import { mergeTags } from "./markdown-utils";
import { syncWikilinks } from "./wikilink-sync";

type DB = SupabaseClient<Database>;

function aiError(e: unknown, fallback: string) {
  console.error("entrevista", e);
  if (e instanceof GatewayError) {
    if (e.httpStatus === 402) return "Créditos de IA esgotados. Adicione créditos e tente de novo.";
    if (e.httpStatus === 429)
      return "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
  }
  return e instanceof Error && e.message.startsWith("Não consegui") ? e.message : fallback;
}

/** Transcreve uma resposta falada da entrevista (nada é gravado no banco). */
export async function transcribeAnswer(base64: string, ext: string) {
  try {
    const buf = Buffer.from(base64, "base64");
    const text = await transcribeWithFallbacks(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      ext,
      (s, p) => chatText(s, p as never),
    );
    return { ok: true as const, text };
  } catch (e) {
    return {
      ok: false as const,
      error: aiError(e, "Não consegui transcrever o áudio. Tente de novo ou digite."),
    };
  }
}

const schema = {
  type: "object",
  properties: {
    content: {
      type: "string",
      description: "A nota completa em markdown, começando com '# Título'.",
    },
    summary: { type: "string", description: "Resumo de 1 a 2 frases do que a nota diz." },
  },
  required: ["content", "summary"],
};

/** Transforma as respostas soltas de um tema numa nota-núcleo organizada. Só devolve a prévia: o usuário aprova antes de gravar. */
export async function draftCoreNote(db: DB, key: string, answer: string) {
  const topic = topicByKey(key);
  if (!topic) return { ok: false as const, error: "Tema desconhecido." };
  try {
    const { data: existing } = await db
      .from("notes")
      .select("content")
      .eq("title", topic.title)
      .maybeSingle();
    const draft = await chatTool<{ content: string; summary: string }>(
      "Você organiza o segundo cérebro pessoal do usuário, em português do Brasil. " +
        `Escreva a nota-núcleo "${topic.title}": um documento curto, denso e bem organizado em seções (##) com listas, que a IA vai ler antes de qualquer tarefa para entender o usuário. ` +
        "Use só o que o usuário disse (e a versão atual da nota, se houver: junte as duas, a resposta nova vale mais quando conflitar). Não invente nada. " +
        "Escreva em terceira pessoa, sem enrolação, sem repetir a pergunta. Corrija erros de transcrição óbvios. " +
        "Nunca inclua senhas, números de documentos ou de contas, telefones, endereços, dados de saúde de terceiros nem valores de contratos específicos de clientes: se aparecerem, omita. " +
        "Se citar pessoas, clientes ou projetos, use [[Nome]] para virarem ligações.",
      `${existing?.content ? `VERSÃO ATUAL DA NOTA:\n${existing.content.slice(0, 6000)}\n\n` : ""}PERGUNTAS DO TEMA:\n${topic.questions.map((q) => `- ${q}`).join("\n")}\n\nRESPOSTAS DO USUÁRIO (podem estar soltas, faladas):\n${answer.slice(0, 15000)}`,
      "salvar_nota_nucleo",
      schema,
    );
    const content = draft.content.trim().startsWith("#")
      ? draft.content.trim()
      : `# ${topic.title}\n\n${draft.content.trim()}`;
    return {
      ok: true as const,
      content,
      summary: draft.summary.trim().slice(0, 400),
      replaces: !!existing,
    };
  } catch (e) {
    return {
      ok: false as const,
      error: aiError(e, "Não consegui montar a nota agora. Tente de novo."),
    };
  }
}

/** Grava (ou atualiza) a nota-núcleo aprovada: fixada, com a tag do núcleo. */
export async function saveCoreNote(
  db: DB,
  userId: string,
  key: string,
  content: string,
  summary: string,
) {
  const topic = topicByKey(key);
  if (!topic) return { ok: false as const, error: "Tema desconhecido." };
  const { data: existing } = await db
    .from("notes")
    .select("id,tags")
    .eq("title", topic.title)
    .maybeSingle();
  const tags = mergeTags([CORE_TAG], key === "perfil" ? ["perfil"] : [], existing?.tags ?? []);
  const fields = { content, summary, tags, pinned: true, status: "pronta" };
  let id = existing?.id;
  if (id) {
    const { error } = await db.from("notes").update(fields).eq("id", id);
    if (error) return { ok: false as const, error: "Não consegui salvar a nota." };
  } else {
    const { data, error } = await db
      .from("notes")
      .insert({
        ...fields,
        user_id: userId,
        title: topic.title,
        type: "referencia",
        source_kind: "texto",
        entities: {},
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false as const, error: "Não consegui salvar a nota." };
    id = data.id;
  }
  await syncWikilinks(db, userId, id, content);
  return { ok: true as const, noteId: id, title: topic.title };
}
