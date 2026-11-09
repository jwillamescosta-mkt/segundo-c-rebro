import { createFileRoute } from "@tanstack/react-router";

// Endpoint dos Atalhos do iPhone. A lógica fica no servidor (capture.server.ts), carregada só aqui dentro.
export const Route = createFileRoute("/api/capturar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCapture } = await import("@/lib/capture.server");
        try {
          return await handleCapture(request);
        } catch (e) {
          console.error("api/capturar", e);
          return new Response(JSON.stringify({ ok: false, mensagem: "Erro inesperado." }), { status: 500, headers: { "content-type": "application/json" } });
        }
      },
    },
  },
});
