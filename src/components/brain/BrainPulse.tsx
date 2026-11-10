import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { animate, motion, useReducedMotion } from "motion/react";
import { Flame, Network } from "lucide-react";
import { greeting, type brainPulse } from "@/lib/pulse-utils";
import { formatDateBR } from "@/lib/tasks-utils";
import { EASE } from "./motion";

/** Número que "sobe" até o valor (parado para quem pediu menos movimento). */
function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) return setN(value);
    const c = animate(0, value, { duration: 0.9, ease: EASE, onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [value, reduced]);
  return <>{n}</>;
}

interface Props {
  name: string | null;
  total: number;
  connections: number;
  pulse: ReturnType<typeof brainPulse>;
}

/** Abertura do Início: saudação, tamanho do cérebro, sequência de dias capturando e as últimas 2 semanas. */
export function BrainPulse({ name, total, connections, pulse }: Props) {
  // A hora vem do aparelho: só depois de montar, para o servidor e o navegador não discordarem.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  const max = Math.max(1, ...pulse.days.map((d) => d.count));
  const streakText =
    pulse.streak >= 2
      ? `${pulse.streak} dias seguidos alimentando seu cérebro`
      : pulse.today > 0
        ? "Primeiro dia da sequência. Volte amanhã para manter."
        : "Capture algo hoje para começar uma sequência.";

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative overflow-hidden rounded-2xl border bg-panel/70 p-5 backdrop-blur-sm"
      style={{ backgroundImage: "radial-gradient(28rem 14rem at 100% 0%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%)" }}
    >
      <h1 className="text-2xl font-semibold tracking-tight">
        {hour === null ? "Olá" : greeting(hour)}
        {name ? `, ${name}` : ""}
      </h1>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Flame className={`size-4 ${pulse.streak >= 2 ? "text-[#ffc46b]" : ""}`} /> {streakText}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
        <dl className="flex gap-6">
          {[
            ["Notas", total],
            ["Conexões", connections],
            ["Hoje", pulse.today],
          ].map(([label, value]) => (
            <div key={label}>
              <dd className="font-mono text-3xl font-semibold tabular-nums"><CountUp value={value as number} /></dd>
              <dt className="text-xs text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>

        <div className="ml-auto">
          <div role="img" aria-label={`Capturas nos últimos ${pulse.days.length} dias`} className="flex h-12 items-end gap-1">
            {pulse.days.map((d, i) => (
              <motion.span
                key={d.date}
                title={`${formatDateBR(d.date)}: ${d.count} captura${d.count === 1 ? "" : "s"}`}
                initial={{ height: 3 }}
                animate={{ height: d.count ? 6 + (d.count / max) * 42 : 3 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.15 + i * 0.03 }}
                className={`w-2 rounded-full ${d.count === 0 ? "bg-muted-foreground/25" : i === pulse.days.length - 1 ? "bg-primary shadow-[0_0_10px_var(--primary)]" : "bg-primary/55"}`}
              />
            ))}
          </div>
          <p className="mt-1 text-right text-[11px] text-muted-foreground">últimos {pulse.days.length} dias</p>
        </div>
      </div>

      <Link to="/grafo" className="mt-4 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
        <Network className="size-3.5" /> Explorar o grafo
      </Link>
    </motion.section>
  );
}
