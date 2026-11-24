import { GatewayError } from "@lovable.dev/ai-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { connectBatch } from "./smart-connect.server";

type DB = SupabaseClient<Database>;

/** Procura ligações para notas órfãs (sem passar pela separação em pontos). Retorna quantas ligações novas. */
export async function connectOrphans(db: DB, userId: string, noteIds: string[]) {
  try {
    const { data } = await db
      .from("notes")
      .select("id,title,summary,tags")
      .in("id", noteIds)
      .neq("type", "diario");
    if (!data?.length) return { ok: true as const, links: 0 };
    const links = await connectBatch(
      db,
      userId,
      data.map((n) => ({ id: n.id, title: n.title, summary: n.summary, tags: n.tags ?? [] })),
    );
    return { ok: true as const, links };
  } catch (e) {
    console.error("conectar-orfas", e);
    let error = "Não consegui procurar ligações agora. Tente de novo.";
    if (e instanceof GatewayError) {
      if (e.httpStatus === 402)
        error = "Créditos de IA esgotados. Adicione créditos e tente de novo.";
      else if (e.httpStatus === 429)
        error = "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
    }
    return { ok: false as const, error };
  }
}
