export const ROUTINES = ["manha", "fim-do-dia", "faxina"] as const;
export type Routine = (typeof ROUTINES)[number];
export const isRoutine = (s: string): s is Routine => (ROUTINES as readonly string[]).includes(s);

/** Notas longas sem resumo atrapalham a IA (ela teria de ler tudo). */
export const LONG_NOTE = 4000;
export const OLD_OVERDUE_DAYS = 30;
export const STALE_INDEX_DAYS = 7;

/** Chave para comparar títulos: sem acento, sem pontuação, palavras em ordem alfabética. */
export function titleKey(t: string) {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Grupos de notas com o mesmo título (ignorando acento, caixa, pontuação e ordem das palavras). Diário fica de fora. */
export function findDuplicates<T extends { title: string; type: string }>(notes: T[]) {
  const groups = new Map<string, T[]>();
  for (const n of notes) {
    if (n.type === "diario") continue;
    const k = titleKey(n.title);
    if (k.length < 3) continue;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export interface CleanupFacts {
  dateBR: string;
  duplicates: { title: string }[][];
  errors: { title: string }[];
  longNoSummary: { title: string; size: number }[];
  staleIndexes: { title: string }[];
  oldOverdue: { text: string; due: string }[];
  missingCore: string[];
  pendingSuggestions: number;
  orphans: number;
}

const ref = (t: string) => `[[${t}]]`;

/** Nota "Faxina da semana": uma caixa por item. Nada é apagado; você decide cada um. */
export function cleanupReport(f: CleanupFacts) {
  const sec = (title: string, items: string[]) =>
    items.length ? [`## ${title}`, ...items.map((i) => `- [ ] ${i}`), ""] : [];
  const body = [
    ...sec(
      "Possíveis duplicadas (junte ou renomeie)",
      f.duplicates.map((g) => g.map((n) => ref(n.title)).join(" · ")),
    ),
    ...sec(
      "Notas com erro no processamento (abra e toque em Tentar de novo)",
      f.errors.map((n) => ref(n.title)),
    ),
    ...sec(
      "Notas longas sem resumo (reanalise com IA ou resuma)",
      f.longNoSummary.map((n) => `${ref(n.title)} (${Math.round(n.size / 1000)} mil caracteres)`),
    ),
    ...sec(
      "Índices desatualizados (atualize em Mapa e índices)",
      f.staleIndexes.map((n) => ref(n.title)),
    ),
    ...sec(
      `Tarefas atrasadas há mais de ${OLD_OVERDUE_DAYS} dias (faça, remarque ou apague)`,
      f.oldOverdue.map((t) => `${t.text} — venceu em ${t.due}`),
    ),
    ...sec(
      "Núcleo incompleto (responda em Montar meu cérebro)",
      f.missingCore.map((t) => t),
    ),
  ];
  const extra = [
    f.pendingSuggestions
      ? `${f.pendingSuggestions} ligações sugeridas pela IA esperando decisão`
      : "",
    f.orphans ? `${f.orphans} notas sem nenhuma ligação` : "",
  ].filter(Boolean);
  const total = body.filter((l) => l.startsWith("- [ ]")).length;
  return [
    `# Faxina da semana ${f.dateBR}`,
    "",
    total
      ? `A rotina de sexta varreu o cérebro e achou ${total} ${total === 1 ? "ponto" : "pontos"} para revisar. Nada foi apagado nem alterado: marque cada caixa quando resolver.`
      : "A rotina de sexta varreu o cérebro e não achou nada para arrumar. 🎉",
    "",
    ...body,
    ...(extra.length ? ["## Na tela Revisar", ...extra.map((e) => `- ${e}`), ""] : []),
    "#faxina",
    "",
  ].join("\n");
}
