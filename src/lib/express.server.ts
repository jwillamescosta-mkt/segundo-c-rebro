import { GatewayError } from "@lovable.dev/ai-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatText, todayContext } from "./pipeline.server";
import { demoteHeadings } from "./briefing-utils";
import { expressFormat, expressTitle, VOICE_TITLES, type ExpressFormat } from "./express-utils";
import { PROFILE_TITLE, profileForPrompt } from "./split-utils";
import { syncWikilinks } from "./wikilink-sync";

type DB = SupabaseClient<Database>;
const MAX_NEIGHBORS = 6;

/** Cria uma nota de conteúdo pronta (roteiro, carrossel, mensagem…) a partir de uma nota e das ligadas a ela. */
export async function expressNote(db: DB, userId: string, noteId: string, format: ExpressFormat) {
  try {
    const f = expressFormat(format);
    if (!f) return { ok: false as const, error: "Formato desconhecido." };
    const { data: note } = await db
      .from("notes")
      .select("id,title,type,summary,content,tags")
      .eq("id", noteId)
      .maybeSingle();
    if (!note) return { ok: false as const, error: "Nota não encontrada." };

    const { data: near } = await db
      .from("links")
      .select("source_note_id,target_note_id")
      .eq("status", "aceita")
      .or(`source_note_id.eq.${noteId},target_note_id.eq.${noteId}`)
      .limit(40);
    const nIds = [
      ...new Set(
        (near ?? []).map((l) =>
          l.source_note_id === noteId ? l.target_note_id : l.source_note_id,
        ),
      ),
    ].slice(0, MAX_NEIGHBORS);

    const [{ data: neighbors }, { data: voice }, { data: profile }] = await Promise.all([
      nIds.length
        ? db.from("notes").select("title,type,summary,content").in("id", nIds).neq("type", "diario")
        : Promise.resolve({ data: [] }),
      db.from("notes").select("title,content").in("title", VOICE_TITLES).limit(2),
      db.from("notes").select("content").eq("title", PROFILE_TITLE).maybeSingle(),
    ]);

    const context = [
      `## NOTA PRINCIPAL: [[${note.title}]] (${note.type})\n${note.summary ? `Resumo: ${note.summary}\n` : ""}${(note.content ?? "").slice(0, 9000)}`,
      ...(neighbors ?? []).map(
        (n) =>
          `## NOTA LIGADA: [[${n.title}]] (${n.type})\n${n.summary ? `Resumo: ${n.summary}\n` : ""}${(n.content ?? "").slice(0, 2000)}`,
      ),
    ].join("\n\n---\n\n");
    const about = profileForPrompt(profile?.content ?? "");
    const voiceText = (voice ?? [])
      .map((v) => `## ${v.title}\n${(v.content ?? "").slice(0, 3000)}`)
      .join("\n\n");

    const today = todayContext();
    const text = await chatText(
      `Você transforma o conhecimento pessoal do usuário em conteúdo pronto para publicar ou enviar. Hoje é ${today.human}. Escreva em português do Brasil, em markdown. ` +
        `Entregue: ${f.spec} ` +
        "Use as ideias, exemplos e histórias das NOTAS (são do próprio usuário), sem inventar fatos, números, clientes ou resultados. " +
        "Escreva como gente, não como IA: frases variadas, sem clichês ('no mundo de hoje', 'descubra', 'transforme'), sem emojis em excesso. " +
        (voiceText
          ? "Siga o GUIA DE VOZ do usuário (tom, posicionamento, palavras a evitar). "
          : "") +
        "Não cite números de telefone, valores de contrato nem dados pessoais de terceiros. " +
        "No fim, uma seção '### Fontes' listando as notas usadas como [[Título]] exatamente como aparecem.",
      [
        {
          type: "text",
          text: [
            about ? `PERFIL DO USUÁRIO:\n${about}` : "",
            voiceText ? `GUIA DE VOZ:\n${voiceText}` : "",
            `NOTAS:\n\n${context}`,
          ]
            .filter(Boolean)
            .join("\n\n====\n\n"),
        },
      ],
    );
    if (!text.trim()) throw new Error("A IA não respondeu.");

    const title = expressTitle(format, note.title);
    const content = `# ${title}\n\nCriado a partir de [[${note.title}]].\n\n${demoteHeadings(text).trim()}\n\n#expressar #${f.tag}\n`;
    const { data, error } = await db
      .from("notes")
      .insert({
        user_id: userId,
        title,
        type: "conteudo",
        tags: ["expressar", f.tag],
        summary: `${f.label} criado a partir da nota "${note.title}".`,
        content,
        status: "pronta",
        entities: {},
      })
      .select("id")
      .single();
    if (error) throw error;
    await syncWikilinks(db, userId, data.id, content);
    return { ok: true as const, noteId: data.id, sources: 1 + (neighbors?.length ?? 0) };
  } catch (e) {
    console.error("expressar", e);
    let error = "Não consegui criar o conteúdo agora. Tente de novo.";
    if (e instanceof GatewayError) {
      if (e.httpStatus === 402)
        error = "Créditos de IA esgotados. Adicione créditos e tente de novo.";
      else if (e.httpStatus === 429)
        error = "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
    }
    return { ok: false as const, error };
  }
}
