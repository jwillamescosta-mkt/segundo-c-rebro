import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Check, Loader2, Pause, Play, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { addGoalTasks, deleteGoal, setKrCurrent, setTaskDone, updateGoal, type Goal, type KeyResult } from "@/lib/brain";
import { suggestActionsFn } from "@/lib/goals.functions";
import { GOAL_AREAS, goalPace, goalProgress, krProgress } from "@/lib/goals-utils";
import { formatDateBR, todayISO } from "@/lib/tasks-utils";
import { useBrain } from "./app-context";
import { EASE } from "./motion";

const PACE_STYLE: Record<string, string> = {
  adiantada: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "no ritmo": "bg-primary/15 text-primary",
  atrasada: "bg-destructive/15 text-destructive",
};

export function GoalCard({ goal, krs }: { goal: Goal; krs: KeyResult[] }) {
  const qc = useQueryClient();
  const { tasks } = useBrain();
  const suggest = useServerFn(suggestActionsFn);
  const goalTasks = tasks.filter((t) => t.goal_id === goal.id);
  const progress = goalProgress(krs, goalTasks);
  const pace = goal.status === "ativa" ? goalPace(progress, goal.created_at, goal.target_date, todayISO()) : null;
  const [ideas, setIdeas] = useState<{ text: string; due_date: string | null; why: string; pick: boolean }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["goals"] });
  const act = async (p: Promise<unknown>) => {
    try {
      await p;
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Algo deu errado.");
    }
  };

  async function plan() {
    setBusy(true);
    try {
      const r = await suggest({ data: { goalId: goal.id } });
      if (r.ok) setIdeas(r.actions.map((a) => ({ ...a, pick: true })));
      else toast.error(r.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao sugerir ações.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.article layout className={`rounded-xl border bg-panel p-4 ${goal.status !== "ativa" ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-4">
        <ProgressRing value={progress} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-secondary px-2 py-0.5">{GOAL_AREAS.find((a) => a.value === goal.area)?.label ?? goal.area}</span>
            {goal.target_date && <span className="text-muted-foreground">até {formatDateBR(goal.target_date)}</span>}
            {pace && <span className={`rounded-full px-2 py-0.5 ${PACE_STYLE[pace]}`}>{pace}</span>}
            {goal.status !== "ativa" && <span className="rounded-full bg-secondary px-2 py-0.5">{goal.status}</span>}
          </div>
          <h3 className="mt-1 font-semibold">{goal.title}</h3>
          {goal.why && <p className="mt-0.5 text-xs text-muted-foreground">{goal.why}</p>}
        </div>
        <div className="flex gap-0.5">
          {goal.status === "ativa" ? (
            <>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Marcar como concluída" title="Concluir" onClick={() => act(updateGoal(goal.id, { status: "concluida" }))}><Check className="size-3.5" /></Button>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Pausar meta" title="Pausar" onClick={() => act(updateGoal(goal.id, { status: "pausada" }))}><Pause className="size-3.5" /></Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" className="size-7" aria-label="Reativar meta" title="Reativar" onClick={() => act(updateGoal(goal.id, { status: "ativa" }))}><Play className="size-3.5" /></Button>
          )}
          <Button variant="ghost" size="icon" className="size-7 hover:text-destructive" aria-label="Excluir meta" title="Excluir" onClick={() => confirm("Excluir esta meta e seus resultados-chave?") && act(deleteGoal(goal.id))}><Trash2 className="size-3.5" /></Button>
        </div>
      </div>

      {krs.length > 0 && (
        <ul className="mt-4 space-y-2">
          {krs.map((k) => (
            <li key={k.id} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="flex-1">{k.title}</span>
                <input
                  type="number"
                  defaultValue={k.current}
                  aria-label={`Valor atual de ${k.title}`}
                  onBlur={(e) => Number(e.target.value) !== Number(k.current) && act(setKrCurrent(k.id, Number(e.target.value) || 0))}
                  className="w-16 rounded border bg-background px-1 text-right font-mono text-xs"
                />
                <span className="font-mono text-xs text-muted-foreground">/ {k.target} {k.unit}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${krProgress(k) * 100}%` }} transition={{ duration: 0.8, ease: EASE }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {goalTasks.length > 0 && (
        <ul className="mt-4 space-y-1">
          {goalTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <Checkbox aria-label="Concluir tarefa" checked={t.done} onCheckedChange={async (v) => { await setTaskDone(t.id, !!v); qc.invalidateQueries({ queryKey: ["tasks"] }); }} />
              <span className={`flex-1 ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.text}</span>
              {t.due_date && <span className="font-mono text-xs text-muted-foreground">{formatDateBR(t.due_date)}</span>}
            </li>
          ))}
        </ul>
      )}

      {goal.status === "ativa" && (
        <div className="mt-4 border-t pt-3">
          {ideas ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Próximas ações sugeridas — escolha o que vira tarefa:</p>
              {ideas.map((a, i) => (
                <motion.label key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }} className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox className="mt-0.5" checked={a.pick} onCheckedChange={(v) => setIdeas(ideas.map((x, j) => (j === i ? { ...x, pick: !!v } : x)))} />
                  <span className="flex-1">
                    {a.text}
                    {a.due_date && <span className="ml-2 font-mono text-xs text-muted-foreground">{formatDateBR(a.due_date)}</span>}
                    <span className="block text-xs text-muted-foreground">{a.why}</span>
                  </span>
                </motion.label>
              ))}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!ideas.some((a) => a.pick)}
                  onClick={async () => {
                    try {
                      await addGoalTasks(goal.id, ideas.filter((a) => a.pick).map(({ text, due_date }) => ({ text, due_date })));
                      qc.invalidateQueries({ queryKey: ["tasks"] });
                      setIdeas(null);
                      toast.success("Tarefas adicionadas à meta e à agenda.");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Não foi possível adicionar.");
                    }
                  }}
                >
                  Adicionar como tarefas
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIdeas(null)}>Descartar</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="gap-1" disabled={busy} onClick={plan}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {busy ? "Pensando no plano…" : "Plano de ação com IA"}
            </Button>
          )}
        </div>
      )}
    </motion.article>
  );
}

/** Anel que se preenche até o progresso da meta. */
function ProgressRing({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="relative size-14 shrink-0" role="img" aria-label={`Progresso ${pct}%`}>
      <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--secondary)" strokeWidth="3" />
        <motion.circle
          cx="18" cy="18" r="15.5" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: value }} transition={{ duration: 1.1, ease: EASE }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold">{pct}%</span>
    </div>
  );
}
