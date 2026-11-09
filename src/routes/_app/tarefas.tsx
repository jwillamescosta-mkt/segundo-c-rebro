import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { useBrain } from "@/components/brain/app-context";
import { setTaskDone } from "@/lib/brain";
import { TASK_GROUPS, cleanTime, formatDateBR, groupTasks, todayISO } from "@/lib/tasks-utils";

export const Route = createFileRoute("/_app/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas — Segundo Cérebro" }, { name: "description", content: "Tarefas extraídas das suas notas." }] }),
  component: TasksPage,
});

function TasksPage() {
  const { tasks, byId } = useBrain();
  const qc = useQueryClient();
  const groups = groupTasks(tasks.filter((t) => !t.done), todayISO());
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <h1 className="text-xl font-semibold">Tarefas</h1>
      {TASK_GROUPS.map((g) => (
        <section key={g.key}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label} <span className="font-mono">{groups[g.key].length}</span></h2>
          {groups[g.key].length === 0 ? <p className="text-sm text-muted-foreground">Nada aqui.</p> : (
            <ul className="divide-y rounded-lg border bg-panel">
              {groups[g.key].map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox checked={t.done} onCheckedChange={async (v) => { await setTaskDone(t.id, !!v); qc.invalidateQueries({ queryKey: ["tasks"] }); }} />
                  <span className="flex-1">{t.text}</span>
                  {t.note_id && byId.get(t.note_id) && <Link to="/nota/$id" params={{ id: t.note_id }} className="truncate text-xs text-primary">{byId.get(t.note_id)!.title}</Link>}
                  {t.due_date && <span className={g.key === "atrasadas" ? "font-mono text-xs text-destructive" : "font-mono text-xs text-muted-foreground"}>{formatDateBR(t.due_date)}{cleanTime(t.due_time) ? ` ${cleanTime(t.due_time)}` : ""}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
