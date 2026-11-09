import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/wikilink-sync", () => ({ syncWikilinks: vi.fn(async () => {}) }));

import { syncWikilinks } from "@/lib/wikilink-sync";
import { RULES_CONTENT, RULES_TITLE, ensureRulesNote } from "@/lib/rules-note";

/** Banco falso mínimo: só a tabela notes, com as consultas que ensureRulesNote usa. */
function fakeDb(initial: { id: string; title: string; content?: string }[] = []) {
  const notes: { id: string; title: string; [k: string]: unknown }[] = initial.map((n) => ({ ...n }));
  const db = {
    notes,
    from: () => ({
      select: () => ({
        eq: (_col: string, title: string) => ({
          limit: async () => ({ data: notes.filter((n) => n.title === title).map((n) => ({ id: n.id })), error: null }),
        }),
      }),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const id = `n${notes.length + 1}`;
            notes.push({ ...row, id, title: String(row["title"]) });
            return { data: { id }, error: null };
          },
        }),
      }),
    }),
  };
  return db;
}

describe("nota Regras do meu cérebro", () => {
  it("cria uma vez, fixada, com os campos pedidos e liga a [[Segundo Cérebro]]", async () => {
    const db = fakeDb([{ id: "sc", title: "Segundo Cérebro" }]);
    expect(await ensureRulesNote(db as never, "u1")).toBe(true);
    expect(await ensureRulesNote(db as never, "u1")).toBe(true); // mesma execução reaproveitada na aba
    const rules = db.notes.filter((n) => n.title === RULES_TITLE);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      type: "referencia",
      tags: ["regras", "segundo-cerebro", "privacidade"],
      source_kind: "texto",
      status: "pronta",
      pinned: true,
      summary: "Regras de captura do segundo cérebro: o que guardar, o que nunca guardar e cinco regras práticas.",
    });
    expect(RULES_CONTENT).toContain("Ligada a [[Segundo Cérebro]].");
    expect(syncWikilinks).toHaveBeenCalledWith(db, "u1", rules[0]!.id, RULES_CONTENT);
  });

  it("não duplica numa nova abertura do app e não altera a nota existente", async () => {
    const db = fakeDb([{ id: "r", title: RULES_TITLE, content: "editada pelo usuário" }]);
    expect(await ensureRulesNote(db as never, "u2")).toBe(false);
    expect(db.notes).toEqual([{ id: "r", title: RULES_TITLE, content: "editada pelo usuário" }]);
  });
});
