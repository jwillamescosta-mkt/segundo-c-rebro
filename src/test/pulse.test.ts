import { describe, expect, it } from "vitest";
import { brainPulse, greeting } from "@/lib/pulse-utils";

const at = (date: string, type = "ideia") => ({ created_at: `${date}T15:00:00-03:00`, type });

describe("pulso do cérebro", () => {
  it("conta dias seguidos até hoje", () => {
    const p = brainPulse([at("2026-11-09"), at("2026-11-09"), at("2026-11-08"), at("2026-11-07"), at("2026-11-05")], "2026-11-09");
    expect(p.streak).toBe(3);
    expect(p.today).toBe(2);
    expect(p.days).toHaveLength(14);
    expect(p.days[13]).toEqual({ date: "2026-11-09", count: 2 });
    expect(p.days[0]!.date).toBe("2026-10-27");
  });
  it("hoje sem captura não quebra a sequência; ontem sem captura zera", () => {
    expect(brainPulse([at("2026-11-08"), at("2026-11-07")], "2026-11-09").streak).toBe(2);
    expect(brainPulse([at("2026-11-07")], "2026-11-09").streak).toBe(0);
  });
  it("diário não conta como captura; nota às 23h conta no dia local, não no dia UTC", () => {
    expect(brainPulse([at("2026-11-09", "diario")], "2026-11-09").today).toBe(0);
    expect(brainPulse([{ created_at: "2026-11-10T01:30:00Z", type: "ideia" }], "2026-11-09").today).toBe(1);
  });
  it("saudação pela hora", () => {
    expect([greeting(3), greeting(8), greeting(14), greeting(21)]).toEqual(["Boa madrugada", "Bom dia", "Boa tarde", "Boa noite"]);
  });
});
