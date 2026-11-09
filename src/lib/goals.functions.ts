import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "plano-meta": a IA sugere próximas ações para uma meta (nada é gravado). */
export const suggestActionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { goalId: string }) => {
    if (!d?.goalId || typeof d.goalId !== "string") throw new Error("goalId obrigatório");
    return { goalId: d.goalId };
  })
  .handler(async ({ data, context }) => {
    const { suggestActions } = await import("./goals.server");
    return suggestActions(context.supabase, data.goalId);
  });
