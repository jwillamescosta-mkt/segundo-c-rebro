import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sha256Hex } from "./capture-utils";
import { buildIcs } from "./ics-utils";
import { addDaysISO, todayISO } from "./tasks-utils";

const TOKEN_RE = /^scb_[A-Za-z0-9_-]{40,60}$/;

/**
 * GET /api/agenda/<token>(.ics) — agenda assinável pelo Calendário do iPhone.
 * O token vai no endereço (calendários não enviam cabeçalho) e é de um tipo à parte ("agenda"):
 * só lê tarefas e compromissos do dono, nunca o conteúdo das notas, e não serve para criar notas.
 * Usa o cliente admin (ignora RLS): por isso TODA leitura filtra pelo user_id do token.
 */
export async function handleAgendaFeed(request: Request, rawToken: string) {
  const token = rawToken.replace(/\.ics$/i, "");
  const notFound = () => new Response("Agenda não encontrada.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  if (!TOKEN_RE.test(token)) return notFound();

  const { data: tok } = await supabaseAdmin
    .from("capture_tokens")
    .select("id,user_id,revoked_at,scope")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!tok || tok.revoked_at || tok.scope !== "agenda") return notFound();

  // Janela: 2 semanas para trás (pendências recentes) e 4 meses para frente.
  const from = addDaysISO(todayISO(), -14);
  const until = addDaysISO(todayISO(), 120);
  const [{ data: tasks }, { data: events }] = await Promise.all([
    supabaseAdmin
      .from("tasks")
      .select("id,text,due_date,due_time,note_id")
      .eq("user_id", tok.user_id)
      .eq("done", false)
      .gte("due_date", from)
      .lte("due_date", until)
      .limit(500),
    supabaseAdmin
      .from("events")
      .select("id,title,starts_at,ends_at,all_day,note_id")
      .eq("user_id", tok.user_id)
      .eq("status", "confirmado")
      .gte("starts_at", `${from}T00:00:00-03:00`)
      .lte("starts_at", `${until}T23:59:59-03:00`)
      .limit(500),
  ]);

  await supabaseAdmin.from("capture_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tok.id);
  const origin = new URL(request.url).origin;
  return new Response(buildIcs(tasks ?? [], events ?? [], origin), {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="segundo-cerebro.ics"',
      "cache-control": "no-store",
    },
  });
}
