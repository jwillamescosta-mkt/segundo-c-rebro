/**
 * Agenda assinável (.ics, RFC 5545) para o Calendário do iPhone, Google Agenda etc.
 * Tarefas com dia e hora → evento de 30 min com alerta 15 min antes.
 * Tarefas só com dia → evento de dia inteiro com alerta às 8h (horário de Brasília) desse dia.
 * Compromissos confirmados → como estão, com alerta 15 min antes (ou às 8h, se forem de dia inteiro).
 */
import { addDaysISO, localToTimestamptz } from "./tasks-utils";

export const MORNING_ALERT = "08:00";

export interface IcsTask {
  id: string;
  text: string;
  due_date: string | null;
  due_time: string | null;
  note_id: string | null;
}
export interface IcsEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  note_id: string | null;
}

/** Texto seguro dentro de uma propriedade iCalendar. */
export function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Linhas de no máximo 75 bytes, continuadas com espaço (sem partir um caractere acentuado no meio). */
export function icsFold(line: string) {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** Instante em UTC no formato iCalendar (20261111T180000Z). */
export function icsUtc(iso: string | Date) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
const icsDate = (d: string) => d.replace(/-/g, "");

function block(uid: string, summary: string, when: string[], alarm: string, url: string | null, stamp: string) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@segundo-cerebro`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${icsEscape(summary)}`,
    ...(url ? [`URL:${url}`, `DESCRIPTION:${icsEscape(`Abrir no Segundo Cérebro: ${url}`)}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(summary)}`,
    alarm,
    "END:VALARM",
    "END:VEVENT",
  ];
}

export function buildIcs(tasks: IcsTask[], events: IcsEvent[], origin: string, now = new Date()) {
  const stamp = icsUtc(now);
  const link = (noteId: string | null) => (noteId ? `${origin}/nota/${noteId}` : null);
  const morning = (date: string) => `TRIGGER;VALUE=DATE-TIME:${icsUtc(localToTimestamptz(date, MORNING_ALERT)!)}`;
  const lines: string[] = [];

  for (const t of tasks) {
    if (!t.due_date) continue;
    const time = t.due_time?.slice(0, 5) ?? null;
    if (time) {
      const start = localToTimestamptz(t.due_date, time)!;
      const end = new Date(+new Date(start) + 30 * 60_000);
      lines.push(...block(`tarefa-${t.id}`, t.text, [`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(end)}`], "TRIGGER:-PT15M", link(t.note_id), stamp));
    } else {
      const when = [`DTSTART;VALUE=DATE:${icsDate(t.due_date)}`, `DTEND;VALUE=DATE:${icsDate(addDaysISO(t.due_date, 1))}`];
      lines.push(...block(`tarefa-${t.id}`, t.text, when, morning(t.due_date), link(t.note_id), stamp));
    }
  }

  for (const e of events) {
    if (e.all_day) {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(e.starts_at));
      const when = [`DTSTART;VALUE=DATE:${icsDate(day)}`, `DTEND;VALUE=DATE:${icsDate(addDaysISO(day, 1))}`];
      lines.push(...block(`evento-${e.id}`, e.title, when, morning(day), link(e.note_id), stamp));
    } else {
      const end = e.ends_at ?? new Date(+new Date(e.starts_at) + 60 * 60_000).toISOString();
      lines.push(...block(`evento-${e.id}`, e.title, [`DTSTART:${icsUtc(e.starts_at)}`, `DTEND:${icsUtc(end)}`], "TRIGGER:-PT15M", link(e.note_id), stamp));
    }
  }

  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Segundo Cerebro//Agenda//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Segundo Cérebro",
      "X-WR-TIMEZONE:America/Sao_Paulo",
      "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
      "X-PUBLISHED-TTL:PT15M",
      ...lines,
      "END:VCALENDAR",
    ]
      .map(icsFold)
      .join("\r\n") + "\r\n"
  );
}
