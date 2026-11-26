import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateBriefing } from "./briefing.server";
import { demoteHeadings, END_OF_DAY_HEADING, upsertSection } from "./briefing-utils";
import { INDEX_TAG } from "./brain-map";
import { CORE_TAG, CORE_TOPICS } from "./core-utils";
import { PENDING_PROGRESS } from "./capture-utils";
import { chatText, runPipeline, todayContext } from "./pipeline.server";
import { runSmartPass } from "./smart.server";
import { addDaysISO, formatDateBR, localDate } from "./tasks-utils";
import {
  cleanupReport,
  findDuplicates,
  LONG_NOTE,
  OLD_OVERDUE_DAYS,
  STALE_INDEX_DAYS,
  type Routine,
} from "./routine-utils";
import { syncWikilinks } from "./wikilink-sync";

type DB = SupabaseClient<Database>;
const BR = "T00:00:00-03:00";
const MAX_QUEUE = 10;

/** Nota do dia (cria se faltar). */
async function dailyNote(db: DB, userId: string, iso: string) {
  const { data } = await db.from("notes").select("id,content").eq("daily_date", iso).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db
    .from("notes")
    .insert({
      user_id: userId,
      title: `Diário ${formatDateBR(iso)}`,
      type: "diario",
      daily_date: iso,
      tags: ["diario"],
      content: `# Diário ${formatDateBR(iso)}\n\n`,
      status: "pronta",
      entities: {},
    })
    .select("id,content")
    .single();
  if (error) throw error;
  return created;
}

/** Processa as capturas que chegaram com o app fechado (Atalhos, conector). */
async function drainQueue(db: DB, userId: string) {
  const { data } = await db
    .from("notes")
    .select("id")
    .eq("status", "processando")
    .eq("progress", PENDING_PROGRESS)
    .order("created_at")
    .limit(MAX_QUEUE);
  let done = 0;
  for (const n of data ?? []) {
    try {
      await runPipeline(db, userId, n.id, "full");
      done++;
    } catch (e) {
      console.error("rotina: fila", n.id, e);
    }
  }
  return done;
}

/** Fim do dia: fila processada, conexões feitas e o resumo do dia no diário, com as pendências de amanhã. */
async function endOfDay(db: DB, userId: string) {
  const queued = await drainQueue(db, userId);
  const smart = await runSmartPass(db, userId);
  const today = todayContext();
  const tomorrow = addDaysISO(today.iso, 1);
  const [notes, tasksOpen, tasksDone, events] = await Promise.all([
    db
      .from("notes")
      .select("title,type,summary")
      .neq("type", "diario")
      .gte("created_at", today.iso + BR)
      .order("created_at")
      .limit(60),
    db
      .from("tasks")
      .select("text,due_date")
      .eq("done", false)
      .lte("due_date", tomorrow)
      .order("due_date")
      .limit(40),
    db
      .from("tasks")
      .select("text")
      .eq("done", true)
      .gte("created_at", addDaysISO(today.iso, -7) + BR)
      .limit(40),
    db
      .from("events")
      .select("title,starts_at")
      .eq("status", "confirmado")
      .gte("starts_at", today.iso + BR)
      .lte("starts_at", tomorrow + "T23:59:59-03:00")
      .order("starts_at")
      .limit(30),
  ]);
  const list = (rows: string[]) => (rows.length ? rows.join("\n") : "(nada)");
  const facts = [
    `CAPTURAS DE HOJE:\n${list((notes.data ?? []).map((n) => `- [[${n.title}]] (${n.type}): ${n.summary ?? ""}`))}`,
    `COMPROMISSOS DE HOJE E AMANHÃ:\n${list((events.data ?? []).map((e) => `- ${e.title} — ${formatDateBR(localDate(e.starts_at))}`))}`,
    `TAREFAS ABERTAS ATÉ AMANHÃ:\n${list((tasksOpen.data ?? []).map((t) => `- ${t.due_date! < today.iso ? "[ATRASADA] " : ""}${t.text} — ${formatDateBR(t.due_date!)}`))}`,
    `TAREFAS CONCLUÍDAS RECENTEMENTE:\n${list((tasksDone.data ?? []).map((t) => `- ${t.text}`))}`,
  ].join("\n\n");
  const text = (notes.data ?? []).length
    ? demoteHeadings(
        await chatText(
          `Você é o segundo cérebro pessoal do usuário e fecha o dia dele. Hoje é ${today.human}. Escreva em português do Brasil, em markdown, curto. ` +
            "Use só os dados fornecidos; cite notas com [[Título]] exatamente como aparecem; não invente nada. " +
            "Seções (título ###): 'O que aconteceu' (3 a 6 itens), 'Decisões e aprendizados' (só se houver nas capturas), 'Pendências para amanhã' (tarefas e compromissos, as atrasadas primeiro) e 'Uma ideia' (uma conexão entre as capturas de hoje e o que está aberto).",
          [{ type: "text", text: facts }],
        ),
      )
    : "Nenhuma captura hoje.\n\n### Pendências para amanhã\n" +
      list((tasksOpen.data ?? []).map((t) => `- ${t.text} — ${formatDateBR(t.due_date!)}`));
  const daily = await dailyNote(db, userId, today.iso);
  const content = upsertSection(daily.content, END_OF_DAY_HEADING, text);
  await db.from("notes").update({ content }).eq("id", daily.id);
  await syncWikilinks(db, userId, daily.id, content);
  return { noteId: daily.id, queued, smart: smart.ok ? smart.processed : 0 };
}

/** Faxina de sexta: só aponta o que arrumar, numa nota com caixas. Nada é apagado nem alterado. */
async function cleanup(db: DB, userId: string) {
  const today = todayContext();
  const [all, links, tasks, suggestions] = await Promise.all([
    db.from("notes").select("id,title,type,tags,summary,status,updated_at,content").limit(5000),
    db
      .from("links")
      .select("source_note_id,target_note_id")
      .neq("status", "rejeitada")
      .limit(20000),
    db
      .from("tasks")
      .select("text,due_date")
      .eq("done", false)
      .lt("due_date", addDaysISO(today.iso, -OLD_OVERDUE_DAYS))
      .order("due_date")
      .limit(30),
    db.from("links").select("id", { count: "exact", head: true }).eq("status", "sugerida"),
  ]);
  const notes = (all.data ?? []).filter((n) => !n.tags.includes("faxina"));
  const linked = new Set((links.data ?? []).flatMap((l) => [l.source_note_id, l.target_note_id]));
  const newestByType = new Map<string, string>();
  for (const n of notes)
    if (!n.tags.includes(INDEX_TAG) && n.updated_at > (newestByType.get(n.type) ?? ""))
      newestByType.set(n.type, n.updated_at);
  const staleMs = STALE_INDEX_DAYS * 864e5;
  const md = cleanupReport({
    dateBR: formatDateBR(today.iso),
    duplicates: findDuplicates(notes),
    errors: notes.filter((n) => n.status === "erro"),
    longNoSummary: notes
      .filter((n) => n.type !== "diario" && !n.summary && n.content.length > LONG_NOTE)
      .map((n) => ({ title: n.title, size: n.content.length })),
    staleIndexes: notes.filter((n) => {
      if (!n.tags.includes(INDEX_TAG)) return false;
      const type = n.tags.find((t) => t !== INDEX_TAG) ?? "";
      const newest = newestByType.get(type);
      return !!newest && +new Date(newest) - +new Date(n.updated_at) > staleMs;
    }),
    oldOverdue: (tasks.data ?? []).map((t) => ({ text: t.text, due: formatDateBR(t.due_date!) })),
    missingCore: CORE_TOPICS.filter(
      (t) => !notes.some((n) => n.title === t.title && n.tags.includes(CORE_TAG)),
    ).map((t) => t.title),
    pendingSuggestions: suggestions.count ?? 0,
    orphans: notes.filter((n) => n.type !== "diario" && !linked.has(n.id)).length,
  });
  const title = `Faxina da semana ${formatDateBR(today.iso)}`;
  const { data: existing } = await db.from("notes").select("id").eq("title", title).maybeSingle();
  if (existing) {
    await db.from("notes").update({ content: md }).eq("id", existing.id);
    return { noteId: existing.id };
  }
  const { data, error } = await db
    .from("notes")
    .insert({
      user_id: userId,
      title,
      type: "diario",
      tags: ["faxina"],
      content: md,
      status: "pronta",
      summary: "Pontos para arrumar no cérebro nesta semana.",
      entities: {},
    })
    .select("id")
    .single();
  if (error) throw error;
  // Sem syncWikilinks: a faxina cita muitas notas e viraria um "hub" falso no grafo.
  return { noteId: data.id };
}

/** Roda uma rotina para um usuário (com o cliente da sessão dele, sob RLS). */
export async function runRoutine(db: DB, userId: string, routine: Routine) {
  if (routine === "manha") return generateBriefing(db, userId, "diario");
  if (routine === "fim-do-dia") return { ok: true as const, ...(await endOfDay(db, userId)) };
  return { ok: true as const, ...(await cleanup(db, userId)) };
}
