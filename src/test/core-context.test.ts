import { describe, expect, it } from "vitest";
import { CORE_MAX, CORE_TAG, CORE_TOPICS, formatCoreContext, isCoreNote } from "@/lib/core-utils";
import { PROFILE_TITLE } from "@/lib/split-utils";

describe("contexto essencial", () => {
  it("põe o perfil primeiro, ignora linhas de modelo não preenchidas e usa o resumo quando não há conteúdo", () => {
    const out = formatCoreContext([
      { title: "Tom de voz", content: "Direto e bem-humorado." },
      { title: PROFILE_TITLE, content: "# Quem sou eu\n- (preencha: família)\n- Mora em Maceió" },
      { title: "Oferta", content: "", summary: "Consultoria de marketing." },
      { title: "Vazia", content: "- (preencha aqui)" },
    ]);
    expect(out.indexOf(`## ${PROFILE_TITLE}`)).toBe(0);
    expect(out).not.toContain("preencha");
    expect(out).toContain("Consultoria de marketing.");
    expect(out).not.toContain("## Vazia");
  });

  it("respeita o teto de tamanho", () => {
    const big = Array.from({ length: 20 }, (_, i) => ({
      title: `Nota ${i}`,
      content: "x".repeat(3000),
    }));
    expect(formatCoreContext(big).length).toBeLessThanOrEqual(CORE_MAX);
  });

  it("reconhece notas-núcleo e tem temas únicos", () => {
    expect(isCoreNote({ title: "Oferta", tags: [CORE_TAG] })).toBe(true);
    expect(isCoreNote({ title: PROFILE_TITLE, tags: [] })).toBe(true);
    expect(isCoreNote({ title: "Outra", tags: ["perfil"] })).toBe(false);
    expect(new Set(CORE_TOPICS.map((t) => t.key)).size).toBe(CORE_TOPICS.length);
    expect(CORE_TOPICS[0]?.title).toBe(PROFILE_TITLE);
  });
});
