import { addDaysISO, localDate } from "./tasks-utils";

export const PULSE_DAYS = 14;

/**
 * "Pulso do cérebro": capturas por dia nas últimas 2 semanas e a sequência de dias seguidos capturando.
 * Hoje sem captura ainda não quebra a sequência (o dia não acabou): ela conta a partir de ontem.
 */
export function brainPulse(notes: { created_at: string; type: string }[], today: string) {
  const perDay = new Map<string, number>();
  for (const n of notes) {
    if (n.type === "diario") continue; // o diário é criado pelo app, não é captura
    const d = localDate(n.created_at);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const days = Array.from({ length: PULSE_DAYS }, (_, i) => {
    const date = addDaysISO(today, i - (PULSE_DAYS - 1));
    return { date, count: perDay.get(date) ?? 0 };
  });
  let streak = 0;
  for (let d = perDay.has(today) ? today : addDaysISO(today, -1); perDay.has(d); d = addDaysISO(d, -1)) streak++;
  return { days, streak, today: perDay.get(today) ?? 0 };
}

/** Saudação pela hora local. */
export function greeting(hour: number) {
  return hour < 5 ? "Boa madrugada" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}
