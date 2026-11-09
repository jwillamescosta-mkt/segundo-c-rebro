import { GatewayError } from "@lovable.dev/ai-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { NOTE_TYPE_VALUES } from "./markdown-utils";
import { chatTool, todayContext } from "./pipeline.server";
import { MAX_BATCH, SMART_KEY, withSmart } from "./smart-utils";
import { connectBatch } from "./smart-connect.server";
import { applySplit, gatherContext } from "./split.server";

type DB = SupabaseClient<Database>;
const NOTE_CHARS = 2500;

const schema = {
  type: "object",
  properties: {
    notes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "ID da nota, exatamente como informado." },
          topics: {
            type: "array",
            description:
              "Preencha SOMENTE se a nota trata de 2 ou mais assuntos realmente distintos (ex.: filho + trabalho + saúde). Um item por assunto. Vazio se for um assunto só.",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                type: { type: "string", enum: NOTE_TYPE_VALUES },
                summary: { type: "string", description: "Uma frase." },
                content: {
                  type: "string",
                  description:
                    "O trecho da nota sobre este assunto, com as palavras do usuário, completado com o contexto necessário (quem é 'ela', de qual projeto). Use [[Título exato]] para pessoas, clientes e projetos já cadastrados.",
                },
                tags: { type: "array", items: { type: "string" } },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["title", "type", "summary", "content", "tags", "confidence"],
            },
          },
          refs: {
            type: "array",
            description: "Pessoas, clientes e projetos citados (inclusive por pronome ou apelido, resolvidos pelo contexto).",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Título exato se já cadastrado; senão o nome completo mais usado." },
                type: { type: "string", enum: ["pessoa", "cliente", "projeto"] },
                relation: { type: "string", description: "Papel em relação ao usuário (ex.: 'esposa', 'filho', 'cliente de marketing')." },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["name", "type", "relation", "confidence"],
            },
          },
        },
        required: ["id", "topics", "refs"],
      },
    },
  },
  required: ["notes"],
};

type Classified = { notes: { id: string; topics?: unknown; refs?: unknown }[] };

/**
 * Passada inteligente em lote. O contexto (perfil, diretrizes, pessoas e projetos) é carregado UMA vez,
 * e duas chamadas de IA cobrem o grupo todo: classificar/separar e conectar.
 * Se algo falhar, nada é marcado como feito e o lote pode ser tentado de novo.
 */
export async function runSmartPass(db: DB, userId: string, ids?: string[]) {
  try {
    let q = db
      .from("notes")
      .select("id,title,type,summary,content,tags,entities")
      .eq("status", "pronta")
      .neq("type", "diario")
      .eq(`entities->>${SMART_KEY}`, "pendente")
      .order("created_at")
      .limit(MAX_BATCH);
    if (ids?.length) q = q.in("id", ids);
    const { data: batch } = await q;
    if (!batch?.length) return { ok: true as const, processed: 0, points: 0, links: 0 };

    const ctx = await gatherContext(db, null, batch.map((n) => `${n.title} ${n.summary ?? ""} ${(n.content ?? "").slice(0, 300)}`).join("\n"));
    const today = todayContext();
    const result = await chatTool<Classified>(
      `Você organiza um segundo cérebro pessoal em português do Brasil. Hoje é ${today.human}. Para CADA nota do grupo, identifique as pessoas, clientes e projetos citados (refs) e, se houver assuntos realmente distintos, separe-os (topics). ` +
        "Use o PERFIL, as DIRETRIZES e os cadastros para entender o contexto: resolva pronomes, apelidos e papéis (quem é 'ela', 'o chefe', 'o pequeno') e prefira SEMPRE o título exato de quem já está cadastrado. " +
        "Separe apenas assuntos que fariam sentido como notas independentes; NUNCA fragmente um assunto único e não invente nada que o usuário não disse. Devolva uma entrada por nota, com o mesmo id.",
      `${ctx.prompt ? ctx.prompt + "\n\n---\n\n" : ""}NOTAS DO GRUPO:\n\n${batch
        .map((n) => `### ID: ${n.id}\nTítulo: ${n.title}\nResumo: ${n.summary ?? ""}\nConteúdo:\n${(n.content ?? "").slice(0, NOTE_CHARS)}`)
        .join("\n\n")}`,
      "classificar_notas",
      schema,
    );

    let points = 0;
    const byId = new Map((result.notes ?? []).map((x) => [x.id, x]));
    for (const n of batch) {
      const r = byId.get(n.id);
      if (!r) continue;
      // Uma nota com problema não derruba o lote: as outras seguem.
      const out = await applySplit(db, {
        noteId: n.id,
        userId,
        sourceTitle: n.title,
        sourceType: n.type,
        topics: r.topics,
        refs: r.refs,
        entities: ctx.entities,
        known: ctx.known,
      }).catch((e) => {
        console.warn("separação falhou", n.id, e);
        return { created: 0 };
      });
      points += out.created;
    }

    const links = await connectBatch(db, userId, batch.map((n) => ({ id: n.id, title: n.title, summary: n.summary, tags: n.tags ?? [] })));

    for (const n of batch) await db.from("notes").update({ entities: withSmart(n.entities, "feito") as Json }).eq("id", n.id);
    return { ok: true as const, processed: batch.length, points, links };
  } catch (e) {
    console.error("passada-inteligente", e);
    let error = "Não consegui rodar a conexão inteligente agora. Tente de novo.";
    if (e instanceof GatewayError) {
      if (e.httpStatus === 402) error = "Créditos de IA esgotados. Adicione créditos e tente de novo.";
      else if (e.httpStatus === 429) error = "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
    }
    return { ok: false as const, error };
  }
}
