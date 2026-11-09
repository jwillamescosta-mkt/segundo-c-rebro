import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "briefing": resumo do dia no diário ou revisão da semana em nova nota. */
export const briefingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind: "diario" | "semanal" }) => ({ kind: d?.kind === "semanal" ? ("semanal" as const) : ("diario" as const) }))
  .handler(async ({ data, context }) => {
    const { generateBriefing } = await import("./briefing.server");
    return generateBriefing(context.supabase, context.userId, data.kind);
  });
