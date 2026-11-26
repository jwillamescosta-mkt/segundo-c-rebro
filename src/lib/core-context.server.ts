import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CORE_TAG, formatCoreContext } from "./core-utils";
import { PROFILE_TITLE } from "./split-utils";

type DB = SupabaseClient<Database>;

/**
 * Fonte única da verdade: perfil + notas-núcleo, lidos por todos os prompts (perguntar, briefing, captura, divisão).
 * Mudou uma nota-núcleo, todas as respostas da IA mudam juntas.
 */
export async function coreContext(db: DB, ownerId?: string) {
  let q = db
    .from("notes")
    .select("title,content,summary")
    .or(`tags.cs.{${CORE_TAG}},title.eq."${PROFILE_TITLE}"`);
  // Com o cliente admin (conector MCP) não há RLS: o dono tem de ser filtrado aqui.
  if (ownerId) q = q.eq("user_id", ownerId);
  const { data } = await q.limit(20);
  return formatCoreContext(data ?? []);
}
