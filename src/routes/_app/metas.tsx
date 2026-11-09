import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Plus, Target, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GoalCard } from "@/components/brain/GoalCard";
import { EASE, Reveal } from "@/components/brain/motion";
import { createGoal, goalsQuery } from "@/lib/brain";
import { GOAL_AREAS } from "@/lib/goals-utils";

export const Route = createFileRoute("/_app/metas")({
  head: () => ({ meta: [{ title: "Metas — Segundo Cérebro" }, { name: "description", content: "Metas, resultados-chave e próximas ações." }] }),
  component: GoalsPage,
});

function GoalsPage() {
  const { data } = useQuery(goalsQuery);
  const [open, setOpen] = useState(false);
  const goals = data?.goals ?? [];
  const order = { ativa: 0, pausada: 1, concluida: 2 } as Record<string, number>;
  const sorted = [...goals].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div className="flex items-center gap-2">
        <Target className="size-5 text-primary" />
        <h1 className="mr-auto text-xl font-semibold">Metas</h1>
        <Button size="sm" onClick={() => setOpen((o) => !o)} className="gap-1">
          {open ? <X className="size-4" /> : <Plus className="size-4" />} {open ? "Fechar" : "Nova meta"}
        </Button>
      </div>
      <AnimatePresence>{open && <GoalForm onDone={() => setOpen(false)} />}</AnimatePresence>
      {goals.length === 0 && !open ? (
        <Reveal className="rounded-xl border bg-panel p-6 text-center text-sm text-muted-foreground">
          Defina uma meta com resultados mensuráveis. A IA sugere as próximas ações, e as tarefas entram na sua agenda, no briefing do dia e nas respostas do Perguntar.
        </Reveal>
      ) : (
        <div className="space-y-3">
          {sorted.map((g, i) => (
            <Reveal key={g.id} delay={i * 0.05}>
              <GoalCard goal={g} krs={(data?.krs ?? []).filter((k) => k.goal_id === g.id)} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}

function GoalForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [area, setArea] = useState("profissional");
  const [date, setDate] = useState("");
  const [krs, setKrs] = useState([{ title: "", target: "", unit: "" }]);
  const [saving, setSaving] = useState(false);
  const field = "h-8 w-full rounded border bg-background px-2 text-sm outline-none focus:border-primary";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createGoal(
        { title: title.trim(), why: why.trim() || null, area, target_date: date || null },
        krs.filter((k) => k.title.trim() && Number(k.target) > 0).map((k) => ({ title: k.title.trim(), target: Number(k.target), unit: k.unit.trim() || null })),
      );
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Meta criada.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a meta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.form
      onSubmit={save}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="overflow-hidden"
    >
      <div className="space-y-3 rounded-xl border bg-panel p-4">
        <input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meta (ex.: Ser promovido a coordenador)" aria-label="Meta" className={field} />
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Por que isso importa para você?" aria-label="Por quê" className={field} />
        <div className="grid grid-cols-2 gap-2">
          <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área" className={field}>
            {GOAL_AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data-alvo" className={field} />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Resultados-chave (como você vai medir)</p>
          {krs.map((k, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_5rem] gap-2">
              <input value={k.title} onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="ex.: Concluir curso de liderança" aria-label="Resultado-chave" className={field} />
              <input type="number" min="0" step="any" value={k.target} onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} placeholder="Alvo" aria-label="Alvo" className={field} />
              <input value={k.unit} onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} placeholder="unid." aria-label="Unidade" className={field} />
            </div>
          ))}
          <button type="button" onClick={() => setKrs([...krs, { title: "", target: "", unit: "" }])} className="text-xs text-primary">+ resultado-chave</button>
        </div>
        <Button type="submit" size="sm" disabled={saving || !title.trim()}>{saving ? "Salvando…" : "Criar meta"}</Button>
      </div>
    </motion.form>
  );
}
