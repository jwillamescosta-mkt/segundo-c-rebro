import { describe, expect, it, vi } from "vitest";
import { buildBrainMap, CORE_FOLDER, folderIndex, folderOf, INDEX_TAG } from "@/lib/brain-map";
import { CORE_TAG } from "@/lib/core-utils";
import { replaceWikilinkTarget } from "@/lib/markdown-utils";
import { handleMcpMessage, READ_TOOLS, type Reader } from "@/lib/mcp-utils";

const notes = [
  {
    id: "1",
    title: "Estratégia",
    type: "referencia",
    tags: [CORE_TAG],
    summary: "Foco em consultoria.",
  },
  { id: "2", title: "Cliente A", type: "cliente", tags: ["vendas"], summary: "Proposta enviada." },
  { id: "3", title: "Cliente B", type: "cliente", tags: [], summary: null },
  {
    id: "4",
    title: "Índice — Clientes",
    type: "referencia",
    tags: [INDEX_TAG, "cliente"],
    summary: "Índice.",
  },
];
const links = [{ source_note_id: "2", target_note_id: "1", status: "aceita" }];

describe("mapa do cérebro", () => {
  it("lista núcleo, índices e áreas, sem repetir núcleo e índice dentro das áreas", () => {
    const md = buildBrainMap(notes, links, { folders: true });
    expect(md).toContain("## Núcleo (leia primeiro)\n- [[Estratégia]] — Foco em consultoria.");
    expect(md).toContain("## Índices\n- [[Índice — Clientes]]");
    expect(md).toContain("### Clientes (2) — pasta `Clientes/`");
    expect(md.match(/\[\[Estratégia\]\]/g)).toHaveLength(1);
    expect(md).toContain("_indice.md");
  });

  it("põe o núcleo na pasta própria e o índice na pasta do tipo que ele indexa", () => {
    expect(folderOf(notes[0]!)).toBe(CORE_FOLDER);
    expect(folderOf(notes[3]!)).toBe("Clientes");
    expect(folderOf(notes[1]!)).toBe("Clientes");
    const idx = folderIndex("Clientes", [notes[1]!, notes[2]!, notes[3]!], (id) => `f${id}`);
    expect(idx).toContain("Índice escrito pela IA: [[f4]]");
    expect(idx).toContain("- [[f2]] — Proposta enviada.");
  });
});

describe("renomear", () => {
  it("troca o alvo e preserva seção e apelido, sem tocar outros links", () => {
    const md = "Ver [[Cliente A]], [[cliente a#Proposta]], [[Cliente A|o A]] e [[Cliente AB]].";
    expect(replaceWikilinkTarget(md, "Cliente A", "Cliente Alfa")).toBe(
      "Ver [[Cliente Alfa]], [[Cliente Alfa#Proposta]], [[Cliente Alfa|o A]] e [[Cliente AB]].",
    );
  });
});

describe("conector MCP com leitura", () => {
  const capture = vi.fn(async () => ({ ok: true, mensagem: "ok" }));
  const reader: Reader = {
    contexto: vi.fn(async () => "núcleo"),
    mapa: vi.fn(async () => "mapa"),
    buscar: vi.fn(async (q: string) => `achei ${q}`),
    ler: vi.fn(async (id: string) => (id === "x" ? "conteúdo" : null)),
    agenda: vi.fn(async (d: number) => `agenda ${d}`),
  };
  const call = (name: string, args: Record<string, unknown> = {}) =>
    handleMcpMessage(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
      capture,
      reader,
    ) as Promise<{
      result: { content: { text: string }[]; isError: boolean };
    }>;

  it("lista as ferramentas de leitura só quando há leitor", async () => {
    const r = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      capture,
      reader,
    )) as { result: { tools: { name: string }[] } };
    expect(r.result.tools.map((t) => t.name)).toEqual([
      "capturar_nota",
      ...READ_TOOLS.map((t) => t.name),
    ]);
    const sem = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "contexto_essencial" } },
      capture,
    )) as { error?: unknown };
    expect(sem.error).toBeTruthy();
  });

  it("encaminha cada ferramenta", async () => {
    expect((await call("contexto_essencial")).result.content[0]!.text).toBe("núcleo");
    expect((await call("buscar_notas", { busca: "vendas" })).result.content[0]!.text).toBe(
      "achei vendas",
    );
    expect((await call("ler_nota", { id: "y" })).result.isError).toBe(true);
    expect((await call("ler_nota", { id: "x" })).result.content[0]!.text).toBe("conteúdo");
    expect((await call("tarefas_e_agenda")).result.content[0]!.text).toBe("agenda 7");
  });
});
