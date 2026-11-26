import { createFileRoute } from "@tanstack/react-router";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// Rotinas agendadas (pg_cron → POST /api/rotina/<manha|fim-do-dia|faxina>, com o segredo do cron no Authorization).
export const Route = createFileRoute("/api/rotina/$tipo")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { isRoutine } = await import("@/lib/routine-utils");
        if (!isRoutine(params.tipo))
          return json(404, { ok: false, mensagem: "Rotina desconhecida." });
        const { activeUserIds, userSession } = await import("@/lib/routine-session.server");
        const { runRoutine } = await import("@/lib/routines.server");
        const results: { user: string; ok: boolean; erro?: string }[] = [];
        for (const uid of await activeUserIds()) {
          let end: (() => Promise<void>) | null = null;
          try {
            const s = await userSession(uid);
            end = s.end;
            const r = await runRoutine(s.db, uid, params.tipo);
            results.push({ user: uid.slice(0, 8), ok: r.ok, ...(r.ok ? {} : { erro: r.error }) });
          } catch (e) {
            console.error("api/rotina", params.tipo, uid, e);
            results.push({
              user: uid.slice(0, 8),
              ok: false,
              erro: e instanceof Error ? e.message : "erro",
            });
          } finally {
            await end?.();
          }
        }
        return json(200, { ok: results.every((r) => r.ok), rotina: params.tipo, results });
      },
    },
  },
});
