export const GOAL_AREAS = [
  { value: "profissional", label: "Profissional" },
  { value: "estudos", label: "Estudos" },
  { value: "pessoal", label: "Pessoal" },
  { value: "saude", label: "Saúde" },
  { value: "financeiro", label: "Financeiro" },
] as const;

/** Progresso de um resultado-chave, de 0 a 1 (current/target, limitado). */
export function krProgress(kr: { current: number; target: number }) {
  const t = Number(kr.target);
  if (!(t > 0)) return 0;
  return Math.max(0, Math.min(1, Number(kr.current) / t));
}

/** Progresso da meta: média dos resultados-chave; sem eles, as tarefas ligadas concluídas. */
export function goalProgress(krs: { current: number; target: number }[], tasks: { done: boolean }[] = []) {
  if (krs.length) return krs.reduce((s, k) => s + krProgress(k), 0) / krs.length;
  if (tasks.length) return tasks.filter((t) => t.done).length / tasks.length;
  return 0;
}

/**
 * Ritmo: compara o progresso com o tempo já passado até a data-alvo.
 * "adiantada" / "no ritmo" / "atrasada"; null sem data-alvo.
 */
export function goalPace(progress: number, createdAt: string, targetDate: string | null, today: string) {
  if (!targetDate) return null;
  const start = +new Date(createdAt.slice(0, 10));
  const end = +new Date(targetDate);
  const now = +new Date(today);
  if (end <= start) return progress >= 1 ? "no ritmo" : "atrasada";
  const elapsed = Math.max(0, Math.min(1, (now - start) / (end - start)));
  if (progress >= elapsed + 0.1) return "adiantada";
  if (progress < elapsed - 0.15) return "atrasada";
  return "no ritmo";
}
