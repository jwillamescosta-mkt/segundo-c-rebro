import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { toast } from "sonner";
import { saveReview, type Card } from "@/lib/brain";
import { GRADES, intervalLabel, schedule, type Grade } from "@/lib/study-utils";
import { todayISO } from "@/lib/tasks-utils";
import { EASE } from "./motion";
import { useBrain } from "./app-context";

/** Sessão de revisão: o card vira (3D) para mostrar a resposta; "Errei" volta para o fim da fila. */
export function StudySession({ cards, onDone }: { cards: Card[]; onDone: (reviewed: number) => void }) {
  const qc = useQueryClient();
  const { byId } = useBrain();
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const card = queue[0];
  const today = todayISO();
  const dragX = useMotionValue(0);
  const dragRotate = useTransform(dragX, [-200, 200], [-8, 8]);
  const goodHint = useTransform(dragX, [20, 110], [0, 1]);
  const badHint = useTransform(dragX, [-110, -20], [1, 0]);
  const dragged = useRef(false);

  async function grade(g: Grade) {
    if (!card || !flipped) return;
    const next = schedule(card, g, today);
    setFlipped(false);
    setReviewed((r) => r + 1);
    setQueue((q) => (g === 1 ? [...q.slice(1), { ...card, ...next }] : q.slice(1)));
    try {
      await saveReview(card.id, next);
    } catch {
      toast.error("Não foi possível salvar a revisão.");
    }
    qc.invalidateQueries({ queryKey: ["cards", "meta"] });
  }

  useEffect(() => {
    if (!card) onDone(reviewed);
  }, [card]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped(true);
      } else if (["1", "2", "3", "4"].includes(e.key)) grade(Number(e.key) as Grade);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (!card) return null;
  const note = card.note_id ? byId.get(card.note_id) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Faltam {queue.length}</span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
          <motion.div className="h-full bg-primary" animate={{ width: `${(reviewed / (reviewed + queue.length)) * 100}%` }} transition={{ ease: EASE }} />
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={card.id + reviewed}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25, ease: EASE }}
          style={{ perspective: 1200, x: dragX, rotate: dragRotate }}
          // Com a resposta à mostra: arrastar para a direita = "Bom", para a esquerda = "Errei".
          drag={flipped ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragStart={() => (dragged.current = true)}
          onDragEnd={(_, info) => {
            setTimeout(() => (dragged.current = false), 50);
            if (info.offset.x > 110) grade(3);
            else if (info.offset.x < -110) grade(1);
          }}
        >
          <motion.button
            type="button"
            onClick={() => !dragged.current && setFlipped((f) => !f)}
            aria-label={flipped ? "Mostrar pergunta" : "Mostrar resposta"}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            style={{ transformStyle: "preserve-3d" }}
            className="relative grid min-h-64 w-full cursor-pointer text-left"
          >
            <Face label="Pergunta" text={card.question} hint="Toque ou aperte espaço para ver a resposta" />
            <Face label="Resposta" text={card.answer} back />
            <motion.span aria-hidden style={{ opacity: goodHint, gridArea: "1 / 1", transform: "rotateY(180deg)" }} className="pointer-events-none m-3 self-start justify-self-start rounded-md border-2 border-emerald-500 px-2 py-0.5 text-sm font-bold text-emerald-500">BOM</motion.span>
            <motion.span aria-hidden style={{ opacity: badHint, gridArea: "1 / 1", transform: "rotateY(180deg)" }} className="pointer-events-none m-3 self-start justify-self-end rounded-md border-2 border-destructive px-2 py-0.5 text-sm font-bold text-destructive">ERREI</motion.span>
          </motion.button>
        </motion.div>
      </AnimatePresence>
      <div className="flex min-h-10 flex-wrap items-center gap-2">
        {flipped ? (
          GRADES.map((g) => (
            <motion.button
              key={g.grade}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { delay: g.grade * 0.04 } }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => grade(g.grade)}
              className={`flex flex-1 flex-col items-center rounded-lg border px-3 py-1.5 text-sm hover:border-primary ${g.grade === 1 ? "hover:border-destructive" : ""}`}
            >
              {g.label}
              <span className="font-mono text-[10px] text-muted-foreground">{intervalLabel(schedule(card, g.grade, today).interval_days)} · {g.key}</span>
            </motion.button>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">Tente responder de cabeça antes de virar o card.</p>
        )}
      </div>
      {note && (
        <p className="text-xs text-muted-foreground">
          Da nota <Link to="/nota/$id" params={{ id: note.id }} className="text-primary">{note.title}</Link>
        </p>
      )}
    </div>
  );
}

function Face({ label, text, hint, back }: { label: string; text: string; hint?: string; back?: boolean }) {
  return (
    <div
      style={{ backfaceVisibility: "hidden", transform: back ? "rotateY(180deg)" : undefined, gridArea: "1 / 1" }}
      className={`flex flex-col rounded-xl border p-6 shadow-sm ${back ? "border-primary/50 bg-primary/5" : "bg-panel"}`}
    >
      <span className="mb-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <p className="flex-1 whitespace-pre-wrap text-lg leading-relaxed">{text}</p>
      {hint && <span className="mt-4 text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
