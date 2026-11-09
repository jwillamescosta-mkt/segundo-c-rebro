import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useBrain } from "@/components/brain/app-context";
import { LazyGraph } from "@/components/brain/LazyGraph";
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
  const toggle = (t: string) => setTypes((s) => { const n = new Set(s ?? NOTE_TYPES.map((x) => x.value)); n.has(t) ? n.delete(t) : n.add(t); return n; });

  return (
    <div className="relative h-full min-h-[70vh]">
      <LazyGraph nodes={g.nodes} links={g.links} highlight={highlight} repulsion={rep} distance={dist} onNodeClick={(id) => navigate({ to: "/nota/$id", params: { id } })} />
      <div className="absolute left-3 top-3 w-56 space-y-3 rounded-lg border bg-panel/95 p-3 text-xs">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Destacar nós…" className="h-7 w-full rounded border bg-background px-2 outline-none" />
        <select value={tag} onChange={(e) => setTag(e.target.value)} className="h-7 w-full rounded border bg-background px-1">
          <option value="">Todas as tags</option>
          {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
        <label className="flex items-center justify-between">Mostrar órfãs <Switch checked={orphans} onCheckedChange={setOrphans} /></label>
        <label className="flex items-center justify-between">Sugestões da IA <Switch checked={sugg} onCheckedChange={setSugg} /></label>
        <div><p className="mb-1 text-muted-foreground">Repulsão</p><Slider min={30} max={600} value={[rep]} onValueChange={(v) => setRep(v[0])} /></div>
        <div><p className="mb-1 text-muted-foreground">Distância</p><Slider min={15} max={200} value={[dist]} onValueChange={(v) => setDist(v[0])} /></div>
        <div className="space-y-0.5 border-t pt-2">
          {NOTE_TYPES.map((t) => (
            <button key={t.value} onClick={() => toggle(t.value)} className={cn("flex w-full items-center gap-2 rounded px-1 py-0.5 hover:bg-secondary", types && !types.has(t.value) && "opacity-40")}>
              <TypeDot type={t.value} /> {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
