import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "sintese": consolida as notas de um tema (texto livre ou #tag) numa nota nova. */
export const synthesizeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string }) => {
    const topic = typeof d?.topic === "string" ? d.topic.trim() : "";
    if (topic.length < 2) throw new Error("Escreva um tema.");
    if (topic.length > 120) throw new Error("Tema muito longo (máximo de 120 caracteres).");
    return { topic };
  })
  .handler(async ({ data, context }) => {
    const { synthesize } = await import("./synthesis.server");
    return synthesize(context.supabase, context.userId, data.topic);
  });
