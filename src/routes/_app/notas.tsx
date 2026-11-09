import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useBrain } from "@/components/brain/app-context";
import { EASE } from "@/components/brain/motion";
import { TypeIcon } from "@/components/brain/type-meta";

export const Route = createFileRoute("/_app/notas")({
  head: () => ({ meta: [{ title: "Notas — Segundo Cérebro" }, { name: "description", content: "Todas as suas notas." }] }),
  component: NotesPage,
});

const PAGE = 80;

function NotesPage() {
  const { notes } = useBrain();
  // Renderiza aos poucos: mais itens entram quando o fim da lista aparece no scroll.
  const [limit, setLimit] = useState(PAGE);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setLimit((l) => l + PAGE), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, notes.length]); // reobserva a cada lote: se o fim ainda estiver visível, carrega o próximo
  return (
    <>
      <ul className="divide-y">
        {notes.slice(0, limit).map((n) => (
          // Cada nota surge ao entrar na tela durante o scroll.
          <motion.li
            key={n.id}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-20px" }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <Link to="/nota/$id" params={{ id: n.id }} className="group block px-4 py-3 transition-colors hover:bg-secondary/60">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TypeIcon type={n.type} />
                <span className="transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary">{n.title}</span>
              </div>
              {n.summary && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.summary}</p>}
            </Link>
          </motion.li>
        ))}
      </ul>
      {limit < notes.length && <div ref={end} className="h-8" aria-hidden />}
    </>
  );
}
