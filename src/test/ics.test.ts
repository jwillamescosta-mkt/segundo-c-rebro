import { describe, expect, it } from "vitest";
import { buildIcs, icsEscape, icsFold, icsUtc } from "@/lib/ics-utils";

const now = new Date("2026-11-11T12:00:00Z");
const ics = (tasks: Parameters<typeof buildIcs>[0], events: Parameters<typeof buildIcs>[1] = []) => buildIcs(tasks, events, "https://app.exemplo", now);
const task = (o: Partial<Parameters<typeof buildIcs>[0][number]> = {}) => ({ id: "t1", text: "Ligar para o cliente", due_date: "2026-11-12", due_time: null, note_id: null, ...o });

describe("agenda assinável (.ics)", () => {
  it("escapa vírgula, ponto e vírgula, barra e quebra de linha", () => {
    expect(icsEscape("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
  });

  it("dobra linhas longas sem quebrar acentos e em no máximo 75 bytes", () => {
    const folded = icsFold("SUMMARY:" + "ação ".repeat(40));
    const enc = new TextEncoder();
    for (const l of folded.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join("")).toBe("SUMMARY:" + "ação ".repeat(40));
  });

  it("tarefa com hora: 30 min no horário de Brasília (UTC-3) e alerta 15 min antes", () => {
    const out = ics([task({ due_time: "15:00:00", note_id: "n1" })]);
    expect(out).toContain("DTSTART:20261112T180000Z");
    expect(out).toContain("DTEND:20261112T183000Z");
    expect(out).toContain("TRIGGER:-PT15M");
    expect(out).toContain("URL:https://app.exemplo/nota/n1");
    expect(out).toContain("UID:tarefa-t1@segundo-cerebro");
  });

  it("tarefa só com dia: dia inteiro com alerta às 8h de Brasília", () => {
    const out = ics([task()]);
    expect(out).toContain("DTSTART;VALUE=DATE:20261112");
    expect(out).toContain("DTEND;VALUE=DATE:20261113");
    expect(out).toContain("TRIGGER;VALUE=DATE-TIME:20261112T110000Z");
  });

  it("tarefa sem dia fica de fora; compromisso sem fim dura 1 hora", () => {
    const out = ics([task({ due_date: null })], [{ id: "e1", title: "Reunião", starts_at: "2026-11-13T12:00:00Z", ends_at: null, all_day: false, note_id: null }]);
    expect(out).not.toContain("tarefa-t1");
    expect(out).toContain("DTSTART:20261113T120000Z");
    expect(out).toContain("DTEND:20261113T130000Z");
  });

  it("compromisso de dia inteiro usa o dia de Brasília, não o UTC", () => {
    const out = ics([], [{ id: "e2", title: "Aniversário", starts_at: "2026-11-14T00:00:00-03:00", ends_at: null, all_day: true, note_id: null }]);
    expect(out).toContain("DTSTART;VALUE=DATE:20261114");
  });

  it("calendário válido: abre e fecha, CRLF e nome", () => {
    const out = ics([task()]);
    expect(out.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(out).toContain("X-WR-CALNAME:Segundo Cérebro");
    expect(icsUtc("2026-11-11T09:30:00-03:00")).toBe("20261111T123000Z");
  });
});
