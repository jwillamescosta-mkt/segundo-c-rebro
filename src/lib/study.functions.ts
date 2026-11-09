import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "gerar-cards": a IA cria flashcards de uma nota (RLS: só notas do próprio usuário). */
export const generateCardsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { noteId: string }) => {
    if (!d?.noteId || typeof d.noteId !== "string") throw new Error("noteId obrigatório");
    return { noteId: d.noteId };
  })
  .handler(async ({ data, context }) => {
    const { generateCards } = await import("./study.server");
    return generateCards(context.supabase, context.userId, data.noteId);
  });
