export type TaskGroupKey = "atrasadas" | "hoje" | "proximos" | "sem_data";

export const TASK_GROUPS: { key: TaskGroupKey; label: string }[] = [
  { key: "atrasadas", label: "Atrasadas" },
  { key: "hoje", label: "Hoje" },
  { key: "proximos", label: "Próximos dias" },
  { key: "sem_data", label: "Sem data" },
];

export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Status de um evento extraído pela IA: mesma régua das ligações (≥ 0,85 entra sozinho). */
export function eventStatusForConfidence(confidence: number): "confirmado" | "sugerido" {
  return confidence >= 0.85 ? "confirmado" : "sugerido";
}

export function taskGroup(due: string | null, today: string): TaskGroupKey {
  if (!due) return "sem_data";
  if (due < today) return "atrasadas";
  if (due === today) return "hoje";
  return "proximos";
}

export function groupTasks<T extends { due_date: string | null }>(tasks: T[], today: string) {
  const out: Record<TaskGroupKey, T[]> = { atrasadas: [], hoje: [], proximos: [], sem_data: [] };
  for (const t of tasks) out[taskGroup(t.due_date, today)].push(t);
  out.proximos.sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  out.atrasadas.sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  return out;
}

export const TZ = "America/Sao_Paulo";

/** "YYYY-MM-DD" + "HH:MM" (horário de Brasília) → timestamptz. Null se inválido. */
// shortcut: offset fixo -03:00 (Brasil sem horário de verão desde 2019); trocar por lib de fuso se voltar ou se houver outros fusos.
export function localToTimestamptz(date: string | null | undefined, time?: string | null) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "00:00";
  return `${date}T${t}:00-03:00`;
}

export function cleanTime(time: string | null | undefined) {
  return time && /^([01]\d|2[0-3]):[0-5]\d/.test(time) ? time.slice(0, 5) : null;
}

/** Data local (YYYY-MM-DD) e hora (HH:MM) de um timestamptz, no fuso do app. */
export function localDate(ts: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ts));
}
export function localTime(ts: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts));
}

export function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface AgendaItem {
  kind: "tarefa" | "evento";
  id: string;
  date: string;
  time: string | null;
  title: string;
  note_id: string | null;
  suggested?: boolean;
  done?: boolean;
}

/** Junta tarefas com data e eventos num mapa dia → itens ordenados (sem hora primeiro). */
export function buildAgenda(
  tasks: { id: string; text: string; due_date: string | null; due_time: string | null; note_id: string | null; done: boolean }[],
  events: { id: string; title: string; starts_at: string; all_day: boolean; note_id: string | null; status: string }[],
  from: string,
  to: string,
) {
  const items: AgendaItem[] = [];
  for (const t of tasks) {
    if (!t.due_date || t.due_date < from || t.due_date > to) continue;
    items.push({ kind: "tarefa", id: t.id, date: t.due_date, time: cleanTime(t.due_time), title: t.text, note_id: t.note_id, done: t.done });
  }
  for (const e of events) {
    const date = localDate(e.starts_at);
    if (date < from || date > to) continue;
    items.push({ kind: "evento", id: e.id, date, time: e.all_day ? null : localTime(e.starts_at), title: e.title, note_id: e.note_id, suggested: e.status === "sugerido" });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  const byDay = new Map<string, AgendaItem[]>();
  for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  return byDay;
}

/** Agenda.md do export (Obsidian): tarefas como checklist, compromissos como lista, por dia. */
export function agendaToMarkdown(
  tasks: Parameters<typeof buildAgenda>[0],
  events: Parameters<typeof buildAgenda>[1],
  titleOf: (noteId: string | null) => string | null,
) {
  const all = buildAgenda(tasks, events, "0000-01-01", "9999-12-31");
  const lines = ["# Agenda", ""];
  for (const [date, items] of all) {
    lines.push(`## ${formatDateBR(date)}`, "");
    for (const i of items) {
      const box = i.kind === "tarefa" ? `- [${i.done ? "x" : " "}] ` : "- ";
      const note = titleOf(i.note_id);
      lines.push(`${box}${i.time ? `${i.time} ` : ""}${i.title}${i.suggested ? " (sugestão)" : ""}${note ? ` — [[${note}]]` : ""}`);
    }
    lines.push("");
  }
  const undated = tasks.filter((t) => !t.due_date);
  if (undated.length) {
    lines.push("## Sem data", "");
    for (const t of undated) lines.push(`- [${t.done ? "x" : " "}] ${t.text}${titleOf(t.note_id) ? ` — [[${titleOf(t.note_id)}]]` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function formatDayBR(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long" }).format(new Date(`${iso}T12:00:00Z`));
}

export function formatDateBR(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
