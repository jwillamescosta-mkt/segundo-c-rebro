import { GatewayError } from "@lovable.dev/ai-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { INDEX_TAG } from "./brain-map";
import { indexTitle, INDEXABLE } from "./index-utils";
import { chatText } from "./pipeline.server";
import { syncWikilinks } from "./wikilink-sync";

type DB = SupabaseClient<Database>;

/** Prévia da nota-índice (MOC) de um tipo: a IA lê os resumos e as tarefas abertas e organiza. Nada é gravado. */
export async function draftIndex(db: DB, type: string) {
  const t = INDEXABLE.find((x) => x.value === type);
  if (!t) return { ok: false as const, error: "Tipo sem índice." };
  try {
    const { data: notes } = await db
      .from("notes")
      .select("id,title,summary,tags,updated_at")
      .eq("type", type)
      .not("tags", "cs", `{${INDEX_TAG}}`)
      .order("updated_at", { ascending: false })
      .limit(150);
    if (!notes?.length)
      return { ok: false as const, error: `Ainda não há notas de ${t.label.toLowerCase()}.` };
    const { data: tasks } = await db
      .from("tasks")
      .select("note_id,text,due_date")
      .eq("done", false)
      .in(
        "note_id",
        notes.map((n) => n.id),
      )
      .limit(300);
    const facts = notes
      .map((n) => {
        const open = (tasks ?? [])
          .filter((x) => x.note_id === n.id)
          .map((x) => `${x.text}${x.due_date ? ` (${x.due_date})` : ""}`);
        return `- [[${n.title}]] (atualizada ${n.updated_at.slice(0, 10)}; tags: ${n.tags.join(", ")}): ${n.summary ?? "(sem resumo)"}${open.length ? ` | Tarefas abertas: ${open.join("; ")}` : ""}`;
      })
      .join("\n");
    const body = await chatText(
      "Você organiza o segundo cérebro pessoal do usuário, em português do Brasil. " +
        `Escreva a nota-índice de ${t.label}: um mapa curto para a IA e o usuário acharem tudo sem abrir nota por nota. ` +
        "Agrupe em seções (##) que façam sentido para o tipo (ex.: clientes por situação: ativos, propostas, negociação, parados; projetos por andamento; aprendizados por tema). " +
        "Em cada item: [[Título exato]] — situação em poucas palavras — próxima ação (se houver tarefa aberta). " +
        "Inclua TODAS as notas da lista, sem inventar notas, fatos, valores nem datas. Termine com '## Atenção' listando o que está parado há mais de 30 dias, se houver. " +
        "Responda só com o markdown, sem o título principal.",
      [{ type: "text", text: `NOTAS DE ${t.label.toUpperCase()}:\n${facts}` }],
    );
    if (!body.trim()) throw new Error("A IA não respondeu.");
    return {
      ok: true as const,
      title: indexTitle(t.label),
      content: `# ${indexTitle(t.label)}\n\n${body.trim()}\n`,
      count: notes.length,
    };
  } catch (e) {
    console.error("indice", e);
    let error = "Não consegui montar o índice agora. Tente de novo.";
    if (e instanceof GatewayError) {
      if (e.httpStatus === 402)
        error = "Créditos de IA esgotados. Adicione créditos e tente de novo.";
      else if (e.httpStatus === 429)
        error = "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
    }
    return { ok: false as const, error };
  }
}

/** Grava (ou substitui) a nota-índice aprovada. */
export async function saveIndex(db: DB, userId: string, type: string, content: string) {
  const t = INDEXABLE.find((x) => x.value === type);
  if (!t) return { ok: false as const, error: "Tipo sem índice." };
  const title = indexTitle(t.label);
  const { data: existing } = await db.from("notes").select("id").eq("title", title).maybeSingle();
  const fields = {
    content,
    summary: `Índice de ${t.label.toLowerCase()} escrito pela IA: situação e próxima ação de cada nota.`,
    tags: [INDEX_TAG, type],
    status: "pronta",
    entities: { indice: type },
  };
  let id = existing?.id;
  if (id) {
    const { error } = await db.from("notes").update(fields).eq("id", id);
    if (error) return { ok: false as const, error: "Não consegui salvar o índice." };
  } else {
    const { data, error } = await db
      .from("notes")
      .insert({ ...fields, user_id: userId, title, type: "referencia", source_kind: "texto" })
      .select("id")
      .single();
    if (error || !data) return { ok: false as const, error: "Não consegui salvar o índice." };
    id = data.id;
  }
  await syncWikilinks(db, userId, id, content);
  return { ok: true as const, noteId: id };
}
