import { createFileRoute, Link } from "@tanstack/react-router";
import { useBrain } from "@/components/brain/app-context";
import { TypeIcon } from "@/components/brain/type-meta";

export const Route = createFileRoute("/_app/notas")({
  head: () => ({ meta: [{ title: "Notas — Segundo Cérebro" }, { name: "description", content: "Todas as suas notas." }] }),
  component: () => {
    const { notes } = useBrain();
    return (
      <ul className="divide-y">
        {notes.map((n) => (
          <li key={n.id}>
            <Link to="/nota/$id" params={{ id: n.id }} className="block px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium"><TypeIcon type={n.type} />{n.title}</div>
              {n.summary && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.summary}</p>}
            </Link>
          </li>
        ))}
      </ul>
    );
  },
});
