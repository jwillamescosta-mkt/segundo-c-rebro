import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXPRESS_VALUES, type ExpressFormat } from "./express-utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "expressar": transforma uma nota (e as ligadas a ela) em conteúdo pronto, numa nota nova. */
export const expressFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { noteId: string; format: string }) => {
    if (typeof d?.noteId !== "string" || !UUID.test(d.noteId)) throw new Error("Nota inválida.");
    if (!EXPRESS_VALUES.includes(d.format as ExpressFormat)) throw new Error("Formato inválido.");
    return { noteId: d.noteId, format: d.format as ExpressFormat };
  })
  .handler(async ({ data, context }) => {
    const { expressNote } = await import("./express.server");
    return expressNote(context.supabase, context.userId, data.noteId, data.format);
  });
