import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useBrain } from "@/components/brain/app-context";
import { LazyGraph } from "@/components/brain/LazyGraph";
import { useSynthesize } from "@/components/brain/SynthesisBox";
import { Layers, Loader2, Minimize2, SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

const PANEL_KEY = "sc-grafo-filtros";
import { TypeDot } from "@/components/brain/type-meta";
import { NOTE_TYPES } from "@/lib/markdown-utils";
import { buildGraph } from "@/lib/graph-data";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/grafo")({
  head: () => ({ meta: [{ title: "Grafo — Segundo Cérebro" }, { name: "description", content: "Visualize as conexões entre suas notas." }] }),
  component: GraphPage,
});

function GraphPage() {
  const { notes, links } = useBrain();
  const navigate = useNavigate();
  const synth = useSynthesize();
  const [types, setTypes] = useState<Set<string> | null>(null);
  const [tag, setTag] = useState<string>("");
  const [q, setQ] = useState("");
  const [orphans, setOrphans] = useState(true);
  const [sugg, setSugg] = useState(true);
  const [rep, setRep] = useState(180);
  const [dist, setDist] = useState(60);
  const tags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes]);
  const g = useMemo(() => buildGraph(notes, links, { types, tag: tag || null, showOrphans: orphans, showSuggested: sugg }), [notes, links, types, tag, orphans, sugg]);
  const highlight = q.trim() ? new Set(notes.filter((n) => n.title.toLowerCase().includes(q.toLowerCase())).map((n) => n.id)) : null;
  const toggle = (t: string) => setTypes((s) => { const n = new Set(s ?? NOTE_TYPES.map((x) => x.value)); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  // Painel de filtros recolhível; a escolha fica salva neste navegador.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PANEL_KEY);
      setOpen(saved ? saved === "1" : window.innerWidth >= 768);
    } catch {
      /* sem armazenamento: fica aberto */
    }
  }, []);
  const setPanel = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(PANEL_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
  };
  const active = (q.trim() ? 1 : 0) + (tag ? 1 : 0) + (types ? 1 : 0) + (orphans ? 0 : 1) + (sugg ? 0 : 1);

  return (
    <div className="relative h-full min-h-[70vh]">
      <LazyGraph nodes={g.nodes} links={g.links} highlight={highlight} repulsion={rep} distance={dist} onNodeClick={(id) => navigate({ to: "/nota/$id", params: { id } })} />
      <AnimatePresence initial={false} mode="wait">
        {!open ? (
          <motion.button
            key="fechado"
            onClick={() => setPanel(true)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ y: -1 }}
            aria-label="Mostrar filtros do grafo"
            className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border bg-panel/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur hover:border-primary"
          >
            <SlidersHorizontal className="size-3.5 text-primary" /> Filtros
            {active > 0 && <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">{active}</span>}
          </motion.button>
        ) : (
      <motion.div
        key="aberto"
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        style={{ transformOrigin: "top left" }}
        className="absolute left-3 top-3 max-h-[calc(100%-1.5rem)] w-56 space-y-3 overflow-y-auto rounded-lg border bg-panel/90 p-3 text-xs shadow-lg backdrop-blur"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium"><SlidersHorizontal className="size-3.5 text-primary" /> Filtros</span>
          <button onClick={() => setPanel(false)} aria-label="Minimizar filtros" title="Minimizar" className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <Minimize2 className="size-3.5" />
          </button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Destacar nós…" className="h-7 w-full rounded border bg-background px-2 outline-none" />
        <select value={tag} onChange={(e) => setTag(e.target.value)} className="h-7 w-full rounded border bg-background px-1">
          <option value="">Todas as tags</option>
          {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
        {tag && (
          <button onClick={() => synth.go(`#${tag}`)} disabled={!!synth.busy} className="flex w-full items-center justify-center gap-1 rounded bg-primary px-2 py-1 text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {synth.busy ? <Loader2 className="size-3 animate-spin" /> : <Layers className="size-3" />} {synth.busy ? "Sintetizando…" : `Sintetizar #${tag}`}
          </button>
        )}
        <label className="flex items-center justify-between">Mostrar órfãs <Switch checked={orphans} onCheckedChange={setOrphans} /></label>
        <label className="flex items-center justify-between">Sugestões da IA <Switch checked={sugg} onCheckedChange={setSugg} /></label>
        <div><p className="mb-1 text-muted-foreground">Repulsão</p><Slider min={30} max={600} value={[rep]} onValueChange={(v) => setRep(v[0] ?? rep)} /></div>
        <div><p className="mb-1 text-muted-foreground">Distância</p><Slider min={15} max={200} value={[dist]} onValueChange={(v) => setDist(v[0] ?? dist)} /></div>
        <div className="space-y-0.5 border-t pt-2">
          {NOTE_TYPES.map((t) => (
            <button key={t.value} onClick={() => toggle(t.value)} className={cn("flex w-full items-center gap-2 rounded px-1 py-0.5 hover:bg-secondary", types && !types.has(t.value) && "opacity-40")}>
              <TypeDot type={t.value} /> {t.label}
            </button>
          ))}
        </div>
      </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
