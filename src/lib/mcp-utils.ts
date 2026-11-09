/**
 * Conector MCP do Segundo Cérebro (só captura). Implementa o mínimo do protocolo que o Claude usa
 * (JSON-RPC: initialize, tools/list, tools/call, ping), sem dependência extra.
 * shortcut: sem sessão nem streaming (respostas JSON simples); trocar pelo SDK oficial se precisar de recursos além de ferramentas.
 */

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_TEXT = 20000;

export const CAPTURE_TOOL = {
  name: "capturar_nota",
  title: "Capturar no Segundo Cérebro",
  description:
    "Guarda uma anotação no Segundo Cérebro pessoal do usuário: ideias, tarefas, decisões, aprendizados, links. " +
    "Use quando o usuário pedir para anotar, guardar, lembrar ou registrar algo. Escreva o texto como o usuário diria, com o contexto necessário. " +
    "A IA do app organiza depois (título, tags, tarefas, agenda e conexões). Esta ferramenta NÃO lê notas existentes.",
  inputSchema: {
    type: "object",
    properties: {
      texto: { type: "string", description: "O conteúdo a guardar (pode incluir links). Até 20.000 caracteres." },
    },
    required: ["texto"],
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
};

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
export type Capture = (text: string) => Promise<{ ok: boolean; mensagem: string }>;

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Responde uma mensagem JSON-RPC. Devolve null para notificações (sem id), que não têm resposta. */
export async function handleMcpMessage(msg: unknown, capture: Capture) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return err(null, -32600, "Requisição inválida.");
  const { id, method, params } = msg as Rpc;
  if (typeof method !== "string") return err(id, -32600, "Requisição inválida.");
  if (id === undefined) return null; // notificação (ex.: notifications/initialized)

  switch (method) {
    case "initialize": {
      const asked = String(params?.["protocolVersion"] ?? "");
      return ok(id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "segundo-cerebro", title: "Segundo Cérebro", version: "1.0.0" },
        instructions: "Use capturar_nota para guardar anotações no Segundo Cérebro do usuário. O conector não lê notas.",
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: [CAPTURE_TOOL] });
    case "tools/call": {
      if (params?.["name"] !== CAPTURE_TOOL.name) return err(id, -32602, `Ferramenta desconhecida: ${String(params?.["name"])}`);
      const args = (params?.["arguments"] ?? {}) as Record<string, unknown>;
      const text = typeof args["texto"] === "string" ? args["texto"].trim() : "";
      if (!text) return ok(id, { content: [{ type: "text", text: "Nada para capturar: envie o texto em 'texto'." }], isError: true });
      if (text.length > MAX_TEXT) return ok(id, { content: [{ type: "text", text: "Texto longo demais (máximo de 20.000 caracteres)." }], isError: true });
      const r = await capture(text);
      return ok(id, { content: [{ type: "text", text: r.mensagem }], isError: !r.ok });
    }
    default:
      return err(id, -32601, `Método não suportado: ${method}`);
  }
}
