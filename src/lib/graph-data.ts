import type { Link, Note } from "./brain";
import type { GLink, GNode } from "@/components/brain/GraphCanvas";

export function buildGraph(
  notes: Pick<Note, "id" | "title" | "type" | "tags">[],
  links: Link[],
  opts: { showSuggested?: boolean; showOrphans?: boolean; types?: Set<string> | null; tag?: string | null; only?: Set<string> | null } = {},
) {
  const { showSuggested = true, showOrphans = true, types = null, tag = null, only = null } = opts;
  const allowed = new Set(
    notes
      .filter((n) => (!types || types.has(n.type)) && (!tag || n.tags.includes(tag)) && (!only || only.has(n.id)))
      .map((n) => n.id),
  );
  const gl: GLink[] = [];
  const seen = new Set<string>();
  const degree = new Map<string, number>();
  for (const l of links) {
    if (l.status === "rejeitada") continue;
    if (l.status === "sugerida" && !showSuggested) continue;
    if (!allowed.has(l.source_note_id) || !allowed.has(l.target_note_id)) continue;
    const key = [l.source_note_id, l.target_note_id].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    gl.push({ source: l.source_note_id, target: l.target_note_id, suggested: l.status === "sugerida" });
    if (l.status === "aceita") {
      degree.set(l.source_note_id, (degree.get(l.source_note_id) ?? 0) + 1);
      degree.set(l.target_note_id, (degree.get(l.target_note_id) ?? 0) + 1);
    }
  }
  const connected = new Set(gl.flatMap((l) => [l.source, l.target]));
  const nodes: GNode[] = notes
    .filter((n) => allowed.has(n.id) && (showOrphans || connected.has(n.id)))
    .map((n) => ({ id: n.id, title: n.title, type: n.type, degree: degree.get(n.id) ?? 0 }));
  return { nodes, links: gl };
}

export function localNeighborhood(id: string, links: Link[], depth = 2) {
  const set = new Set([id]);
  let frontier = new Set([id]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const l of links) {
      if (l.status === "rejeitada") continue;
      if (frontier.has(l.source_note_id) && !set.has(l.target_note_id)) next.add(l.target_note_id);
      if (frontier.has(l.target_note_id) && !set.has(l.source_note_id)) next.add(l.source_note_id);
    }
    next.forEach((x) => set.add(x));
    frontier = next;
  }
  return set;
}
