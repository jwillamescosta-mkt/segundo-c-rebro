import { describe, expect, it, vi } from "vitest";
import {
  extractHashtags,
  extractWikilinks,
  linkStatusForConfidence,
  noteToMarkdown,
  safeHeadline,
} from "@/lib/markdown-utils";
import { askTerms } from "@/lib/ask-utils";
import { Color } from "three";
import { hitRadius, insideHit, luminous, spherePoints } from "@/components/brain/space-scene";
import { isSmartPending, shouldAutoRun, withSmart } from "@/lib/smart-utils";
import { audioMime, describeError, sniffAudio } from "@/lib/audio-utils";
import { buildChildContent, cleanRefs, cleanTopics, profileForPrompt, sanitizeWikilinks } from "@/lib/split-utils";
import { goalPace, goalProgress, krProgress } from "@/lib/goals-utils";
import { BRIEFING_HEADING, demoteHeadings, upsertBriefing } from "@/lib/briefing-utils";
import { cardsToMarkdown, intervalLabel, schedule } from "@/lib/study-utils";
import {
  agendaToMarkdown,
  buildAgenda,
  eventStatusForConfidence,
  groupTasks,
  localDate,
  localTime,
  localToTimestamptz,
} from "@/lib/tasks-utils";

describe("cena do grafo 3D", () => {
  it("pontos ficam dentro da casca pedida e são sempre os mesmos (sem piscar entre renders)", () => {
    const a = spherePoints(500, 100, 200, 3);
    for (let i = 0; i < 500; i++) {
      const r = Math.hypot(a[i * 3]!, a[i * 3 + 1]!, a[i * 3 + 2]!);
      expect(r).toBeGreaterThanOrEqual(99.99);
      expect(r).toBeLessThanOrEqual(200.01);
    }
    expect(spherePoints(500, 100, 200, 3)).toEqual(a);
  });
  it("cor luminosa mistura com branco e aguenta cor vazia", () => {
    expect(luminous("#000000", 0.5).getHexString()).toBe(new Color("#000000").lerp(new Color("#ffffff"), 0.5).getHexString());
    expect(luminous("").getHexString()).toHaveLength(6);
  });
});

describe("alvo de clique do neurônio", () => {
  it("perto: só o miolo responde, o halo não", () => {
    const r = hitRadius(0.12, 24, 300); // neurônio grande na tela
    expect(r).toBe(0.12);
    expect(insideHit({ x: 0.55, y: 0.5 }, r)).toBe(true);
    expect(insideHit({ x: 0.75, y: 0.5 }, r)).toBe(false); // borda do brilho
  });
  it("longe: o alvo cresce até um mínimo em pixels, sem passar do sprite", () => {
    expect(hitRadius(0.12, 24, 60)).toBeCloseTo(0.2); // 12px de raio em 60px
    expect(hitRadius(0.12, 24, 10)).toBe(0.5);
    expect(hitRadius(0.12, 24, 0)).toBe(0.12);
  });
});

describe("lote inteligente", () => {
  const n = (over: Record<string, unknown> = {}) => ({ entities: { smart_pass: "pendente" }, status: "pronta", type: "ideia", ...over });
  it("só espera a passada quem está pronta, não é diário e tem o marcador pendente", () => {
    expect(isSmartPending(n())).toBe(true);
    expect(isSmartPending(n({ entities: { smart_pass: "feito" } }))).toBe(false);
    expect(isSmartPending(n({ entities: {} }))).toBe(false);
    expect(isSmartPending(n({ status: "processando" }))).toBe(false);
    expect(isSmartPending(n({ type: "diario" }))).toBe(false);
  });
  it("marcador preserva as outras chaves e pode ser removido", () => {
    expect(withSmart({ split_from: "x", pessoas: ["a"] }, "pendente")).toEqual({ split_from: "x", pessoas: ["a"], smart_pass: "pendente" });
    expect(withSmart({ smart_pass: "pendente", a: 1 }, null)).toEqual({ a: 1 });
    expect(withSmart(null, "feito")).toEqual({ smart_pass: "feito" });
  });
  it("roda sozinho só com limite ligado e fila suficiente", () => {
    expect([shouldAutoRun(9, 10), shouldAutoRun(10, 10), shouldAutoRun(50, 0), shouldAutoRun(1, 1)]).toEqual([false, true, false, true]);
  });
});

describe("grafo 3D", () => {
  it("marca que sobrou denuncia a queda até o 3D voltar à tela; sem marca, nada", async () => {
    const load = async () => (vi.resetModules(), await import("@/components/brain/LazyGraph"));
    let m = await load();
    expect(m.crashed3D()).toBe(false);
    m.mark3D(true); // 3D na tela e a página "cai" (novo carregamento, marca ainda lá)
    m = await load();
    expect([m.crashed3D(), m.crashed3D()]).toEqual([true, true]);
    m.mark3D(true); // o usuário reabriu o 3D
    expect(m.crashed3D()).toBe(false);
    m.mark3D(false); // saída normal
    m = await load();
    expect(m.crashed3D()).toBe(false);
  });
});

describe("áudio", () => {
  it("MIME por extensão: iPhone m4a e webm do navegador", () => {
    expect([audioMime("m4a"), audioMime("MP3"), audioMime("weba"), audioMime("wav"), audioMime("xyz")]).toEqual([
      "audio/mp4", "audio/mpeg", "audio/webm", "audio/wav", "audio/mpeg",
    ]);
  });
  it("reconhece o container pelos bytes (MP4 do iPhone, WebM, WAV)", () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
    expect(sniffAudio(mp4)).toEqual({ type: "audio/mp4", ext: "m4a" });
    expect(sniffAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]))?.ext).toBe("webm");
    expect(sniffAudio(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]))?.ext).toBe("wav");
    expect(sniffAudio(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
  it("descreve o erro do gateway de forma curta, com código e status", () => {
    expect(describeError({ code: "request_rejected", httpStatus: 400, message: "formato  não\nsuportado" })).toBe("request_rejected 400: formato não suportado");
    expect(describeError(new Error("falhou"))).toBe("falhou");
    expect(describeError(null)).toBe("erro desconhecido");
  });
});

describe("separar capturas em pontos", () => {
  const t = (title: string, confidence = 0.9, type = "ideia") => ({ title, type, summary: "s", content: `texto ${title}`, tags: ["#A"], confidence });
  it("só separa quando sobram 2 ou mais assuntos confiáveis", () => {
    expect(cleanTopics([t("Escola do João")])).toEqual([]);
    expect(cleanTopics([t("Escola do João"), t("Orçamento", 0.4)])).toEqual([]);
    expect(cleanTopics([t("Escola do João"), t("Orçamento")])).toHaveLength(2);
  });
  it("normaliza tipo inválido, remove duplicados, limpa tags e limita a 6", () => {
    const r = cleanTopics([t("A", 0.9, "xyz"), t("a"), t("B", 0.9, "diario"), ...["C", "D", "E", "F", "G", "H"].map((x) => t(x))]);
    expect(r).toHaveLength(6);
    expect(r[0]).toMatchObject({ title: "A", type: "ideia", tags: ["a"] });
    expect(r[1]).toMatchObject({ title: "B", type: "ideia" });
  });
  it("aceita só pessoa, cliente e projeto, sem repetir", () => {
    const refs = cleanRefs([
      { name: "Maria", type: "pessoa", relation: "esposa", confidence: 0.95 },
      { name: "maria", type: "pessoa", relation: "dup", confidence: 1 },
      { name: "Escola", type: "lugar", relation: "", confidence: 1 },
      { name: "X", type: "pessoa", relation: "", confidence: 1 },
    ]);
    expect(refs).toEqual([{ name: "Maria", type: "pessoa", relation: "esposa", confidence: 0.95 }]);
  });
  it("wikilink para nota inexistente vira texto simples; existente é mantida", () => {
    const known = new Set(["maria"]);
    expect(sanitizeWikilinks("Falei com [[Maria]] e [[Fulano]] e [[Zé|o Zé]]", known)).toBe("Falei com [[Maria]] e Fulano e o Zé");
  });
  it("conteúdo do ponto termina com a origem ligada", () => {
    const md = buildChildContent({ title: "Escola", type: "ideia", summary: "", content: "Levei [[Joao]]", tags: [], confidence: 1 }, "Captura de terça", new Set());
    expect(md).toBe("# Escola\n\nLevei Joao\n\nOrigem: [[Captura de terça]]\n");
  });
  it("perfil ignora as linhas ainda não preenchidas", () => {
    const p = profileForPrompt("## Família\n- (preencha: quem mora)\n- Maria (esposa)\n-");
    expect(p).toBe("## Família\n- Maria (esposa)");
  });
});

describe("metas", () => {
  it("progresso é a média dos resultados-chave, limitado a 100%", () => {
    expect(goalProgress([{ current: 5, target: 10 }, { current: 30, target: 20 }])).toBe(0.75);
  });
  it("sem resultados-chave usa as tarefas ligadas", () => {
    expect(goalProgress([], [{ done: true }, { done: false }])).toBe(0.5);
    expect(goalProgress([])).toBe(0);
  });
  it("alvo zero não divide por zero", () => expect(krProgress({ current: 3, target: 0 })).toBe(0));
  it("ritmo compara progresso com o tempo passado", () => {
    expect(goalPace(0.5, "2026-01-01", "2026-01-11", "2026-01-06")).toBe("no ritmo");
    expect(goalPace(0.1, "2026-01-01", "2026-01-11", "2026-01-09")).toBe("atrasada");
    expect(goalPace(0.9, "2026-01-01", "2026-01-11", "2026-01-03")).toBe("adiantada");
    expect(goalPace(0.9, "2026-01-01", null, "2026-01-03")).toBeNull();
  });
});

describe("briefing", () => {
  it("adiciona o briefing no fim do diário", () => {
    expect(upsertBriefing("# Diário\n\nAnotei algo.", "### Foco\n- A")).toBe(`# Diário\n\nAnotei algo.\n\n${BRIEFING_HEADING}\n\n### Foco\n- A\n`);
  });
  it("troca o briefing anterior e preserva as outras seções", () => {
    const old = `# Diário\n\n${BRIEFING_HEADING}\n\nvelho\n\n## Notas\n\nminhas notas`;
    const r = upsertBriefing(old, "novo");
    expect(r).toContain("novo");
    expect(r).not.toContain("velho");
    expect(r).toContain("## Notas\n\nminhas notas");
  });
  it("rebaixa títulos # e ## para ###", () => {
    expect(demoteHeadings("## Foco\n# X\n### Y")).toBe("### Foco\n### X\n### Y");
  });
});

describe("revisão espaçada", () => {
  const novo = { interval_days: 0, ease: 2.5, reps: 0, lapses: 0 };
  it("card novo: Bom revisa amanhã, Fácil em 3 dias", () => {
    expect(schedule(novo, 3, "2026-11-09").due).toBe("2026-11-10");
    expect(schedule(novo, 4, "2026-11-09").due).toBe("2026-11-12");
  });
  it("acertos seguidos aumentam o intervalo", () => {
    const a = schedule(novo, 3, "2026-11-09");
    const b = schedule(a, 3, a.due);
    const c = schedule(b, 3, b.due);
    expect([a.interval_days, b.interval_days, c.interval_days]).toEqual([1, 6, 15]);
  });
  it("errar volta para amanhã e reduz a facilidade, sem passar de 1,3", () => {
    const r = schedule({ interval_days: 40, ease: 1.35, reps: 5, lapses: 0 }, 1, "2026-11-09");
    expect(r).toMatchObject({ interval_days: 1, reps: 0, lapses: 1, ease: 1.3, due: "2026-11-10" });
  });
  it("rótulo do intervalo", () => {
    expect([intervalLabel(1), intervalLabel(6), intervalLabel(60), intervalLabel(365)]).toEqual(["1 dia", "6 dias", "2 meses", "1 ano"]);
  });
  it("exporta no formato pergunta::resposta do Obsidian", () => {
    const md = cardsToMarkdown([{ question: "O que é SM-2?", answer: "Um algoritmo\nde revisão", note_id: "n1" }], (id) => (id === "n1" ? "Memória" : null));
    expect(md).toContain("O que é SM-2?::Um algoritmo de revisão — [[Memória]]");
  });
});

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
