import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Unlink } from "lucide-react";
import { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { CaptureBox } from "@/components/brain/CaptureBox";
import { orphanNotes, useBrain } from "@/components/brain/app-context";
import { TypeIcon } from "@/components/brain/type-meta";

export const Route = createFileRoute("/_app/inicio")({
  head: () => ({ meta: [{ title: "Início — Segundo Cérebro" }, { name: "description", content: "Capture e reencontre ideias." }] }),
  component: Home,
});

function Home() {
  const { notes, links, byId } = useBrain();
  const isMobile = useIsMobile();
  const flash = useMemo(() => {
    const now = Date.now();
    const recent = notes.filter((n) => now - +new Date(n.created_at) < 3 * 864e5);
    const old = new Set(notes.filter((n) => now - +new Date(n.created_at) > 14 * 864e5).map((n) => n.id));
    for (const r of recent) {
      for (const l of links) {
        if (l.status === "rejeitada") continue;
        const o = l.source_note_id === r.id ? l.target_note_id : l.target_note_id === r.id ? l.source_note_id : null;
        if (o && old.has(o)) return { note: byId.get(o)!, from: r, reason: l.reason ?? "Ligada a uma captura recente" };
      }
      const t = notes.find((n) => old.has(n.id) && n.tags.some((x) => r.tags.includes(x)));
      if (t) return { note: t, from: r, reason: `Tags em comum: ${t.tags.filter((x) => r.tags.includes(x)).join(", ")}` };
    }
    return null;
  }, [notes, links, byId]);
  const orphans = orphanNotes(notes, links).slice(0, 12);
  const recent = notes.slice(0, 8);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <CaptureBox variant={isMobile ? "mobile" : "inline"} />
      <section className="rounded-lg border bg-panel p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Lampejo do dia</h2>
        {flash ? (
          <div>
            <Link to="/nota/$id" params={{ id: flash.note.id }} className="font-medium hover:text-primary">{flash.note.title}</Link>
            <p className="mt-1 text-sm text-muted-foreground">{flash.note.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">Por quê: {flash.reason} (com “{flash.from.title}”)</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Quando você tiver notas com mais de 14 dias, uma delas relacionada ao que capturou recentemente aparece aqui.</p>
        )}
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recentes</h2>
          <ul className="space-y-1">{recent.map((n) => (
            <li key={n.id}><Link to="/nota/$id" params={{ id: n.id }} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-secondary"><TypeIcon type={n.type} /><span className="truncate">{n.title}</span></Link></li>
          ))}</ul>
        </section>
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Unlink className="size-3" /> Notas órfãs</h2>
          {orphans.length === 0 ? <p className="text-sm text-muted-foreground">Tudo conectado.</p> : (
            <ul className="space-y-1">{orphans.map((n) => (
              <li key={n.id}><Link to="/nota/$id" params={{ id: n.id }} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-secondary"><TypeIcon type={n.type} /><span className="truncate">{n.title}</span></Link></li>
            ))}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
