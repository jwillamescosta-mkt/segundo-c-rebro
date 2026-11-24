import { describe, expect, it } from "vitest";
import { nextMonday, rescheduleOptions, reviewCount, strongSuggestions } from "@/lib/review-utils";
import { expandWithNeighbors } from "@/lib/ask-utils";
import { EXPRESS_VALUES, expressFormat, expressTitle } from "@/lib/express-utils";

describe("revisão", () => {
  it("próxima segunda", () => {
    expect(nextMonday("2026-11-24")).toBe("2026-11-30"); // terça
    expect(nextMonday("2026-11-30")).toBe("2026-12-07"); // segunda → a da semana que vem
    expect(nextMonday("2026-11-29")).toBe("2026-11-30"); // domingo
  });
  it("opções de reagendar", () => {
    const o = rescheduleOptions("2026-11-24");
    expect(o.map((x) => x.date)).toEqual(["2026-11-24", "2026-11-25", "2026-11-30", null]);
  });
  it("conta itens e filtra sugestões fortes", () => {
    expect(reviewCount({ suggested: 3, overdue: 2, orphans: 1, pending: 4 })).toBe(10);
    const l = [
      { status: "sugerida", confidence: 0.8 },
      { status: "sugerida", confidence: 0.5 },
      { status: "aceita", confidence: 0.95 },
      { status: "sugerida", confidence: null },
    ];
    expect(strongSuggestions(l)).toEqual([{ status: "sugerida", confidence: 0.8 }]);
  });
});

describe("busca em grafo", () => {
  const links = [
    { source_note_id: "a", target_note_id: "x", status: "aceita" },
    { source_note_id: "y", target_note_id: "a", status: "aceita" },
    { source_note_id: "a", target_note_id: "z", status: "sugerida" },
    { source_note_id: "b", target_note_id: "x", status: "aceita" },
  ];
  it("soma vizinhas aceitas, sem repetir e respeitando o limite", () => {
    expect(expandWithNeighbors(["a", "b"], links, 10)).toEqual(["a", "b", "x", "y"]);
    expect(expandWithNeighbors(["a", "b"], links, 3)).toEqual(["a", "b", "x"]);
    expect(expandWithNeighbors([], links, 5)).toEqual([]);
  });
});

describe("expressar", () => {
  it("formatos e títulos", () => {
    expect(EXPRESS_VALUES).toContain("video");
    expect(expressFormat("nada")).toBeNull();
    expect(expressTitle("video", "Masterplan 2026")).toBe("Roteiro de vídeo: Masterplan 2026");
    expect(expressTitle("carrossel", "x".repeat(200)).length).toBeLessThanOrEqual(110);
  });
});
