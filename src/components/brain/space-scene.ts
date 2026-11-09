import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  LineBasicMaterial,
  Points,
  PointsMaterial,
} from "three";

/** Paleta "neurônios no espaço" do grafo 3D (fixa, independente do tema claro/escuro). */
export const SPACE = {
  fog: "#060b22",
  filament: "#4f9dff",
  suggested: "#a77bff",
  spark: "#bfeaff",
  gold: "#ffc46b",
  /** Degradê do fundo (fica atrás do canvas transparente). */
  background: "radial-gradient(ellipse at 50% 42%, #16307a 0%, #0b1642 30%, #050a24 62%, #02030b 100%)",
};

let neuronTex: CanvasTexture | null = null;
/** Neurônio: miolo branco quente e halo suave. Criada uma vez e reaproveitada por todas as notas. */
export function neuronTexture() {
  if (neuronTex) return neuronTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.08, "rgba(255,255,255,0.95)");
  g.addColorStop(0.2, "rgba(255,255,255,0.45)");
  g.addColorStop(0.45, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  neuronTex = new CanvasTexture(c);
  return neuronTex;
}

/** Mistura a cor do tipo com branco: a nota mantém sua cor, mas brilha como luz. */
export function luminous(color: string, toWhite = 0.35) {
  return new Color(color || "#8fb8ff").lerp(new Color("#ffffff"), toWhite);
}

/** Filamentos: linhas de luz somadas (aditivas), compartilhadas por todas as ligações. */
export const LINK_MATERIALS = {
  normal: new LineBasicMaterial({ color: SPACE.filament, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }),
  suggested: new LineBasicMaterial({ color: SPACE.suggested, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }),
  /** Fora do foco: a rede continua visível ao fundo, como nas referências. */
  dim: new LineBasicMaterial({ color: SPACE.filament, transparent: true, opacity: 0.09, blending: AdditiveBlending, depthWrite: false }),
  active: new LineBasicMaterial({ color: SPACE.gold, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false }),
};

/** Pontos aleatórios: numa casca esférica (estrelas) ou dentro de uma esfera (poeira). Determinístico. */
export function spherePoints(count: number, rMin: number, rMax: number, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const t = rnd() * Math.PI * 2;
    const r = rMin + (rMax - rMin) * Math.cbrt(rnd());
    const k = Math.sqrt(1 - u * u);
    pos[i * 3] = r * k * Math.cos(t);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * k * Math.sin(t);
  }
  return pos;
}

/**
 * Fundo de espaço: estrelas distantes (tamanho fixo na tela, sem neblina, dão parallax ao girar)
 * e poeira desfocada entre as notas (bokeh). Dois draw calls no total.
 */
export function createSpace() {
  const group = new Group();
  const starsGeo = new BufferGeometry();
  starsGeo.setAttribute("position", new BufferAttribute(spherePoints(1800, 2500, 6000, 7), 3));
  const stars = new Points(
    starsGeo,
    new PointsMaterial({ color: "#cfe3ff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false, depthWrite: false }),
  );
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute("position", new BufferAttribute(spherePoints(260, 0, 1, 13), 3));
  const dust = new Points(
    dustGeo,
    new PointsMaterial({ map: neuronTexture(), color: "#3d7bff", size: 26, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false }),
  );
  dust.scale.setScalar(500); // espalhada desde o início (o tamanho real vem do enquadramento)
  group.add(stars, dust);
  return {
    group,
    dust,
    dispose() {
      starsGeo.dispose();
      dustGeo.dispose();
      (stars.material as PointsMaterial).dispose();
      (dust.material as PointsMaterial).dispose();
    },
  };
}

/**
 * Raio do alvo de clique de um neurônio, em unidades da textura (0,5 = sprite inteiro).
 * Normalmente só o miolo (`core`); mas o alvo nunca fica menor que `minPx` na tela, senão notas
 * distantes (pequenas) seriam impossíveis de acertar.
 */
export function hitRadius(core: number, minPx: number, spritePx: number) {
  if (!(spritePx > 0)) return core;
  return Math.min(0.5, Math.max(core, minPx / 2 / spritePx));
}

/** O ponto tocado (uv da textura) está dentro do alvo? */
export function insideHit(uv: { x: number; y: number }, radius: number) {
  return Math.hypot(uv.x - 0.5, uv.y - 0.5) <= radius;
}
