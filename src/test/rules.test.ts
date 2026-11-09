import { describe, expect, it } from "vitest";
import {
  extractHashtags,
  extractWikilinks,
  linkStatusForConfidence,
  noteToMarkdown,
  safeHeadline,
} from "@/lib/markdown-utils";
import { groupTasks } from "@/lib/tasks-utils";

describe("wikilinks e tags", () => {
  it("extrai wikilinks com alias", () => {
    expect(extractWikilinks("Ver [[PROLAV]] e [[Meta Ads (BM)|anúncios]] e [[prolav]]")).toEqual([
      "prolav",
      "Meta Ads (BM)",
    ]);
  });
  it("extrai #tags e ignora títulos markdown", () => {
    expect(extractHashtags("# Título\nTexto #Cliente e #maceio")).toEqual(["cliente", "maceio"]);
  });
});

describe("ligações da IA", () => {
  it("confiança 0.85 entra como aceita", () => expect(linkStatusForConfidence(0.85)).toBe("aceita"));
  it("confiança 0.84 entra como sugerida", () => expect(linkStatusForConfidence(0.84)).toBe("sugerida"));
});

describe("tarefas", () => {
  it("agrupa por Atrasadas, Hoje, Próximos dias e Sem data", () => {
    const g = groupTasks(
      [{ due_date: "2026-11-01" }, { due_date: "2026-11-09" }, { due_date: "2026-11-12" }, { due_date: null }],
      "2026-11-09",
    );
    expect([g.atrasadas.length, g.hoje.length, g.proximos.length, g.sem_data.length]).toEqual([1, 1, 1, 1]);
  });
});

describe("exportação", () => {
  it("gera frontmatter e adiciona ligações faltantes como wikilinks", () => {
    const md = noteToMarkdown(
      {
        title: "PROLAV",
        content: "Ver [[Playbook PROLAV]]",
        type: "cliente",
        tags: ["cliente"],
        summary: null,
        source_url: null,
        created_at: "2026-11-09",
        updated_at: "2026-11-09",
      },
      ["Playbook PROLAV", "Meta Ads (BM)"],
    );
    expect(md).toContain("tipo: cliente");
    expect(md).toContain("- [[Meta Ads (BM)]]");
    expect(md).not.toContain("- [[Playbook PROLAV]]");
  });
  it("escapa HTML na busca mantendo <mark>", () => {
    expect(safeHeadline("<b>x</b> <mark>y</mark>")).toBe("&lt;b&gt;x&lt;/b&gt; <mark>y</mark>");
  });
});
