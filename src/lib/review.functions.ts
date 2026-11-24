import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "conectar-orfas": uma chamada de IA procura ligações para notas que ainda não têm nenhuma. */
export const connectOrphansFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { noteIds: string[] }) => {
    const noteIds = Array.isArray(d?.noteIds)
      ? d.noteIds.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20)
      : [];
    if (!noteIds.length) throw new Error("Nenhuma nota para conectar.");
    return { noteIds };
  })
  .handler(async ({ data, context }) => {
    const { connectOrphans } = await import("./review.server");
    return connectOrphans(context.supabase, context.userId, data.noteIds);
  });
