/**
 * Conector MCP do Segundo Cérebro (captura e, com token de leitura, consulta). Implementa o mínimo do protocolo que o Claude usa
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

/** Leitura, só para tokens com escopo "leitura". Cada função devolve texto curto (resumos), pensado para gastar pouco contexto. */
export interface Reader {
  contexto(): Promise<string>;
  mapa(): Promise<string>;
  buscar(q: string): Promise<string>;
  ler(id: string): Promise<string | null>;
  agenda(dias: number): Promise<string>;
}

const ro = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const noArgs = { type: "object", properties: {} };
export const READ_TOOLS = [
  {
    name: "contexto_essencial",
    title: "Contexto essencial do usuário",
    description:
      "Quem é o usuário: perfil, estratégia, cliente ideal, oferta, tom de voz, equipe e rotina. Chame UMA vez no início de qualquer tarefa que dependa do contexto dele (escrever, decidir, planejar).",
    inputSchema: noArgs,
    annotations: ro,
  },
  {
    name: "mapa_do_cerebro",
    title: "Mapa do cérebro",
    description: "O que existe no segundo cérebro: núcleo, índices, notas principais por área e tags. Use para saber onde procurar antes de buscar.",
    inputSchema: noArgs,
    annotations: ro,
  },
  {
    name: "buscar_notas",
    title: "Buscar notas",
    description: "Busca notas por título, resumo ou tag. Devolve só título, id e resumo; use ler_nota para o conteúdo completo de uma delas.",
    inputSchema: { type: "object", properties: { busca: { type: "string", description: "Palavra ou expressão (ex.: um cliente, um projeto, um tema)." } }, required: ["busca"] },
    annotations: ro,
  },
  {
    name: "ler_nota",
    title: "Ler nota",
    description: "Conteúdo completo de uma nota, pelo id devolvido em buscar_notas.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Id da nota." } }, required: ["id"] },
    annotations: ro,
  },
  {
    name: "tarefas_e_agenda",
    title: "Tarefas e agenda",
    description: "Tarefas pendentes (com as atrasadas) e compromissos confirmados dos próximos dias.",
    inputSchema: { type: "object", properties: { dias: { type: "number", description: "Quantos dias à frente (1 a 30). Padrão: 7." } } },
    annotations: ro,
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
export type Capture = (text: string) => Promise<{ ok: boolean; mensagem: string }>;

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Responde uma mensagem JSON-RPC. Devolve null para notificações (sem id), que não têm resposta. */
export async function handleMcpMessage(msg: unknown, capture: Capture, reader?: Reader) {
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
        instructions: reader
          ? "Segundo Cérebro do usuário. Antes de tarefas que dependem do contexto dele, chame contexto_essencial uma vez; use mapa_do_cerebro e buscar_notas para achar o resto e ler_nota só quando precisar do conteúdo. Use capturar_nota para guardar anotações."
          : "Use capturar_nota para guardar anotações no Segundo Cérebro do usuário. O conector não lê notas.",
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: reader ? [CAPTURE_TOOL, ...READ_TOOLS] : [CAPTURE_TOOL] });
    case "tools/call": {
      const name = params?.["name"];
      const args = (params?.["arguments"] ?? {}) as Record<string, unknown>;
      const reply = (t: string, isError = false) => ok(id, { content: [{ type: "text", text: t }], isError });
      if (reader && READ_TOOLS.some((t) => t.name === name)) {
        if (name === "contexto_essencial") return reply(await reader.contexto());
        if (name === "mapa_do_cerebro") return reply(await reader.mapa());
        if (name === "buscar_notas") return reply(await reader.buscar(typeof args["busca"] === "string" ? args["busca"] : ""));
        if (name === "ler_nota") {
          const note = await reader.ler(typeof args["id"] === "string" ? args["id"].trim() : "");
          return note ? reply(note) : reply("Nota não encontrada. Use buscar_notas para achar o id.", true);
        }
        const dias = Number(args["dias"]);
        return reply(await reader.agenda(Number.isFinite(dias) ? dias : 7));
      }
      if (name !== CAPTURE_TOOL.name) return err(id, -32602, `Ferramenta desconhecida: ${String(name)}`);
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
