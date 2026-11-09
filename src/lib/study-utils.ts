import { addDaysISO } from "./tasks-utils";

export type Grade = 1 | 2 | 3 | 4; // Errei, Difícil, Bom, Fácil

export const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 1, label: "Errei", key: "1" },
  { grade: 2, label: "Difícil", key: "2" },
  { grade: 3, label: "Bom", key: "3" },
  { grade: 4, label: "Fácil", key: "4" },
];

export interface CardState {
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
}

/**
 * Revisão espaçada no estilo SM-2 (Anki): acertar aumenta o intervalo pela "facilidade" do card;
 * errar volta para amanhã e deixa o card mais difícil.
 */
export function schedule(card: CardState, grade: Grade, today: string) {
  let { interval_days: interval, ease, reps, lapses } = card;
  if (grade === 1) {
    lapses += 1;
    reps = 0;
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (reps === 1) interval = grade === 4 ? 3 : 1;
    else if (reps === 2) interval = grade === 2 ? 3 : grade === 4 ? 8 : 6;
    else interval = Math.round(interval * (grade === 2 ? 1.2 : grade === 4 ? ease * 1.3 : ease));
    ease = Math.max(1.3, ease + (grade === 2 ? -0.15 : grade === 4 ? 0.15 : 0));
    interval = Math.min(Math.max(interval, 1), 365);
  }
  return { interval_days: interval, ease: Math.round(ease * 100) / 100, reps, lapses, due: addDaysISO(today, interval) };
}

/** Texto curto do próximo intervalo, para mostrar no botão ("1 dia", "6 dias", "2 meses"). */
export function intervalLabel(days: number) {
  if (days < 30) return `${days} dia${days > 1 ? "s" : ""}`;
  const m = Math.round(days / 30);
  if (m < 12) return `${m} ${m > 1 ? "meses" : "mês"}`;
  return "1 ano";
}

/** Formato do plugin Spaced Repetition do Obsidian: "pergunta::resposta" (uma linha). */
export function cardsToMarkdown(
  cards: { question: string; answer: string; note_id?: string | null }[],
  titleOf: (noteId: string | null) => string | null,
) {
  const flat = (s: string) => s.replace(/\s*\n\s*/g, " ").replace(/::/g, ":").trim();
  const lines = ["# Flashcards", "", "#flashcards", ""];
  for (const c of cards) {
    const t = titleOf(c.note_id ?? null);
    lines.push(`${flat(c.question)}::${flat(c.answer)}${t ? ` — [[${t}]]` : ""}`);
  }
  return lines.join("\n") + "\n";
}
