import { createFileRoute } from "@tanstack/react-router";

// Conector do Claude (MCP, só captura). A lógica fica no servidor (mcp.server.ts), carregada só aqui dentro.
export const Route = createFileRoute("/api/mcp/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handleMcp } = await import("@/lib/mcp.server");
        try {
          return await handleMcp(request, params.token);
        } catch (e) {
          console.error("api/mcp", e);
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Erro inesperado." } }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
      // Sem streaming do servidor para o cliente: o protocolo aceita 405 aqui.
      GET: async () => new Response(null, { status: 405, headers: { allow: "POST" } }),
    },
  },
});
