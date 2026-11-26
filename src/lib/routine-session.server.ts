import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

const env = () => {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY ausentes.");
  return { url, key };
};
const bare = (url: string, key: string, token?: string) =>
  createClient<Database>(url, key, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

/**
 * Rotina agendada (sem ninguém logado): abre uma sessão curta do próprio usuário para que tudo rode
 * com RLS, exatamente como no app. O link mágico é gerado e trocado na hora pelo servidor, sem e-mail.
 * Devolve o cliente e uma função para encerrar a sessão.
 */
export async function userSession(uid: string): Promise<{ db: DB; end: () => Promise<void> }> {
  const { url, key } = env();
  const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(uid);
  if (uErr || !u.user?.email) throw new Error("Usuário sem e-mail.");
  const { data: link, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: u.user.email,
  });
  if (lErr || !link.properties?.hashed_token)
    throw new Error("Não consegui abrir a sessão da rotina.");
  const anon = bare(url, key);
  const { data: s, error: sErr } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (sErr || !s.session) throw new Error("Não consegui abrir a sessão da rotina.");
  const token = s.session.access_token;
  const db = bare(url, key, token);
  return {
    db,
    end: async () => {
      await supabaseAdmin.auth.admin.signOut(token, "local").catch(() => {});
    },
  };
}

/** Usuários cadastrados (app pessoal: na prática, o dono). */
export async function activeUserIds() {
  const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  return (data?.users ?? []).map((u) => u.id);
}
