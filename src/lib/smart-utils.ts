/** Passada inteligente em lote: separar em pontos, reconhecer pessoas/projetos e conectar notas. */

export const SMART_KEY = "smart_pass";
export const MAX_BATCH = 20;

/** Opções de quantas notas esperar antes de rodar sozinho. 0 = só quando o usuário pedir. */
export const THRESHOLDS = [
  { value: 1, label: "A cada nota" },
  { value: 5, label: "A cada 5 notas" },
  { value: 10, label: "A cada 10 notas" },
  { value: 20, label: "A cada 20 notas" },
  { value: 0, label: "Só manual" },
] as const;
export const DEFAULT_THRESHOLD = 10;
const STORAGE_KEY = "sc-lote-n";

/** A nota espera pela passada inteligente? (marcador guardado em entities, sem mudar o banco) */
export function isSmartPending(n: { entities: unknown; status: string; type: string }) {
  if (n.status !== "pronta" || n.type === "diario") return false;
  return (n.entities as Record<string, unknown> | null)?.[SMART_KEY] === "pendente";
}

/** Mescla o marcador nas entidades da nota, preservando as outras chaves (ex.: split_from). */
export function withSmart(entities: unknown, state: "pendente" | "feito" | null) {
  const base = { ...((entities as Record<string, unknown> | null) ?? {}) };
  if (state) base[SMART_KEY] = state;
  else delete base[SMART_KEY];
  return base;
}

/** Hora de rodar sozinho? Só com limite ligado e notas suficientes na fila. */
export function shouldAutoRun(pending: number, threshold: number) {
  return threshold > 0 && pending >= threshold;
}

export function readThreshold() {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return THRESHOLDS.some((t) => t.value === v) && localStorage.getItem(STORAGE_KEY) !== null ? v : DEFAULT_THRESHOLD;
  } catch {
    return DEFAULT_THRESHOLD;
  }
}

export function writeThreshold(v: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}
