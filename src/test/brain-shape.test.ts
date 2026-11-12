import { describe, expect, it } from "vitest";
import { brainForce, brainRadius, brainSurface, brainTarget, hemisphereOf } from "@/components/brain/brain-shape";

describe("grafo em forma de cérebro", () => {
  it("cada nota fica sempre do mesmo lado (hemisfério estável)", () => {
    expect(hemisphereOf("abc")).toBe(hemisphereOf("abc"));
    const sides = new Set(Array.from({ length: 50 }, (_, i) => hemisphereOf(`nota-${i}`)));
    expect(sides).toEqual(new Set([1, -1]));
  });

  it("o alvo fica na casca do hemisfério certo, sem atravessar a fissura do meio", () => {
    const R = 200;
    const right = brainTarget(500, 10, 30, 1, R);
    expect(right.x).toBeGreaterThan(0);
    const crossed = brainTarget(-300, 0, 0, 1, R); // nota do lado direito puxada de longe pela esquerda
    expect(crossed.x).toBeGreaterThan(0);
    // Visto de cima: a altura do cérebro é a profundidade da tela (z), com a base achatada.
    const bottom = brainTarget(94, 0, -500, 1, R);
    const top = brainTarget(94, 0, 500, 1, R);
    expect(Math.abs(bottom.z)).toBeLessThan(Math.abs(top.z));
    // Comprido no sentido frente-trás (vertical na tela).
    expect(Math.abs(brainTarget(94, 500, 0, 1, R).y)).toBeGreaterThan(Math.abs(brainTarget(94, 0, 500, 1, R).z));
  });

  it("a força aproxima as notas da casca a cada passo", () => {
    const R = 150;
    const n = { id: "x", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    const f = brainForce(() => R);
    f.initialize([n]);
    for (let i = 0; i < 300; i++) {
      f(1);
      n.x += n.vx; n.y += n.vy; n.z += n.vz;
      n.vx *= 0.6; n.vy *= 0.6; n.vz *= 0.6;
    }
    const t = brainTarget(n.x, n.y, n.z, hemisphereOf("x"), R);
    expect(Math.hypot(t.x - n.x, t.y - n.y, t.z - n.z)).toBeLessThan(2);
  });

  it("contorno: pontos determinísticos dentro do tamanho do cérebro; raio cresce com as notas", () => {
    const a = brainSurface(400, 100);
    expect(brainSurface(400, 100)).toEqual(a);
    for (let i = 0; i < 400; i++) expect(Math.hypot(a[i * 3]!, a[i * 3 + 1]!, a[i * 3 + 2]!)).toBeLessThan(160);
    expect(brainRadius(1000)).toBeGreaterThan(brainRadius(50));
  });
});
