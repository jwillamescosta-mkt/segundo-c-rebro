import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { extractWikilinks, normalizeTitle } from "./markdown-utils";

type DB = SupabaseClient<Database>;

/** Make 'wikilink' links mirror the [[wikilinks]] present in a note's content. */
export async function syncWikilinks(db: DB, userId: string, noteId: string, content: string) {
  const targets = extractWikilinks(content).map(normalizeTitle);
  // Pagina: o PostgREST devolve no máximo 1000 linhas por consulta.
  const notes: { id: string; title: string }[] = [];
  for (let from = 0; targets.length; from += 1000) {
    const { data } = await db.from("notes").select("id,title").range(from, from + 999);
    notes.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const byTitle = new Map(notes.map((n) => [normalizeTitle(n.title), n.id]));
  const wanted = new Set(
    targets.map((t) => byTitle.get(t)).filter((id): id is string => !!id && id !== noteId),
  );

  const { data: existing } = await db
    .from("links")
    .select("id,source_note_id,target_note_id,kind,status")
    .or(`source_note_id.eq.${noteId},target_note_id.eq.${noteId}`);

  const rows = existing ?? [];
  // remove stale wikilinks from this note
  const stale = rows.filter((l) => l.kind === "wikilink" && l.source_note_id === noteId && !wanted.has(l.target_note_id));
  if (stale.length) await db.from("links").delete().in("id", stale.map((l) => l.id));

  for (const target of wanted) {
    const fwd = rows.find((l) => l.source_note_id === noteId && l.target_note_id === target);
    if (fwd) {
      if (fwd.kind !== "wikilink" || fwd.status !== "aceita")
        await db.from("links").update({ kind: "wikilink", status: "aceita" }).eq("id", fwd.id);
      continue;
    }
    await db.from("links").insert({
      user_id: userId,
      source_note_id: noteId,
      target_note_id: target,
      kind: "wikilink",
      status: "aceita",
      confidence: 1,
    });
    // if the reverse was just a suggestion, accept it implicitly
    const rev = rows.find((l) => l.source_note_id === target && l.target_note_id === noteId && l.status === "sugerida");
    if (rev) await db.from("links").update({ status: "aceita" }).eq("id", rev.id);
  }
}
