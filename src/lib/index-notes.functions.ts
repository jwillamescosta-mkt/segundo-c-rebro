import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INDEXABLE } from "./index-utils";

const indexType = (t: unknown) => {
  if (typeof t !== "string" || !INDEXABLE.some((x) => x.value === t))
    throw new Error("Tipo sem índice.");
  return t;
};

/** "indices": prévia da nota-índice de um tipo (não grava). */
export const draftIndexFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { type: string }) => ({ type: indexType(d?.type) }))
  .handler(async ({ data, context }) => {
    const { draftIndex } = await import("./index-notes.server");
    return draftIndex(context.supabase, data.type);
  });

/** "indices": grava a nota-índice aprovada. */
export const saveIndexFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { type: string; content: string }) => {
    const content = typeof d?.content === "string" ? d.content.trim() : "";
    if (!content) throw new Error("O índice está vazio.");
    if (content.length > 30000) throw new Error("Índice muito longo.");
    return { type: indexType(d.type), content };
  })
  .handler(async ({ data, context }) => {
    const { saveIndex } = await import("./index-notes.server");
    return saveIndex(context.supabase, context.userId, data.type, data.content);
  });
