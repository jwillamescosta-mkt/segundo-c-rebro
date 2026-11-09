import { describe, expect, it } from "vitest";
import {
  extractHashtags,
  extractWikilinks,
  linkStatusForConfidence,
  noteToMarkdown,
  safeHeadline,
} from "@/lib/markdown-utils";
import { askTerms } from "@/lib/ask-utils";
import {
  agendaToMarkdown,
  buildAgenda,
  eventStatusForConfidence,
  groupTasks,
  localDate,
  localTime,
  localToTimestamptz,
} from "@/lib/tasks-utils";

describe("perguntar", () => {
  it("tira palavras comuns e mantém acentos e termos úteis", () => {
    expect(askTerms("O que eu aprendi sobre negociação com o cliente na reunião?")).toEqual(["aprendi", "negociação", "cliente", "reunião"]);
  });
  it("ignora números, 'or' e repetições, com limite", () => {
    expect(askTerms("2026 or vendas vendas metas", 2)).toEqual(["vendas", "metas"]);
  });
});

describe("agenda", () => {
  it("converte data e hora de Brasília para timestamptz", () => {
    expect(localToTimestamptz("2026-11-13", "14:30")).toBe("2026-11-13T14:30:00-03:00");
    expect(localToTimestamptz("2026-11-13", null)).toBe("2026-11-13T00:00:00-03:00");
    expect(localToTimestamptz("13/11/2026", "14:30")).toBeNull();
    expect(localToTimestamptz("2026-11-13", "25:00")).toBe("2026-11-13T00:00:00-03:00");
  });
  it("volta ao dia e hora locais mesmo perto da meia-noite UTC", () => {
    const ts = localToTimestamptz("2026-11-13", "22:00")!;
    expect(localDate(ts)).toBe("2026-11-13");
    expect(localTime(ts)).toBe("22:00");
  });
  it("evento com confiança 0.85 entra confirmado; abaixo fica sugerido", () => {
    expect(eventStatusForConfidence(0.85)).toBe("confirmado");
    expect(eventStatusForConfidence(0.6)).toBe("sugerido");
  });
  const tasks = [
    { id: "t1", text: "Entregar proposta", due_date: "2026-11-13", due_time: "18:00:00", note_id: null, done: false },
    { id: "t2", text: "Fora do período", due_date: "2026-12-01", due_time: null, note_id: null, done: false },
  ];
  const events = [
    { id: "e1", title: "Reunião", starts_at: "2026-11-13T09:00:00-03:00", all_day: false, note_id: "n1", status: "confirmado" },
    { id: "e2", title: "Aniversário", starts_at: "2026-11-13T00:00:00-03:00", all_day: true, note_id: null, status: "sugerido" },
  ];
  it("junta tarefas e eventos por dia, sem hora primeiro", () => {
    const day = buildAgenda(tasks, events, "2026-11-09", "2026-11-15").get("2026-11-13")!;
    expect(day.map((i) => [i.title, i.time])).toEqual([["Aniversário", null], ["Reunião", "09:00"], ["Entregar proposta", "18:00"]]);
  });
  it("exporta a agenda em markdown com checklist e wikilink", () => {
    const md = agendaToMarkdown(tasks, events, (id) => (id === "n1" ? "Nota X" : null));
    expect(md).toContain("- [ ] 18:00 Entregar proposta");
    expect(md).toContain("- 09:00 Reunião — [[Nota X]]");
    expect(md).toContain("- Aniversário (sugestão)");
  });
});

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
