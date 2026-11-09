import { motion } from "motion/react";
import { Loader2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THRESHOLDS } from "@/lib/smart-utils";
import { useApp } from "./app-context";

/** Fila da conexão inteligente: mostra quantas notas esperam, deixa escolher o lote e atualizar agora. */
export function SmartPassCard() {
  const { pendingSmart, smartBusy, runSmart, threshold, setThreshold } = useApp();
  const manual = threshold === 0;
  const hint = manual
    ? "Só roda quando você pedir."
    : pendingSmart >= threshold
      ? "Rodando em instantes…"
      : `Roda sozinha quando chegar a ${threshold} nota${threshold > 1 ? "s" : ""} (faltam ${threshold - pendingSmart}).`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-panel px-3 py-2.5 text-sm">
      <span className="rounded-md bg-primary/10 p-1.5 text-primary">
        {smartBusy ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {smartBusy ? "Conectando suas notas…" : pendingSmart > 0 ? `${pendingSmart} nota${pendingSmart > 1 ? "s" : ""} aguardando conexão inteligente` : "Conexões em dia"}
        </p>
        <p className="text-xs text-muted-foreground">{pendingSmart > 0 || smartBusy ? hint : "Separa assuntos, reconhece pessoas e liga as notas em lote."}</p>
      </div>
      <select
        value={threshold}
        onChange={(e) => setThreshold(Number(e.target.value))}
        aria-label="Quando rodar a conexão inteligente"
        className="h-8 rounded border bg-background px-1 text-xs"
      >
        {THRESHOLDS.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <motion.div whileTap={{ scale: 0.96 }}>
        <Button size="sm" disabled={smartBusy || pendingSmart === 0} onClick={() => runSmart()}>
          Atualizar agora
        </Button>
      </motion.div>
    </div>
  );
}
