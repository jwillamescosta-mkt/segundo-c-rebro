import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { synthesizeFn } from "@/lib/synthesis.functions";
import { useBrain } from "./app-context";

/** Hook: gera a síntese de um tema e abre a nota criada. */
export function useSynthesize() {
  const run = useServerFn(synthesizeFn);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  async function go(topic: string) {
    if (!topic.trim() || busy) return;
    setBusy(topic);
    try {
      const r = await run({ data: { topic } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Síntese criada a partir de ${r.count} notas.`);
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["note", r.noteId] });
      navigate({ to: "/nota/$id", params: { id: r.noteId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao sintetizar.");
    } finally {
      setBusy(null);
    }
  }
  return { go, busy };
}

/** Caixa "Sintetizar um tema": texto livre ou uma das tags mais usadas. */
export function SynthesisBox() {
  const { notes } = useBrain();
  const { go, busy } = useSynthesize();
  const [topic, setTopic] = useState("");
  const topTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) for (const t of n.tags) if (!["diario", "sintese", "pergunta", "revisao-semanal"].includes(t)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  }, [notes]);

  return (
    <div className="rounded-xl border bg-panel p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Layers className="size-4 text-primary" /> Sintetizar um tema</h2>
      <p className="mb-3 text-xs text-muted-foreground">A IA junta tudo o que você anotou sobre o tema numa nota: ideias principais com fontes, padrões, contradições, lacunas e próximos passos.</p>
      <form onSubmit={(e) => { e.preventDefault(); go(topic); }} className="flex gap-2">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} placeholder="ex.: liderança, vendas, #marketing" aria-label="Tema" className="h-8 flex-1 rounded border bg-background px-2 text-sm outline-none focus:border-primary" />
        <Button type="submit" size="sm" disabled={!!busy || topic.trim().length < 2}>
          {busy === topic && busy ? <Loader2 className="size-3.5 animate-spin" /> : "Sintetizar"}
        </Button>
      </form>
      {topTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topTags.map((t, i) => (
            <motion.button
              key={t}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.03 } }}
              whileHover={{ y: -2 }}
              disabled={!!busy}
              onClick={() => go(`#${t}`)}
              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {busy === `#${t}` && <Loader2 className="size-3 animate-spin" />}#{t}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
