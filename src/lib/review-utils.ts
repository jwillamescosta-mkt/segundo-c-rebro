import { addDaysISO } from "./tasks-utils";

/** Confiança mínima para "aceitar de uma vez" as ligações sugeridas pela IA. */
export const BULK_ACCEPT_MIN = 0.7;

/** Próxima segunda-feira depois de `iso` (se hoje for segunda, a da semana que vem). */
export function nextMonday(iso: string) {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDaysISO(iso, (8 - dow) % 7 || 7);
}

/** Para onde mandar uma tarefa atrasada. `null` = sem data (sai do "atrasadas" sem sumir). */
export function rescheduleOptions(today: string) {
  return [
    { key: "hoje", label: "Hoje", date: today },
    { key: "amanha", label: "Amanhã", date: addDaysISO(today, 1) },
    { key: "segunda", label: "Segunda", date: nextMonday(today) },
    { key: "sem-data", label: "Sem data", date: null },
  ] as const;
}

/** Itens que pedem uma decisão na revisão. É o número que aparece no menu. */
export function reviewCount(p: {
  suggested: number;
  overdue: number;
  orphans: number;
  pending: number;
}) {
  return p.suggested + p.overdue + p.orphans + p.pending;
}

/** Ligações sugeridas que podem ser aceitas em lote (confiança alta), das mais fortes para as mais fracas. */
export function strongSuggestions<T extends { status: string; confidence: number | null }>(
  links: T[],
  min = BULK_ACCEPT_MIN,
) {
  return links.filter((l) => l.status === "sugerida" && (l.confidence ?? 0) >= min);
}
