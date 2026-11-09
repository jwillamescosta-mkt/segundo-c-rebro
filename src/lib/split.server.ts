import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { askTerms } from "./ask-utils";
import { normalizeTitle } from "./markdown-utils";
import {
  AUTO_ENTITY_CONFIDENCE,
  PROFILE_TITLE,
  SPLIT_KEY,
  buildChildContent,
  cleanRefs,
  cleanTopics,
  profileForPrompt,
} from "./split-utils";
import { syncWikilinks } from "./wikilink-sync";

type DB = SupabaseClient<Database>;
type EntityNote = { id: string; title: string; type: string; summary: string | null };

async function entityNotes(db: DB): Promise<EntityNote[]> {
  const out: EntityNote[] = [];
  for (let from = 0; from < 3000; from += 1000) {
    const { data } = await db.from("notes").select("id,title,type,summary").in("type", ["pessoa", "cliente", "projeto"]).range(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Primeira passada: o que o app já sabe (perfil, pessoas/projetos e notas parecidas) para a IA entender o contexto. */
export async function gatherContext(db: DB, noteId: string | null, text: string) {
  const [{ data: profile }, entities, { data: rules }] = await Promise.all([
    db.from("notes").select("content").eq("title", PROFILE_TITLE).maybeSingle(),
    entityNotes(db),
    // Notas em que o próprio usuário explica à IA como organizar (ex.: "Diretrizes de Vinculação: ...").
    (noteId ? db.from("notes").select("title,content").ilike("title", "diretriz%").neq("id", noteId) : db.from("notes").select("title,content").ilike("title", "diretriz%")).limit(5),
  ]);
  const terms = askTerms(text.slice(0, 3000));
  const { data: hits } = terms.length ? await db.rpc("search_notes", { q: terms.join(" or ") }) : { data: [] };
  const relatedIds = (hits ?? []).map((h) => h.id).filter((id) => id !== noteId).slice(0, 12);
  const { data: related } = relatedIds.length ? await db.from("notes").select("title,summary").in("id", relatedIds) : { data: [] };

  const profileText = profileForPrompt(profile?.content ?? "");
  const known = new Set(entities.map((e) => normalizeTitle(e.title)));
  const prompt = [
    profileText ? `PERFIL DO USUÁRIO (quem ele é, família, trabalho e rotina):\n${profileText}` : "",
    rules?.length
      ? `DIRETRIZES QUE O USUÁRIO ESCREVEU PARA ORGANIZAR AS NOTAS (siga-as):\n${rules.map((r) => `## ${r.title}\n${(r.content ?? "").slice(0, 1500)}`).join("\n\n")}`
      : "",
    entities.length
      ? `PESSOAS, CLIENTES E PROJETOS JÁ CADASTRADOS (use o título EXATO ao citar):\n${entities.slice(0, 200).map((e) => `- ${e.title} (${e.type})${e.summary ? `: ${e.summary.slice(0, 100)}` : ""}`).join("\n")}`
      : "",
    related?.length ? `NOTAS PARECIDAS QUE JÁ EXISTEM:\n${related.map((r) => `- ${r.title}: ${(r.summary ?? "").slice(0, 120)}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { prompt, entities, known };
}

/** Uma ligação da IA (idempotente: não duplica nem troca ligações já existentes). */
async function linkIa(db: DB, userId: string, source: string, target: string, reason: string, confidence: number) {
  if (source === target) return;
  await db.from("links").upsert(
    { user_id: userId, source_note_id: source, target_note_id: target, kind: "ia", reason: reason.slice(0, 300), confidence, status: confidence >= AUTO_ENTITY_CONFIDENCE ? "aceita" : "sugerida" },
    { onConflict: "source_note_id,target_note_id", ignoreDuplicates: true },
  );
}

export interface SplitInput {
  noteId: string;
  userId: string;
  sourceTitle: string;
  sourceType: string;
  topics: unknown;
  refs: unknown;
  entities: EntityNote[];
  known: Set<string>;
}

/**
 * Segunda passada: aplica o que a IA entendeu.
 * - pessoas/clientes/projetos citados viram (ou reaproveitam) uma nota única e são ligados à captura;
 * - se a captura tem 2+ assuntos distintos, cada um vira uma nota própria ligada à origem.
 * O diário nunca é separado. Capturas já separadas não são separadas de novo (use "Desfazer" antes).
 */
export async function applySplit(db: DB, input: SplitInput) {
  const { noteId, userId, sourceTitle } = input;
  // `known` e `entities` são compartilhados: o que for criado para uma nota do lote já vale para as próximas.
  const known = input.known;
  const byTitle = new Map(input.entities.map((e) => [normalizeTitle(e.title), e]));

  // 1) Pessoas, clientes e projetos
  for (const ref of cleanRefs(input.refs)) {
    const key = normalizeTitle(ref.name);
    let target = byTitle.get(key);
    if (!target && ref.confidence >= AUTO_ENTITY_CONFIDENCE) {
      const { data } = await db
        .from("notes")
        .insert({
          user_id: userId,
          title: ref.name,
          type: ref.type,
          tags: [ref.type],
          summary: ref.relation || null,
          content: `# ${ref.name}\n\n${ref.relation ? ref.relation + "\n" : ""}\n#${ref.type}\n`,
          source_kind: "texto",
          status: "pronta",
          entities: {},
        })
        .select("id,title,type,summary")
        .single();
      if (data) {
        target = data;
        byTitle.set(key, data);
        input.entities.push(data);
        known.add(key);
      }
    }
    if (target && target.id !== noteId) await linkIa(db, userId, noteId, target.id, ref.relation || "Citado nesta captura", ref.confidence);
  }

  // 2) Vários assuntos → várias notas
  if (input.sourceType === "diario") return { created: 0 };
  const topics = cleanTopics(input.topics);
  if (!topics.length) return { created: 0 };
  const { data: existing } = await db.from("notes").select("id").eq(`entities->>${SPLIT_KEY}`, noteId).limit(1);
  if (existing?.length) return { created: 0 };

  known.add(normalizeTitle(sourceTitle));
  let created = 0;
  for (const topic of topics) {
    const content = buildChildContent(topic, sourceTitle, known);
    const { data: child, error } = await db
      .from("notes")
      .insert({
        user_id: userId,
        title: topic.title,
        type: topic.type,
        tags: [...new Set([...topic.tags, "ponto"])],
        summary: topic.summary || null,
        content,
        source_kind: "texto",
        status: "pronta",
        entities: { [SPLIT_KEY]: noteId },
      })
      .select("id")
      .single();
    if (error || !child) continue;
    created++;
    known.add(normalizeTitle(topic.title));
    await syncWikilinks(db, userId, child.id, content); // liga o ponto à origem e às pessoas/projetos citados
  }
  return { created };
}
