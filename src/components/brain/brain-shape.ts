/**
 * Forma de cérebro para o grafo 3D: dois hemisférios (elipsoides) lado a lado, um pouco achatados embaixo.
 * As notas são atraídas para a "casca" (o córtex) e o grafo vai se construindo como um cérebro.
 * Eixos: x = esquerda/direita, y = cima/baixo, z = frente/trás.
 */

/** Raio de referência: cresce devagar com o número de notas (cérebro maior, sem ficar ralo nem apertado). */
export function brainRadius(n: number) {
  return 90 + 18 * Math.sqrt(Math.max(1, n));
}

const AX = 0.42; // largura de cada hemisfério
const AY = 0.62; // altura
const AZ = 0.92; // comprimento (frente-trás)
const GAP = 0.4; // distância de cada hemisfério ao centro (fissura no meio)

/** Hemisfério estável por nota (o mesmo id sempre do mesmo lado). */
export function hemisphereOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h & 1 ? 1 : -1;
}

/** Ponto da casca do cérebro na direção de (x,y,z), visto do centro do hemisfério. */
export function brainTarget(x: number, sy: number, sz: number, side: 1 | -1, R: number) {
  // A câmera olha ao longo de z: trocamos y/z para o cérebro aparecer visto de cima (dois hemisférios alongados).
  const t = brainTargetUpright(x, sz, -sy, side, R);
  return { x: t.x, y: -t.z, z: t.y };
}

function brainTargetUpright(x: number, y: number, z: number, side: 1 | -1, R: number) {
  const cx = side * GAP * R;
  let dx = x - cx;
  let dy = y;
  let dz = z;
  if (dx * side < 0) dx *= 0.3; // não atravessa a fissura para o outro lado
  const len = Math.hypot(dx / AX, dy / AY, dz / AZ) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  // Base achatada (o cérebro "assenta" embaixo) e sulcos suaves que dão o aspecto de dobras.
  const flat = dy < 0 ? 0.72 : 1;
  const fold = 1 + 0.06 * Math.sin(dz * 9) * Math.cos(dy * 7);
  // A face interna para antes do meio: fica uma fissura visível entre os hemisférios.
  const outX = side * Math.max(side * (cx + dx * R * fold), 0.1 * R);
  return { x: outX, y: dy * R * flat * fold, z: dz * R * fold };
}

type SimNode = { id?: string | number; x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number };

/** Força (formato d3-force) que puxa cada nota para a casca do cérebro. */
export function brainForce(R: () => number, strength = 0.25) {
  let nodes: SimNode[] = [];
  const force = (alpha: number) => {
    const r = R();
    for (const n of nodes) {
      if (n.x === undefined) continue;
      const t = brainTarget(n.x, n.y ?? 0, n.z ?? 0, hemisphereOf(String(n.id)), r);
      const k = strength * alpha;
      n.vx = (n.vx ?? 0) + (t.x - n.x) * k;
      n.vy = (n.vy ?? 0) + (t.y - (n.y ?? 0)) * k;
      n.vz = (n.vz ?? 0) + (t.z - (n.z ?? 0)) * k;
    }
  };
  force.initialize = (ns: SimNode[]) => {
    nodes = ns;
  };
  return force;
}

/** Pontos da superfície do cérebro (o "contorno" fantasma), determinísticos. */
export function brainSurface(count: number, R: number) {
  const pos = new Float32Array(count * 3);
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const k = Math.sqrt(1 - u * u);
    const side = i % 2 ? 1 : -1;
    const t = brainTarget(side * GAP * R + k * Math.cos(th) * R, u * R, k * Math.sin(th) * R, side, R);
    pos[i * 3] = t.x;
    pos[i * 3 + 1] = t.y;
    pos[i * 3 + 2] = t.z;
  }
  return pos;
}
