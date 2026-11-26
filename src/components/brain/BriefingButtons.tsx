import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { CalendarCheck, Loader2, Moon, Sparkles, Sun } from "lucide-react";
import { toast } from "sonner";
import { briefingFn } from "@/lib/briefing.functions";
import { runRoutineFn } from "@/lib/routines.functions";

/** Gera o briefing do dia (no diário) ou a revisão da semana, e abre a nota. */
export function BriefingButtons() {
  const run = useServerFn(briefingFn);
  const routine = useServerFn(runRoutineFn);
  const qc = useQueryClient();
  const navigate = useNavigate();
  type Kind = "diario" | "semanal" | "fim-do-dia" | "faxina";
  const [busy, setBusy] = useState<Kind | null>(null);

  async function go(kind: Kind) {
    setBusy(kind);
    try {
      const r =
        kind === "diario" || kind === "semanal"
          ? await run({ data: { kind } })
          : await routine({ data: { routine: kind } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["note", r.noteId] });
      navigate({ to: "/nota/$id", params: { id: r.noteId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(null);
    }
  }

  const items = [
    {
      kind: "diario" as const,
      icon: Sun,
      title: "Briefing do dia",
      desc: "Prioridades, agenda, o que estudar e um insight",
    },
    {
      kind: "semanal" as const,
      icon: CalendarCheck,
      title: "Revisão da semana",
      desc: "O que avançou, aprendeu e o foco da próxima",
    },
    {
      kind: "fim-do-dia" as const,
      icon: Moon,
      title: "Fechar o dia",
      desc: "Processa a fila, conecta e resume o dia no diário",
    },
    {
      kind: "faxina" as const,
      icon: Sparkles,
      title: "Faxina do cérebro",
      desc: "Duplicadas, erros, índices velhos e núcleo",
    },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((it) => (
        <motion.button
          key={it.kind}
          disabled={!!busy}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => go(it.kind)}
          className="group flex items-start gap-3 rounded-lg border bg-panel p-3 text-left transition-colors hover:border-primary disabled:opacity-60"
        >
          <span className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary transition-transform group-hover:rotate-12">
            {busy === it.kind ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <it.icon className="size-4" />
            )}
          </span>
          <span>
            <span className="block text-sm font-medium">
              {busy === it.kind ? "Preparando…" : it.title}
            </span>
            <span className="block text-xs text-muted-foreground">{it.desc}</span>
          </span>
        </motion.button>
      ))}
    </div>
  );
}
