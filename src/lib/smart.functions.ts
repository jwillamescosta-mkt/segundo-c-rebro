import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "conexao-inteligente": separa, reconhece pessoas/projetos e conecta as notas que estão na fila (em lote). */
export const smartPassFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { noteIds?: string[] } | undefined) => ({
    noteIds: Array.isArray(d?.noteIds) ? d.noteIds.filter((x) => typeof x === "string").slice(0, 20) : undefined,
  }))
  .handler(async ({ data, context }) => {
    const { runSmartPass } = await import("./smart.server");
    return runSmartPass(context.supabase, context.userId, data.noteIds);
  });
