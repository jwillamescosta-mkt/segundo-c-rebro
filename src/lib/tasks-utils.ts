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

export function formatDateBR(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
