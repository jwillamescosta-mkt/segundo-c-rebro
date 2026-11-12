import { describe, expect, it, vi } from "vitest";
import { runFlush, type QueuedCapture } from "@/lib/offline-queue";

const item = (id: string): QueuedCapture => ({ id, text: id, file: null, fileName: null, fileType: null, createdAt: 1 });

describe("caixa de saída (blindagem contra perda)", () => {
  it("só remove da caixa quem o servidor confirmou; falha fica guardada com o motivo", async () => {
    const remove = vi.fn(async (_id: string) => {});
    const fail = vi.fn(async () => {});
    const send = vi.fn(async (it: QueuedCapture) => {
      if (it.id === "b") throw new Error("Sessão expirada. Entre novamente.");
    });
    const r = await runFlush([item("a"), item("b"), item("c")], send, remove, fail);
    expect(r).toEqual({ sent: 2, left: 1 });
    expect(remove.mock.calls.map((c) => c[0])).toEqual(["a", "c"]); // "b" com problema não bloqueia "c"
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }), "Sessão expirada. Entre novamente.");
  });

  it("sem rede: nada é removido", async () => {
    const remove = vi.fn(async (_id: string) => {});
    const r = await runFlush([item("a"), item("b")], async () => { throw new TypeError("Failed to fetch"); }, remove, async () => {});
    expect(r).toEqual({ sent: 0, left: 2 });
    expect(remove).not.toHaveBeenCalled();
  });

  it("se nem der para registrar a falha, o item continua na caixa e o envio segue", async () => {
    const remove = vi.fn(async (_id: string) => {});
    const r = await runFlush([item("a"), item("b")], async (it) => { if (it.id === "a") throw new Error("x"); }, remove, async () => { throw new Error("disco cheio"); });
    expect(r.sent).toBe(1);
    expect(remove.mock.calls.map((c) => c[0])).toEqual(["b"]);
  });
});
