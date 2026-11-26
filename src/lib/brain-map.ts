import { isCoreNote } from "./core-utils";
import { NOTE_TYPES } from "./markdown-utils";

/** Tag das notas-índice (MOC) que a IA escreve por tipo. */
export const INDEX_TAG = "indice";
export const MAP_TITLE = "Mapa do cérebro";
export const CORE_FOLDER = "Núcleo";

export interface MapNote {
  id: string;
  title: string;
  type: string;
  tags: string[];
  summary: string | null;
}
export interface MapLink {
  source_note_id: string;
  target_note_id: string;
  status: string;
}

const short = (s: string | null, n = 90) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const line = (n: MapNote) => `- [[${n.title}]]${n.summary ? ` — ${short(n.summary)}` : ""}`;

/** Pasta de cada nota no export: núcleo à parte, o resto por tipo. */
export function folderOf(n: Pick<MapNote, "title" | "type" | "tags">) {
  if (isCoreNote(n)) return CORE_FOLDER;
  // A nota-índice mora na pasta do tipo que ela indexa (tags: ["indice", "<tipo>"]).
  const type = n.tags.includes(INDEX_TAG)
    ? (n.tags.find((t) => NOTE_TYPES.some((x) => x.value === t)) ?? n.type)
    : n.type;
  return NOTE_TYPES.find((t) => t.value === type)?.label ?? "Outras";
}

/**
 * O "AGENTS.md" do cérebro: o que existe e por onde começar, para a IA (e você) achar as coisas sem ler tudo.
 * Gerado dos dados, sem IA: sempre bate com o que está no banco.
 */
export function buildBrainMap(
  notes: MapNote[],
  links: MapLink[],
  opts: { folders?: boolean } = {},
) {
  const degree = new Map<string, number>();
  for (const l of links) {
    if (l.status !== "aceita") continue;
    degree.set(l.source_note_id, (degree.get(l.source_note_id) ?? 0) + 1);
    degree.set(l.target_note_id, (degree.get(l.target_note_id) ?? 0) + 1);
  }
  const byDegree = (a: MapNote, b: MapNote) =>
    (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.title.localeCompare(b.title, "pt-BR");
  const core = notes.filter(isCoreNote).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const indexes = notes
    .filter((n) => n.tags.includes(INDEX_TAG))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const tagCount = new Map<string, number>();
  for (const n of notes) for (const t of n.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const topTags = [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, 25);

  const out = [
    `# ${MAP_TITLE}`,
    "",
    `Segundo cérebro pessoal, em português do Brasil: ${notes.length} notas e ${links.filter((l) => l.status === "aceita").length} ligações. Gerado automaticamente; não edite à mão.`,
    "",
    "## Como navegar",
    "1. Leia primeiro o **Núcleo**: quem é o usuário, estratégia, clientes, oferta, tom de voz e rotina. Ele vale para qualquer tarefa.",
    "2. Para um assunto, abra o **índice** do tipo (clientes, projetos…) antes de procurar nota por nota.",
    "3. As notas guardam resumos; o material bruto fica no link ou anexo citado na nota. Só busque o bruto se precisar.",
    "4. `[[Título]]` é uma ligação para outra nota. Ao citar, use o título exato.",
    ...(opts.folders
      ? ["5. Cada pasta tem um `_indice.md` com todas as notas dela e um resumo de cada."]
      : []),
    "",
    "## Núcleo (leia primeiro)",
    ...(core.length ? core.map(line) : ['- (ainda vazio: use "Montar meu cérebro" no app)']),
  ];
  if (indexes.length) out.push("", "## Índices", ...indexes.map(line));
  out.push("", "## Áreas");
  for (const t of NOTE_TYPES) {
    const list = notes.filter(
      (n) => n.type === t.value && !isCoreNote(n) && !n.tags.includes(INDEX_TAG),
    );
    if (!list.length) continue;
    out.push(
      "",
      `### ${t.label} (${list.length})${opts.folders ? ` — pasta \`${t.label}/\`` : ""}`,
    );
    if (t.value === "diario") {
      out.push("Uma nota por dia (capturas e briefing do dia). Busque pela data.");
      continue;
    }
    out.push(...list.sort(byDegree).slice(0, 12).map(line));
    if (list.length > 12)
      out.push(
        `- … e mais ${list.length - 12}${opts.folders ? " (veja o `_indice.md` da pasta)" : ""}`,
      );
  }
  if (topTags.length)
    out.push("", "## Tags mais usadas", topTags.map(([t, c]) => `#${t} (${c})`).join(" · "));
  return out.join("\n") + "\n";
}

/** `_indice.md` de uma pasta do export: todas as notas dela, as mais conectadas primeiro. */
export function folderIndex(folder: string, notes: MapNote[], fileOf: (id: string) => string) {
  const idx = notes.filter((n) => n.tags.includes(INDEX_TAG));
  const rest = notes
    .filter((n) => !n.tags.includes(INDEX_TAG))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  return (
    [
      `# Índice — ${folder}`,
      "",
      `${notes.length} nota${notes.length === 1 ? "" : "s"}. Volte ao [[AGENTS]] para o mapa geral.`,
      ...(idx.length
        ? ["", "Índice escrito pela IA: " + idx.map((n) => `[[${fileOf(n.id)}]]`).join(", ")]
        : []),
      "",
      ...rest.map((n) => `- [[${fileOf(n.id)}]]${n.summary ? ` — ${short(n.summary, 140)}` : ""}`),
    ].join("\n") + "\n"
  );
}
