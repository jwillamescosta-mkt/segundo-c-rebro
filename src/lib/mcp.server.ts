import { authorizeCapture, storeCapture } from "./capture.server";
import { handleMcpMessage } from "./mcp-utils";

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * POST /api/mcp/<token> — conector do Claude (só captura).
 * O token vai no endereço porque conectores sem login não enviam cabeçalho. Como ele só cria notas
 * (nunca lê), um vazamento do endereço permite no máximo criar notas, com limite por hora; revogue na tela de Atalhos.
 */
export async function handleMcp(request: Request, token: string) {
  // Token desconhecido responde 404 (e não 401) para o Claude não tentar um fluxo de login que não existe.
  const auth = await authorizeCapture(/^scb_[A-Za-z0-9_-]{40,60}$/.test(token) ? token : null);
  if ("status" in auth && auth.status === 401) return json(404, { error: "Conector não encontrado." });

  let msg: unknown;
  try {
    msg = await request.json();
  } catch {
    return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } });
  }
  const reply = await handleMcpMessage(msg, async (text) => {
    if ("status" in auth) return auth.body; // ex.: limite por hora atingido
    return (await storeCapture(auth, text, null)).body;
  });
  return reply === null ? json(202, null) : json(200, reply);
}
