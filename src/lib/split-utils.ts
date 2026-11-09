import { NOTE_TYPE_VALUES, WIKILINK_RE, normalizeTitle } from "./markdown-utils";

/** Um assunto distinto dentro de uma captura (vira nota própria). */
export interface Topic {
  title: string;
  type: string;
  summary: string;
  content: string;
  tags: string[];
  confidence: number;
}

/** Pessoa, cliente ou projeto citado na captura. */
export interface EntityRef {
  name: string;
  type: "pessoa" | "cliente" | "projeto";
  relation: string;
  confidence: number;
}

export const MIN_TOPIC_CONFIDENCE = 0.7;
export const AUTO_ENTITY_CONFIDENCE = 0.85;
export const MAX_TOPICS = 6;
export const PROFILE_TITLE = "Quem sou eu";
export const SPLIT_KEY = "split_from";

const clamp01 = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0));

/**
 * Filtra os assuntos devolvidos pela IA. Só vale separar quando sobram 2 ou mais:
 * uma captura com um assunto só continua sendo uma nota só.
 */
export function cleanTopics(raw: unknown): Topic[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Topic[] = [];
  for (const t of raw as Partial<Topic>[]) {
    const title = String(t?.title ?? "").trim().slice(0, 120);
    const content = String(t?.content ?? "").trim();
    const key = normalizeTitle(title);
    const confidence = clamp01(t?.confidence);
    if (!title || !content || seen.has(key) || confidence < MIN_TOPIC_CONFIDENCE) continue;
    seen.add(key);
    out.push({
      title,
      content,
      summary: String(t?.summary ?? "").trim().slice(0, 400),
      type: (NOTE_TYPE_VALUES as string[]).includes(String(t?.type)) && t?.type !== "diario" ? String(t?.type) : "ideia",
      tags: Array.isArray(t?.tags) ? t.tags.map((x) => String(x).trim().replace(/^#/, "").toLowerCase()).filter(Boolean).slice(0, 5) : [],
      confidence,
    });
    if (out.length === MAX_TOPICS) break;
  }
  return out.length >= 2 ? out : [];
}

const ENTITY_TYPES = new Set(["pessoa", "cliente", "projeto"]);

export function cleanRefs(raw: unknown): EntityRef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: EntityRef[] = [];
  for (const r of raw as Partial<EntityRef>[]) {
    const name = String(r?.name ?? "").trim().slice(0, 80);
    const key = normalizeTitle(name);
    if (name.length < 2 || seen.has(key) || !ENTITY_TYPES.has(String(r?.type))) continue;
    seen.add(key);
    out.push({
      name,
      type: r!.type as EntityRef["type"],
      relation: String(r?.relation ?? "").trim().slice(0, 120),
      confidence: clamp01(r?.confidence),
    });
  }
  return out.slice(0, 10);
}

/** Troca [[Título]] por texto simples quando o título não existe: a IA não pode "inventar" notas. */
export function sanitizeWikilinks(text: string, known: Set<string>) {
  return text.replace(new RegExp(WIKILINK_RE.source, "g"), (m, title: string, alias?: string) =>
    known.has(normalizeTitle(title)) ? m : (alias ?? title).trim(),
  );
}

/** Conteúdo da nota de um ponto: o trecho, mais a origem (vira ligação via wikilink). */
export function buildChildContent(topic: Topic, sourceTitle: string, known: Set<string>) {
  return `# ${topic.title}\n\n${sanitizeWikilinks(topic.content, known)}\n\nOrigem: [[${sourceTitle}]]\n`;
}

/** Texto do perfil sem as linhas ainda não preenchidas do modelo. */
export function profileForPrompt(content: string) {
  return content
    .split("\n")
    .filter((l) => !/\(preencha[^)]*\)/i.test(l) && l.trim() !== "-")
    .join("\n")
    .trim()
    .slice(0, 6000);
}

export const PROFILE_TEMPLATE = `# Quem sou eu

Esta nota é lida pela IA antes de analisar qualquer captura, para entender quem é "ela", "o chefe" ou "o pequeno". Preencha o que quiser, em poucas linhas, e **evite** dados sensíveis (documentos, senhas, saúde de terceiros).

## Família
- (preencha: quem mora com você e como se chamam. Ex.: esposa, filhos, pais)

## Trabalho
- (preencha: onde trabalha, cargo, equipe, chefe, clientes principais)

## Rotina
- (preencha: horários fixos, dias de cada atividade, o que não pode faltar)

## Papéis que quero cuidar
- (preencha: pai, esposo, profissional, estudante...)

## O que quero melhorar
- (preencha: hábitos, relações ou resultados que você quer evoluir)

#perfil
`;
