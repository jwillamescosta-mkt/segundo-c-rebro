import { describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ links: [] as { from: string; to: string; reason: string; confidence: number }[] }));
vi.mock("@/lib/pipeline.server", () => ({ chatTool: vi.fn(async () => ({ links: ai.links })) }));

import { connectBatch, pairKey } from "@/lib/smart-connect.server";

type Row = Record<string, unknown>;

/** Banco falso: histórico com h1..h3, ligação já existente a↔h1, e registro dos upserts de ligações. */
function fakeDb() {
  const upserts: Row[] = [];
  const history = [{ id: "h1", title: "H1", summary: "", tags: [] }, { id: "h2", title: "H2", summary: "", tags: [] }, { id: "h3", title: "H3", summary: "", tags: [] }];
  const db = {
    upserts,
    rpc: async () => ({ data: history.map((h) => ({ id: h.id })) }),
    from: (table: string) => ({
      select: () => ({
        order: () => ({ limit: async () => ({ data: history.map((h) => ({ id: h.id })) }) }),
        in: async () => ({ data: history }),
        or: async () => ({ data: table === "links" ? [{ source_note_id: "h1", target_note_id: "a" }] : [] }),
      }),
      upsert: async (rows: Row[]) => {
        upserts.push(...rows);
        return { error: null };
      },
    }),
  };
  return db;
}

const batch = [{ id: "a", title: "A", summary: null, tags: [] }, { id: "b", title: "B", summary: null, tags: [] }];
const link = (from: string, to: string, confidence = 0.9, reason = "motivo") => ({ from, to, reason, confidence });

describe("conexão em lote", () => {
  it("chave da dupla não depende da direção", () => expect(pairKey("a", "b")).toBe(pairKey("b", "a")));

  it("ignora ids inventados, auto-ligação, repetidas e já ligadas (em qualquer direção)", async () => {
    ai.links = [link("a", "h1"), link("a", "h2"), link("h2", "a"), link("a", "zzz"), link("a", "a"), link("x", "h2"), link("a", "b")];
    const db = fakeDb();
    const n = await connectBatch(db as never, "u", batch);
    expect(n).toBe(2);
    expect(db.upserts.map((r) => [r["source_note_id"], r["target_note_id"]])).toEqual([["a", "h2"], ["a", "b"]]);
  });

  it("confiança alta entra aceita; média, como sugestão; grava reason e dono", async () => {
    ai.links = [link("a", "h2", 0.9, "mesmo cliente"), link("b", "h3", 0.6)];
    const db = fakeDb();
    await connectBatch(db as never, "u1", batch);
    expect(db.upserts[0]).toMatchObject({ user_id: "u1", kind: "ia", status: "aceita", reason: "mesmo cliente" });
    expect(db.upserts[1]).toMatchObject({ status: "sugerida" });
  });
});
