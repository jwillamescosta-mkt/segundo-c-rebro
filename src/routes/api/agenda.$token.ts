import { createFileRoute } from "@tanstack/react-router";

// Agenda assinável (.ics) para o Calendário do iPhone. A lógica fica no servidor (agenda-feed.server.ts).
export const Route = createFileRoute("/api/agenda/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleAgendaFeed } = await import("@/lib/agenda-feed.server");
        try {
          return await handleAgendaFeed(request, params.token);
        } catch (e) {
          console.error("api/agenda", e);
          return new Response("Erro ao montar a agenda.", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
        }
      },
    },
  },
});
