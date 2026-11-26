import { NOTE_TYPES } from "./markdown-utils";

/** Tipos que ganham nota-índice (diário e tarefa já têm telas próprias). */
export const INDEXABLE = NOTE_TYPES.filter((t) => t.value !== "diario" && t.value !== "tarefa");
export const indexTitle = (label: string) => `Índice — ${label}`;
