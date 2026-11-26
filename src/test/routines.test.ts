import { describe, expect, it } from "vitest";
import {
  END_OF_DAY_HEADING,
  BRIEFING_HEADING,
  upsertBriefing,
  upsertSection,
} from "@/lib/briefing-utils";
import { cleanupReport, findDuplicates, isRoutine, titleKey } from "@/lib/routine-utils";

describe("rotinas", () => {
  it("reconhece só as rotinas conhecidas", () => {
    expect(isRoutine("fim-do-dia")).toBe(true);
    expect(isRoutine("apagar-tudo")).toBe(false);
  });

  it("acha duplicadas ignorando acento, caixa, pontuação e ordem; diário fica de fora", () => {
    expect(titleKey("Precificação de Consultoria!")).toBe(titleKey("consultoria de precificacao"));
    const groups = findDuplicates([
      { title: "Precificação de consultoria", type: "referencia" },
      { title: "consultoria: precificacao de", type: "ideia" },
      { title: "Diário 01/01", type: "diario" },
      { title: "Diário 01/01", type: "diario" },
      { title: "Outra", type: "ideia" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("faxina vira caixas, sem seção vazia, e celebra quando não há nada", () => {
    const base = {
      dateBR: "27/11/2026",
      duplicates: [],
      errors: [],
      longNoSummary: [],
      staleIndexes: [],
      oldOverdue: [],
      missingCore: [],
      pendingSuggestions: 0,
      orphans: 0,
    };
    expect(cleanupReport(base)).toContain("não achou nada");
    const md = cleanupReport({
      ...base,
      errors: [{ title: "Nota X" }],
      missingCore: ["Oferta"],
      orphans: 3,
    });
    expect(md).toContain("- [ ] [[Nota X]]");
    expect(md).toContain("- [ ] Oferta");
    expect(md).toContain("achou 2 pontos");
    expect(md).toContain("3 notas sem nenhuma ligação");
    expect(md).not.toContain("Possíveis duplicadas");
  });

  it("fim do dia e briefing convivem no diário sem um apagar o outro", () => {
    let c = "# Diário\n\nCaptura 1\n";
    c = upsertBriefing(c, "manhã");
    c = upsertSection(c, END_OF_DAY_HEADING, "noite v1");
    c = upsertSection(c, END_OF_DAY_HEADING, "noite v2");
    c = upsertBriefing(c, "manhã v2");
    expect(c).toContain("Captura 1");
    expect(c).toContain(`${BRIEFING_HEADING}\n\nmanhã v2`);
    expect(c).toContain(`${END_OF_DAY_HEADING}\n\nnoite v2`);
    expect(c).not.toContain("noite v1");
  });
});
