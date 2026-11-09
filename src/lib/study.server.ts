import { GatewayError } from "@lovable.dev/ai-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatTool } from "./pipeline.server";

type DB = SupabaseClient<Database>;

const schema = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string", description: "Pergunta curta e específica, que exige lembrar ou explicar (não sim/não)." },
          answer: { type: "string", description: "Resposta correta e concisa (até 3 frases), baseada só na nota." },
        },
        required: ["question", "answer"],
      },
    },
  },
  required: ["cards"],
};

/** Gera flashcards de uma nota. Substitui só os cards ainda não estudados; os já revisados ficam. */
export async function generateCards(db: DB, userId: string, noteId: string) {
  try {
    const { data: note, error } = await db.from("notes").select("id,title,summary,content").eq("id", noteId).maybeSingle();
    if (error || !note) throw new Error("Nota não encontrada.");
    const text = `${note.summary ?? ""}\n\n${note.content ?? ""}`.trim();
    if (text.length < 80) return { ok: false as const, error: "A nota tem pouco conteúdo para gerar perguntas." };

    const { data: studied } = await db.from("cards").select("question").eq("note_id", noteId).gt("reps", 0);
    const r = await chatTool<{ cards: { question: string; answer: string }[] }>(
      "Você cria flashcards de estudo em português do Brasil a partir de uma nota pessoal, para revisão espaçada. " +
        "Crie de 3 a 8 cards cobrindo as ideias mais importantes: conceitos, definições, porquês, passos e aplicações práticas. " +
        "Uma ideia por card. Prefira perguntas que façam pensar e aplicar, não só decorar. Use apenas o que está na nota. " +
        "Não repita perguntas que o usuário já estuda.",
      `Título: ${note.title}\n\nPerguntas já existentes (não repetir):\n${(studied ?? []).map((c) => `- ${c.question}`).join("\n") || "(nenhuma)"}\n\nNota:\n${text.slice(0, 20000)}`,
      "salvar_flashcards",
      schema,
    );
    const cards = (r.cards ?? [])
      .filter((c) => c.question?.trim() && c.answer?.trim())
      .slice(0, 8)
      .map((c) => ({ user_id: userId, note_id: noteId, question: c.question.trim().slice(0, 500), answer: c.answer.trim().slice(0, 1500) }));
    if (!cards.length) return { ok: false as const, error: "A IA não encontrou o que perguntar nesta nota." };

    await db.from("cards").delete().eq("note_id", noteId).eq("reps", 0).is("last_reviewed_at", null);
    const { error: insErr } = await db.from("cards").insert(cards);
    if (insErr) throw insErr;
    return { ok: true as const, count: cards.length };
  } catch (e) {
    console.error("gerar-cards", noteId, e);
    let error = e instanceof Error ? e.message : "Não foi possível gerar os cards.";
    if (e instanceof GatewayError) {
      if (e.httpStatus === 402) error = "Créditos de IA esgotados. Adicione créditos e tente de novo.";
      else if (e.httpStatus === 429) error = "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
      else error = "A IA não conseguiu gerar os cards.";
    }
    return { ok: false as const, error };
  }
}
