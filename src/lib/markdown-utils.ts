export const NOTE_TYPES = [
  { value: "ideia", label: "Ideias", singular: "Ideia" },
  { value: "tarefa", label: "Tarefas", singular: "Tarefa" },
  { value: "cliente", label: "Clientes", singular: "Cliente" },
  { value: "projeto", label: "Projetos", singular: "Projeto" },
  { value: "conteudo", label: "Conteúdos", singular: "Conteúdo" },
  { value: "pessoa", label: "Pessoas", singular: "Pessoa" },
  { value: "referencia", label: "Referências", singular: "Referência" },
  { value: "diario", label: "Diário", singular: "Diário" },
  { value: "aprendizado", label: "Aprendizados", singular: "Aprendizado" },
] as const;

export type NoteType = (typeof NOTE_TYPES)[number]["value"];
export const NOTE_TYPE_VALUES = NOTE_TYPES.map((t) => t.value) as NoteType[];

export function typeLabel(t: string, singular = true) {
  const f = NOTE_TYPES.find((x) => x.value === t);
  return f ? (singular ? f.singular : f.label) : t;
}

export const WIKILINK_RE = /\[\[([^[\]|#\n]+)(?:#[^[\]|\n]*)?(?:\|([^[\]\n]+))?\]\]/g;

export function normalizeTitle(t: string) {
  return t.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

/** Unique wikilink targets ([[Título]] or [[Título|alias]]) in a markdown text. */
export function extractWikilinks(md: string): string[] {
  const out = new Map<string, string>();
  for (const m of md.matchAll(WIKILINK_RE)) {
    const title = m[1].trim();
    if (title) out.set(normalizeTitle(title), title);
  }
  return [...out.values()];
}

/** #tags in text (lowercase, unique). Markdown headings ("# Título") are ignored. */
export function extractHashtags(md: string): string[] {
  const cleaned = md.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const out = new Set<string>();
  for (const m of cleaned.matchAll(/(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/gu)) {
    const tag = m[2].toLocaleLowerCase("pt-BR");
    if (!/^\d+$/.test(tag)) out.add(tag);
  }
  return [...out];
}

export function mergeTags(...lists: (string[] | null | undefined)[]): string[] {
  const s = new Set<string>();
  for (const l of lists) for (const t of l ?? []) {
    const v = t.trim().replace(/^#/, "").toLocaleLowerCase("pt-BR");
    if (v) s.add(v);
  }
  return [...s];
}

/** AI link rule: confidence ≥ 0.85 enters already accepted, otherwise as suggestion. */
export function linkStatusForConfidence(confidence: number): "aceita" | "sugerida" {
  return confidence >= 0.85 ? "aceita" : "sugerida";
}

export function sanitizeFilename(title: string) {
  const s = title.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim();
  return (s || "Sem título").slice(0, 120);
}

export interface ExportableNote {
  title: string;
  content: string;
  type: string;
  tags: string[];
  summary: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

function yamlStr(v: string) {
  return JSON.stringify(v);
}

/** Obsidian-compatible markdown with YAML frontmatter; missing links are appended as [[wikilinks]]. */
export function noteToMarkdown(note: ExportableNote, linkedTitles: string[]): string {
  const fm = [
    "---",
    `tipo: ${note.type}`,
    `tags: [${note.tags.map(yamlStr).join(", ")}]`,
    `criado: ${note.created_at}`,
    `atualizado: ${note.updated_at}`,
  ];
  if (note.summary) fm.push(`resumo: ${yamlStr(note.summary)}`);
  if (note.source_url) fm.push(`fonte: ${yamlStr(note.source_url)}`);
  fm.push("---", "");
  const present = new Set(extractWikilinks(note.content).map(normalizeTitle));
  const missing = linkedTitles.filter((t) => !present.has(normalizeTitle(t)));
  let body = note.content.trim();
  if (missing.length) {
    body += `\n\n## Ligações\n\n${missing.map((t) => `- [[${sanitizeFilename(t)}]]`).join("\n")}`;
  }
  return fm.join("\n") + body + "\n";
}

/** Escape HTML from ts_headline output but keep its <mark> tags. */
export function safeHeadline(h: string) {
  return h
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

export function isUrl(s: string) {
  return /^https?:\/\/[^\s]+$/i.test(s.trim());
}
