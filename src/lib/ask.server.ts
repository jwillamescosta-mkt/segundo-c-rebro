import { GatewayError } from "@lovable.dev/ai-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatText, todayContext } from "./pipeline.server";
import { askTerms } from "./ask-utils";
import { addDaysISO, formatDateBR, localDate, localTime } from "./tasks-utils";

type DB = SupabaseClient<Database>;
export interface AskTurn {
  role: "user" | "assistant";
  content: string;
}

const MAX_NOTES = 12;
const NOTE_CHARS = 3000;

/** "Pergunte ao seu cérebro": busca as notas mais relevantes e responde citando-as. */
export async function askBrain(db: DB, question: string, history: AskTurn[]) {
  try {
    const lastUser = [...history].reverse().find((t) => t.role === "user")?.content ?? "";
    const terms = askTerms(`${question} ${lastUser}`);

    const ids: string[] = [];
    if (terms.length) {
      const { data: hits } = await db.rpc("search_notes", { q: terms.join(" or ") });
      for (const h of hits ?? []) if (ids.length < MAX_NOTES) ids.push(h.id);
    }
    // Sem resultado na busca: usa as notas mais recentes como contexto.
    if (ids.length < 4) {
      const { data: recent } = await db.from("notes").select("id").order("updated_at", { ascending: false }).limit(8);
      for (const r of recent ?? []) if (!ids.includes(r.id) && ids.length < MAX_NOTES) ids.push(r.id);
    }
    const { data: rows } = ids.length
      ? await db.from("notes").select("id,title,type,tags,summary,content,updated_at").in("id", ids)
      : { data: [] };
    const notes = ids.map((id) => (rows ?? []).find((r) => r.id === id)).filter((n): n is NonNullable<typeof n> => !!n);

    // Agenda dos próximos 14 dias e tarefas atrasadas, para perguntas sobre prioridades e prazos.
    const today = todayContext();
    const until = addDaysISO(today.iso, 14);
    const [{ data: tasks }, { data: events }] = await Promise.all([
      db.from("tasks").select("text,due_date,due_time").eq("done", false).lte("due_date", until).order("due_date").limit(60),
      db.from("events").select("title,starts_at,all_day,status").gte("starts_at", `${today.iso}T00:00:00-03:00`).lte("starts_at", `${until}T23:59:59-03:00`).order("starts_at").limit(60),
    ]);
    const agenda = [
      ...(tasks ?? []).map((t) => `- Tarefa${t.due_date! < today.iso ? " (ATRASADA)" : ""}: ${t.text} — ${formatDateBR(t.due_date!)}${t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""}`),
      ...(events ?? []).map((e) => `- Compromisso${e.status === "sugerido" ? " (não confirmado)" : ""}: ${e.title} — ${formatDateBR(localDate(e.starts_at))}${e.all_day ? "" : ` ${localTime(e.starts_at)}`}`),
    ].join("\n");

    const context = notes
      .map((n) => `### [[${n.title}]] (${n.type}; tags: ${(n.tags ?? []).join(", ")})\n${n.summary ? `Resumo: ${n.summary}\n` : ""}${(n.content ?? "").slice(0, NOTE_CHARS)}`)
      .join("\n\n---\n\n");

    const convo = history
      .slice(-6)
      .map((t) => `${t.role === "user" ? "Usuário" : "Assistente"}: ${t.content.slice(0, 2000)}`)
      .join("\n\n");

    const system =
      `Você é o segundo cérebro pessoal do usuário: um assistente que ajuda a pensar, estudar, decidir e produzir mais. Hoje é ${today.human} (${today.iso}). ` +
      "Responda em português do Brasil, de forma direta e útil, em markdown. " +
      "Use as NOTAS abaixo como fonte principal e cite cada nota usada com o título exato entre colchetes duplos, por exemplo [[Título da nota]]. " +
      "Nunca invente o conteúdo de uma nota nem cite títulos que não estão na lista. " +
      "Se as notas não bastarem, diga isso claramente e, se ajudar, complete com conhecimento geral marcando o trecho com '(conhecimento geral)'. " +
      "Quando fizer sentido, termine com 1 a 3 próximos passos práticos ou conexões entre notas que o usuário ainda não fez.";

    const user =
      `NOTAS RELEVANTES:\n\n${context || "(nenhuma nota encontrada)"}\n\n` +
      `AGENDA (próximos 14 dias e atrasadas):\n${agenda || "(nada marcado)"}\n\n` +
      (convo ? `CONVERSA ATÉ AGORA:\n${convo}\n\n` : "") +
      `PERGUNTA: ${question}`;

    const answer = await chatText(system, [{ type: "text", text: user }]);
    if (!answer) throw new Error("A IA não respondeu.");
    const cited = notes.filter((n) => answer.includes(`[[${n.title}`));
    return { ok: true as const, answer, sources: cited.map((n) => ({ id: n.id, title: n.title, type: n.type })) };
  } catch (e) {
    console.error("perguntar", e);
    let error = "Não consegui responder agora. Tente de novo.";
    if (e instanceof GatewayError) {
      if (e.httpStatus === 402) error = "Créditos de IA esgotados. Adicione créditos e tente de novo.";
      else if (e.httpStatus === 429) error = "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
    }
    return { ok: false as const, error };
  }
}
