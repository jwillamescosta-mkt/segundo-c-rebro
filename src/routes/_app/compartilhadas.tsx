import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBrain } from "@/components/brain/app-context";
import { setSharing } from "@/lib/brain";

export const Route = createFileRoute("/_app/compartilhadas")({
  head: () => ({ meta: [{ title: "Compartilhadas — Segundo Cérebro" }, { name: "description", content: "Notas com link público." }] }),
  component: SharedPage,
});

function SharedPage() {
  const { notes } = useBrain();
  const qc = useQueryClient();
  const shared = notes.filter((n) => n.is_shared);
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="mb-4 text-xl font-semibold">Compartilhadas</h1>
      {shared.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma nota pública. Ative “Compartilhar” nas propriedades de uma nota.</p> : (
        <ul className="divide-y rounded-lg border bg-panel">
          {shared.map((n) => (
            <li key={n.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Link to="/nota/$id" params={{ id: n.id }} className="flex-1 truncate">{n.title}</Link>
              <a href={`/s/${n.share_token}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary">/s/{n.share_token?.slice(0, 8)}…</a>
              <Button size="sm" variant="outline" className="h-7" onClick={async () => { await setSharing(n, false); qc.invalidateQueries({ queryKey: ["notes"] }); toast.success("Revogado"); }}>Revogar</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
