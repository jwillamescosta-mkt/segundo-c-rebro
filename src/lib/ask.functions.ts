import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AskTurn } from "./ask.server";

/** "perguntar": responde uma pergunta usando as notas do usuário (RLS garante que só as dele). */
export const askBrainFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { question: string; history?: AskTurn[] }) => {
    const question = typeof d?.question === "string" ? d.question.trim() : "";
    if (!question) throw new Error("Escreva uma pergunta.");
    if (question.length > 2000) throw new Error("Pergunta muito longa (máximo de 2000 caracteres).");
    const history = (Array.isArray(d.history) ? d.history : [])
      .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string")
      .slice(-10)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
    return { question, history };
  })
  .handler(async ({ data, context }) => {
    const { askBrain } = await import("./ask.server");
    return askBrain(context.supabase, data.question, data.history);
  });
