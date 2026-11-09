import { GatewayError } from "@lovable.dev/ai-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatText, todayContext } from "./pipeline.server";
import { askTerms } from "./ask-utils";
import { demoteHeadings } from "./briefing-utils";
import { syncWikilinks } from "./wikilink-sync";

type DB = SupabaseClient<Database>;
const MAX_NOTES = 25;

/** Junta as notas de um tema numa nota de síntese (com fontes, lacunas e próximos passos). */
export async function synthesize(db: DB, userId: string, topic: string) {
  try {
    const tag = topic.startsWith("#") ? topic.slice(1).toLowerCase() : null;
    const ids: string[] = [];
    if (tag) {
      const { data } = await db.from("notes").select("id").contains("tags", [tag]).neq("type", "diario").order("updated_at", { ascending: false }).limit(MAX_NOTES);
      ids.push(...(data ?? []).map((n) => n.id));
    }
    const terms = askTerms(tag ?? topic);
    if (!terms.length) terms.push((tag ?? topic).replace(/[^\p{L}\p{N} ]/gu, " ").trim()); // temas curtos como "IA"
    if (ids.length < MAX_NOTES && terms.length) {
      const { data: hits } = await db.rpc("search_notes", { q: terms.join(" or ") });
      for (const h of hits ?? []) if (!ids.includes(h.id) && ids.length < MAX_NOTES) ids.push(h.id);
    }
    if (ids.length < 2) return { ok: false as const, error: "Encontrei poucas notas sobre esse tema. Capture mais e tente de novo." };

    const { data: notes } = await db.from("notes").select("title,type,summary,content,tags").in("id", ids).neq("type", "diario");
    const sources = (notes ?? []).filter((n) => !(n.tags ?? []).includes("sintese"));
    const per = Math.max(800, Math.floor(40000 / Math.max(1, sources.length)));
    const context = sources.map((n) => `### [[${n.title}]] (${n.type})\n${n.summary ? `Resumo: ${n.summary}\n` : ""}${(n.content ?? "").slice(0, per)}`).join("\n\n---\n\n");

    const today = todayContext();
    const name = tag ? `#${tag}` : topic;
    const text = await chatText(
      `Você consolida conhecimento pessoal no estilo Zettelkasten. Hoje é ${today.human}. Escreva em português do Brasil, em markdown. ` +
        "Use só as notas fornecidas e cite cada ideia com [[Título]] exatamente como aparece. Não invente fatos. " +
        "Seções (título ###): 'Visão geral' (o tema em um parágrafo), 'Ideias principais' (lista, cada item com fonte), " +
        "'Padrões e conexões' (o que as notas dizem juntas que nenhuma diz sozinha), 'Tensões e contradições', " +
        "'O que ainda não sei' (lacunas concretas), 'Perguntas para investigar' e 'Próximos passos' (aplicações práticas no trabalho ou nos estudos).",
      [{ type: "text", text: `TEMA: ${name}\n\nNOTAS:\n\n${context}` }],
    );
    if (!text.trim()) throw new Error("A IA não respondeu.");

    const title = `Síntese: ${name}`.slice(0, 120);
    const content = `# ${title}\n\n${demoteHeadings(text).trim()}\n\n#sintese\n`;
    const { data: existing } = await db.from("notes").select("id").eq("title", title).maybeSingle();
    let noteId: string;
    if (existing) {
      noteId = existing.id;
      await db.from("notes").update({ content, summary: null }).eq("id", noteId);
    } else {
      const { data, error } = await db
        .from("notes")
        .insert({ user_id: userId, title, type: "aprendizado", tags: tag ? ["sintese", tag] : ["sintese"], content, status: "pronta", entities: {} })
        .select("id")
        .single();
      if (error) throw error;
      noteId = data.id;
    }
    await syncWikilinks(db, userId, noteId, content);
    return { ok: true as const, noteId, count: sources.length };
  } catch (e) {
    console.error("sintese", topic, e);
    let error = "Não foi possível criar a síntese agora.";
    if (e instanceof GatewayError) {
      if (e.httpStatus === 402) error = "Créditos de IA esgotados. Adicione créditos e tente de novo.";
      else if (e.httpStatus === 429) error = "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
    }
    return { ok: false as const, error };
  }
}
