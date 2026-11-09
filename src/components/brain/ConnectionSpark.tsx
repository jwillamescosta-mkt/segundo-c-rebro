import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import type { Note } from "@/lib/brain";
import { TypeIcon } from "./type-meta";
import { EASE } from "./motion";

const PATH = "M4 16 C 34 -2, 62 34, 92 16";

/** Duas notas ligadas por uma "sinapse" que se desenha e pulsa entre elas. */
export function ConnectionSpark({ from, to }: { from: Note; to: Note }) {
  const reduced = useReducedMotion();
  return (
    <div className="flex items-center gap-1">
      <Chip note={from} delay={0} />
      <svg width="96" height="32" viewBox="0 0 96 32" className="shrink-0 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="spark-grad" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
            <stop offset="50%" stopColor="var(--primary)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.2" />
          </linearGradient>
          <filter id="spark-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <motion.path
          d={PATH}
          fill="none"
          stroke="url(#spark-grad)"
          strokeWidth="1.6"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.35 }}
        />
        {!reduced &&
          [0, 0.9].map((begin) => (
            <g key={begin}>
              <circle r="4.5" fill="var(--primary)" opacity="0.5" filter="url(#spark-glow)">
                <animateMotion dur="1.8s" begin={`${1.4 + begin}s`} repeatCount="indefinite" path={PATH} />
              </circle>
              <circle r="1.8" fill="var(--primary)">
                <animateMotion dur="1.8s" begin={`${1.4 + begin}s`} repeatCount="indefinite" path={PATH} />
              </circle>
            </g>
          ))}
      </svg>
      <Chip note={to} delay={0.9} />
    </div>
  );
}

function Chip({ note, delay }: { note: Note; delay: number }) {
  return (
    <motion.div
      className="min-w-0 flex-1"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20, delay }}
    >
      <Link
        to="/nota/$id"
        params={{ id: note.id }}
        className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
      >
        <TypeIcon type={note.type} />
        <span className="truncate">{note.title}</span>
      </Link>
    </motion.div>
  );
}
