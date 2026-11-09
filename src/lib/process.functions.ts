import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "processar-nota": transcribe / OCR / extract, analyze with AI and find connections. */
export const processNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { noteId: string; mode?: "full" | "reanalyze" }) => {
    if (!d?.noteId || typeof d.noteId !== "string") throw new Error("noteId obrigatório");
    return { noteId: d.noteId, mode: d.mode === "reanalyze" ? "reanalyze" : "full" } as const;
  })
  .handler(async ({ data, context }) => {
    const { runPipeline } = await import("./pipeline.server");
    return runPipeline(context.supabase, context.userId, data.noteId, data.mode);
  });
