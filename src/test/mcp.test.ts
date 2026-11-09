import { describe, expect, it, vi } from "vitest";
import { CAPTURE_TOOL, handleMcpMessage } from "@/lib/mcp-utils";

const okCapture = vi.fn(async (_t: string) => ({ ok: true, mensagem: "Capturado no seu Segundo Cérebro ✓" }));

describe("conector MCP (só captura)", () => {
  it("initialize devolve a versão pedida quando suportada, senão a mais nova", async () => {
    const a = (await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, okCapture)) as { result: { protocolVersion: string; capabilities: unknown } };
    expect(a.result.protocolVersion).toBe("2025-03-26");
    expect(a.result.capabilities).toEqual({ tools: { listChanged: false } });
    const b = (await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, okCapture)) as { result: { protocolVersion: string } };
    expect(b.result.protocolVersion).toBe("2025-06-18");
  });

  it("notificação não tem resposta", async () => {
    expect(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, okCapture)).toBeNull();
  });

  it("lista só a ferramenta de captura, sem nenhuma de leitura", async () => {
    const r = (await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, okCapture)) as { result: { tools: { name: string }[] } };
    expect(r.result.tools.map((t) => t.name)).toEqual([CAPTURE_TOOL.name]);
  });

  it("tools/call grava o texto e devolve a mensagem", async () => {
    const r = await handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "capturar_nota", arguments: { texto: "  fechei o orçamento  " } } }, okCapture);
    expect(okCapture).toHaveBeenCalledWith("fechei o orçamento");
    expect(r).toEqual({ jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: "Capturado no seu Segundo Cérebro ✓" }], isError: false } });
  });

  it("falha da captura (ex.: limite por hora) volta como erro da ferramenta, sem quebrar o protocolo", async () => {
    const limited = async () => ({ ok: false, mensagem: "Muitas capturas nesta hora." });
    const r = (await handleMcpMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "capturar_nota", arguments: { texto: "x" } } }, limited)) as { result: { isError: boolean } };
    expect(r.result.isError).toBe(true);
  });

  it("recusa texto vazio, ferramenta desconhecida e método desconhecido", async () => {
    const call = vi.fn(async (_t: string) => ({ ok: true, mensagem: "ok" }));
    const empty = (await handleMcpMessage({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "capturar_nota", arguments: { texto: "  " } } }, call)) as { result: { isError: boolean } };
    expect(empty.result.isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
    expect(await handleMcpMessage({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "ler_notas", arguments: {} } }, call)).toMatchObject({ error: { code: -32602 } });
    expect(await handleMcpMessage({ jsonrpc: "2.0", id: 8, method: "resources/list" }, call)).toMatchObject({ error: { code: -32601 } });
    expect(await handleMcpMessage([1, 2], call)).toMatchObject({ error: { code: -32600 } });
  });
});
