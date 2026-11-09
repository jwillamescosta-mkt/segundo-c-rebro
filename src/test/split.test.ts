import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/wikilink-sync", () => ({ syncWikilinks: vi.fn(async () => {}) }));

import { syncWikilinks } from "@/lib/wikilink-sync";
import { applySplit } from "@/lib/split.server";

type Row = Record<string, unknown>;

/** Banco falso: registra inserts de notas e upserts de ligações; devolve `splitExists` na checagem de pontos existentes. */
function fakeDb(opts: { splitExists?: boolean } = {}) {
  const notes: Row[] = [];
  const links: Row[] = [];
  const db = {
    notes,
    links,
    from: (table: string) => ({
      insert: (row: Row) => ({
        select: () => ({
          single: async () => {
            const saved = { ...row, id: `n${notes.length + 1}` };
            if (table === "notes") notes.push(saved);
            return { data: saved, error: null };
          },
        }),
      }),
      upsert: async (row: Row) => {
        links.push(row);
        return { error: null };
      },
      select: () => ({ eq: () => ({ limit: async () => ({ data: opts.splitExists ? [{ id: "x" }] : [], error: null }) }) }),
    }),
  };
  return db;
}

const maria = { id: "m1", title: "Maria", type: "pessoa", summary: "esposa" };
const topic = (title: string, confidence = 0.9) => ({ title, type: "ideia", summary: "s", content: `Sobre ${title}`, tags: ["a"], confidence });
const base = (over: Record<string, unknown> = {}) => ({
  noteId: "src",
  userId: "u",
  sourceTitle: "Captura de terça",
  sourceType: "ideia",
  topics: [],
  refs: [],
  entities: [maria],
  known: new Set(["maria"]),
  ...over,
});

describe("separação de capturas (banco)", () => {
  it("reaproveita quem já existe: liga à nota existente, sem criar outra Maria", async () => {
    const db = fakeDb();
    await applySplit(db as never, base({ refs: [{ name: "maria", type: "pessoa", relation: "esposa", confidence: 0.95 }] }));
    expect(db.notes).toHaveLength(0);
    expect(db.links).toEqual([expect.objectContaining({ source_note_id: "src", target_note_id: "m1", kind: "ia", reason: "esposa", status: "aceita" })]);
  });

  it("pessoa nova só vira nota com confiança alta; com dúvida, nada é criado", async () => {
    const db = fakeDb();
    await applySplit(db as never, base({ refs: [{ name: "Carlos", type: "pessoa", relation: "chefe", confidence: 0.9 }, { name: "Paula", type: "pessoa", relation: "", confidence: 0.5 }] }));
    expect(db.notes.map((n) => n["title"])).toEqual(["Carlos"]);
    expect(db.links).toHaveLength(1);
  });

  it("ligação de confiança média entra como sugestão", async () => {
    const db = fakeDb();
    await applySplit(db as never, base({ refs: [{ name: "Maria", type: "pessoa", relation: "talvez", confidence: 0.6 }] }));
    expect(db.links[0]).toMatchObject({ status: "sugerida" });
  });

  it("captura com 2 assuntos vira 2 pontos ligados à origem, guardando de onde vieram", async () => {
    const db = fakeDb();
    const r = await applySplit(db as never, base({ topics: [topic("Escola do filho"), topic("Orçamento do cliente")] }));
    expect(r.created).toBe(2);
    expect(db.notes).toHaveLength(2);
    expect(db.notes[0]).toMatchObject({ title: "Escola do filho", status: "pronta", entities: { split_from: "src" }, tags: ["a", "ponto"] });
    expect(String(db.notes[0]!["content"])).toContain("Origem: [[Captura de terça]]");
    expect(syncWikilinks).toHaveBeenCalledTimes(2);
  });

  it("um assunto só continua sendo uma nota só", async () => {
    const db = fakeDb();
    expect((await applySplit(db as never, base({ topics: [topic("Único")] }))).created).toBe(0);
    expect(db.notes).toHaveLength(0);
  });

  it("não separa de novo uma captura já separada, nem o diário", async () => {
    const again = fakeDb({ splitExists: true });
    expect((await applySplit(again as never, base({ topics: [topic("A"), topic("B")] }))).created).toBe(0);
    const diary = fakeDb();
    expect((await applySplit(diary as never, base({ sourceType: "diario", topics: [topic("A"), topic("B")] }))).created).toBe(0);
    expect(again.notes.concat(diary.notes)).toHaveLength(0);
  });
});
