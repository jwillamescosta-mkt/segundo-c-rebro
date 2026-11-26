import { authorizeCapture, findCaptureToken, storeCapture } from "./capture.server";
import { mcpReader } from "./mcp-read.server";
import { handleMcpMessage } from "./mcp-utils";

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * POST /api/mcp/<token> — conector do Claude, ChatGPT e outros clientes MCP.
 * O token vai no endereço porque conectores sem login não enviam cabeçalho.
 * Token "captura": só cria notas (vazou, no máximo criam notas, com limite por hora).
 * Token "leitura": também lê o núcleo, o mapa e as notas. Vazou, revogue já na tela de Atalhos.
 */
export async function handleMcp(request: Request, token: string) {
  const valid = /^scb_[A-Za-z0-9_-]{40,60}$/.test(token) ? token : null;
  const tok = await findCaptureToken(valid);
  // Token desconhecido responde 404 (e não 401) para o Claude não tentar um fluxo de login que não existe.
  if (!tok) return json(404, { error: "Conector não encontrado." });

  let msg: unknown;
  try {
    msg = await request.json();
  } catch {
    return json(400, {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "JSON inválido." },
    });
  }
  const reply = await handleMcpMessage(
    msg,
    async (text) => {
      const auth = await authorizeCapture(valid);
      if ("status" in auth) return auth.body; // ex.: limite por hora atingido
      return (await storeCapture(auth, text, null)).body;
    },
    tok.scope === "leitura" ? mcpReader(tok.user_id) : undefined,
  );
  return reply === null ? json(202, null) : json(200, reply);
}
