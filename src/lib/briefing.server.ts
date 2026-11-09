import { GatewayError } from "@lovable.dev/ai-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatText, todayContext } from "./pipeline.server";
import { syncWikilinks } from "./wikilink-sync";
import { demoteHeadings, upsertBriefing } from "./briefing-utils";
import { addDaysISO, formatDateBR, localDate, localTime } from "./tasks-utils";

type DB = SupabaseClient<Database>;
const BR = "T00:00:00-03:00";

const list = (rows: string[], empty: string) => (rows.length ? rows.join("\n") : empty);

/** Briefing do dia (vai para o diário) ou revisão da semana (vira uma nota). Retorna o id da nota. */
export async function generateBriefing(db: DB, userId: string, kind: "diario" | "semanal") {
  try {
    const today = todayContext();
    const weekAgo = addDaysISO(today.iso, -7);
    const soon = addDaysISO(today.iso, kind === "diario" ? 2 : 7);

    const [tasks, events, cards, recent, pendingLinks, doneTasks, reviewed, newLinks] = await Promise.all([
      db.from("tasks").select("text,due_date,due_time").eq("done", false).lte("due_date", soon).order("due_date").limit(40),
      db.from("events").select("title,starts_at,all_day").eq("status", "confirmado").gte("starts_at", today.iso + BR).lte("starts_at", soon + "T23:59:59-03:00").order("starts_at").limit(40),
      db.from("cards").select("id", { count: "exact", head: true }).lte("due", today.iso),
      db.from("notes").select("title,type,summary,tags").neq("type", "diario").gte("created_at", (kind === "diario" ? addDaysISO(today.iso, -3) : weekAgo) + BR).order("created_at", { ascending: false }).limit(40),
      db.from("links").select("id", { count: "exact", head: true }).eq("status", "sugerida"),
      kind === "semanal" ? db.from("tasks").select("text").eq("done", true).gte("created_at", weekAgo + BR).limit(40) : Promise.resolve({ data: [] }),
      kind === "semanal" ? db.from("cards").select("id", { count: "exact", head: true }).gte("last_reviewed_at", weekAgo + BR) : Promise.resolve({ count: 0 }),
      kind === "semanal" ? db.from("links").select("id", { count: "exact", head: true }).eq("status", "aceita").gte("created_at", weekAgo + BR) : Promise.resolve({ count: 0 }),
    ]);

    const facts = [
      `TAREFAS PENDENTES (até ${formatDateBR(soon)}):\n${list((tasks.data ?? []).map((t) => `- ${t.due_date! < today.iso ? "[ATRASADA] " : ""}${t.text} — ${formatDateBR(t.due_date!)}${t.due_time ? " " + t.due_time.slice(0, 5) : ""}`), "(nenhuma)")}`,
      `COMPROMISSOS:\n${list((events.data ?? []).map((e) => `- ${e.title} — ${formatDateBR(localDate(e.starts_at))}${e.all_day ? "" : " " + localTime(e.starts_at)}`), "(nenhum)")}`,
      `NOTAS RECENTES:\n${list((recent.data ?? []).map((n) => `- [[${n.title}]] (${n.type}; ${(n.tags ?? []).join(", ")}): ${n.summary ?? ""}`), "(nenhuma)")}`,
      `FLASHCARDS PARA REVISAR HOJE: ${cards.count ?? 0}`,
      `LIGAÇÕES SUGERIDAS PELA IA AGUARDANDO DECISÃO: ${pendingLinks.count ?? 0}`,
      ...(kind === "semanal"
        ? [
            // shortcut: tasks não tem data de conclusão; usa as criadas na semana e já feitas. Adicionar done_at para ser exato.
            `TAREFAS CRIADAS NA SEMANA E JÁ CONCLUÍDAS:\n${list((doneTasks.data ?? []).map((t) => `- ${t.text}`), "(nenhuma)")}`,
            `REVISÕES DE FLASHCARDS NA SEMANA: ${reviewed.count ?? 0}`,
            `NOVAS LIGAÇÕES ACEITAS NA SEMANA: ${newLinks.count ?? 0}`,
          ]
        : []),
    ].join("\n\n");

    const system =
      `Você é o segundo cérebro pessoal do usuário e o ajuda a ser mais produtivo, aprender mais e crescer profissionalmente. Hoje é ${today.human}. ` +
      "Escreva em português do Brasil, em markdown, curto e acionável. Use só os dados fornecidos; cite notas com [[Título]] exatamente como aparecem. Não invente tarefas, datas nem notas. " +
      (kind === "diario"
        ? "Estruture com as seções (título ###): 'Foco do dia' (no máximo 3 prioridades, atrasadas primeiro, com o porquê), 'Agenda', 'Aprender hoje' (flashcards e o que revisar), 'Um insight' (uma conexão não óbvia entre notas recentes) e 'Pergunta do dia' (uma pergunta de reflexão)."
        : "Estruture com as seções (título ###): 'O que avancei', 'O que aprendi' (com as notas), 'Conexões e ideias' (padrões entre as notas da semana), 'O que ficou parado', 'Prioridades da próxima semana' (até 5, concretas) e 'Um hábito para melhorar'.");

    const text = demoteHeadings(await chatText(system, [{ type: "text", text: facts }]));
    if (!text.trim()) throw new Error("A IA não respondeu.");

    let noteId: string;
    let content: string;
    if (kind === "diario") {
      const { data: daily } = await db.from("notes").select("id,content").eq("daily_date", today.iso).maybeSingle();
      const base = daily?.content ?? `# Diário ${formatDateBR(today.iso)}\n\n`;
      content = upsertBriefing(base, text);
      if (daily) {
        noteId = daily.id;
        await db.from("notes").update({ content }).eq("id", noteId);
      } else {
        const { data, error } = await db
          .from("notes")
          .insert({ user_id: userId, title: `Diário ${formatDateBR(today.iso)}`, type: "diario", daily_date: today.iso, tags: ["diario"], content, status: "pronta", entities: {} })
          .select("id")
          .single();
        if (error) throw error;
        noteId = data.id;
      }
    } else {
      const title = `Revisão semanal ${formatDateBR(weekAgo)} a ${formatDateBR(today.iso)}`;
      content = `# ${title}\n\n${text.trim()}\n\n#revisao-semanal\n`;
      const { data, error } = await db
        .from("notes")
        .insert({ user_id: userId, title, type: "diario", tags: ["revisao-semanal"], content, status: "pronta", entities: {} })
        .select("id")
        .single();
      if (error) throw error;
      noteId = data.id;
    }
    await syncWikilinks(db, userId, noteId, content);
    return { ok: true as const, noteId };
  } catch (e) {
    console.error("briefing", kind, e);
    let error = "Não foi possível gerar agora. Tente de novo.";
    if (e instanceof GatewayError) {
      if (e.httpStatus === 402) error = "Créditos de IA esgotados. Adicione créditos e tente de novo.";
      else if (e.httpStatus === 429) error = "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
    }
    return { ok: false as const, error };
  }
}
