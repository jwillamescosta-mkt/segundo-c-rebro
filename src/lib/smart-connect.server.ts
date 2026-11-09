import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { askTerms } from "./ask-utils";
import { linkStatusForConfidence } from "./markdown-utils";
import { chatTool } from "./pipeline.server";

type DB = SupabaseClient<Database>;
export interface BatchNote {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
}

const MAX_POOL = 150;
const MAX_LINKS_PER_NOTE = 6;

const schema = {
  type: "object",
  properties: {
    links: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string", description: "ID da nota do grupo (lista 'NOTAS DO GRUPO')." },
          to: { type: "string", description: "ID de uma nota candidata ou de outra nota do grupo." },
          reason: { type: "string", description: "Por que se conectam, em até 120 caracteres." },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["from", "to", "reason", "confidence"],
      },
    },
  },
  required: ["links"],
};

/** Chave da dupla, sem importar a direção (A→B e B→A são a mesma ligação). */
export const pairKey = (a: string, b: string) => [a, b].sort().join("|");

/** Candidatas: busca de texto por nota + as mais recentes, para o grupo todo numa única chamada. */
async function candidatePool(db: DB, batch: BatchNote[]) {
  const ids = new Set<string>();
  for (const n of batch) {
    const terms = askTerms(`${n.title} ${(n.tags ?? []).join(" ")}`);
    if (!terms.length) continue;
    const { data } = await db.rpc("search_notes", { q: terms.join(" or ") });
    for (const h of (data ?? []).slice(0, 8)) ids.add(h.id);
  }
  const { data: recent } = await db.from("notes").select("id").order("updated_at", { ascending: false }).limit(40);
  for (const r of recent ?? []) ids.add(r.id);
  for (const n of batch) ids.delete(n.id); // as do grupo entram à parte
  const wanted = [...ids].slice(0, MAX_POOL);
  if (!wanted.length) return [] as BatchNote[];
  const { data } = await db.from("notes").select("id,title,summary,tags").in("id", wanted);
  return (data ?? []) as BatchNote[];
}

/** Uma chamada de IA conecta todas as notas do grupo ao histórico e entre si. Retorna quantas ligações novas. */
export async function connectBatch(db: DB, userId: string, batch: BatchNote[]) {
  const pool = await candidatePool(db, batch);
  const valid = new Set([...pool.map((p) => p.id), ...batch.map((b) => b.id)]);
  const inBatch = new Set(batch.map((b) => b.id));

  const { data: existing } = await db
    .from("links")
    .select("source_note_id,target_note_id")
    .or(`source_note_id.in.(${[...inBatch].join(",")}),target_note_id.in.(${[...inBatch].join(",")})`);
  const linked = new Set((existing ?? []).map((l) => pairKey(l.source_note_id, l.target_note_id)));

  const line = (n: BatchNote) => JSON.stringify({ id: n.id, titulo: n.title, resumo: (n.summary ?? "").slice(0, 200), tags: n.tags });
  const r = await chatTool<{ links: { from: string; to: string; reason: string; confidence: number }[] }>(
    "Você encontra conexões significativas entre notas de um segundo cérebro pessoal. Para cada nota do GRUPO, escolha até 6 notas realmente relacionadas, entre as CANDIDATAS ou entre as próprias notas do grupo. " +
      "Conecte só quando há relação de verdade (mesma pessoa, mesmo projeto ou cliente, causa e efeito, continuação, contradição). Não force conexões fracas. Motivo curto em português e confiança de 0 a 1.",
    `NOTAS DO GRUPO:\n${batch.map(line).join("\n")}\n\nNOTAS CANDIDATAS (histórico):\n${pool.map(line).join("\n") || "(nenhuma)"}`,
    "sugerir_ligacoes",
    schema,
  );

  const perNote = new Map<string, number>();
  const rows: Database["public"]["Tables"]["links"]["Insert"][] = [];
  for (const l of r.links ?? []) {
    const key = pairKey(l.from, l.to);
    if (!inBatch.has(l.from) || !valid.has(l.to) || l.from === l.to || linked.has(key)) continue;
    if ((perNote.get(l.from) ?? 0) >= MAX_LINKS_PER_NOTE) continue;
    perNote.set(l.from, (perNote.get(l.from) ?? 0) + 1);
    linked.add(key);
    const confidence = Math.max(0, Math.min(1, Number(l.confidence) || 0));
    rows.push({
      user_id: userId,
      source_note_id: l.from,
      target_note_id: l.to,
      kind: "ia",
      reason: String(l.reason ?? "").slice(0, 300),
      confidence,
      status: linkStatusForConfidence(confidence),
    });
  }
  if (rows.length) await db.from("links").upsert(rows, { onConflict: "source_note_id,target_note_id", ignoreDuplicates: true });
  return rows.length;
}
