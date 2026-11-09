import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-3d";
import { AdditiveBlending, Color, FogExp2, type Intersection, type PerspectiveCamera, type Raycaster, Sprite, SpriteMaterial, Vector3 } from "three";
import { useReducedMotion } from "motion/react";
import type { GLink, GNode } from "./GraphCanvas";
import { useGraphColors } from "./graph-colors";
import { LINK_MATERIALS, SPACE, createSpace, hitRadius, insideHit, luminous, neuronTexture } from "./space-scene";

type N = NodeObject<GNode>;
type L = LinkObject<GNode, GLink>;

interface Props {
  nodes: GNode[];
  links: GLink[];
  onNodeClick?: (id: string) => void;
  highlight?: Set<string> | null;
  focusId?: string | null;
  repulsion?: number;
  distance?: number;
}

const endId = (x: unknown) => (typeof x === "object" && x ? (x as N).id : (x as string)) as string;
const IDLE_MS = 6000;
const GOLD = new Color(SPACE.gold);

type NeuronNode = N & { __threeObj?: Sprite };
/** Tamanho do neurônio: cresce com as conexões (as notas centrais viram os pontos mais brilhantes). */
const radius = (n: GNode) => Math.cbrt(1 + Math.sqrt(n.degree) * 1.8) * 4;

/**
 * Grafo 3D "neurônios no espaço": fundo de galáxia com estrelas e poeira desfocada, cada nota é um neurônio
 * de luz (miolo branco, halo na cor do tipo), ligações são filamentos azuis com faíscas e o foco é dourado.
 * Sem pós-processamento: tudo é luz aditiva (cor exata e leve no celular). Um sprite por nota, sem esferas.
 * Desempenho: nitidez limitada a 2x (o iPhone tem 3x), sem faíscas em repouso em grafos grandes, e o
 * navegador pausa tudo com a aba escondida.
 * Toque/clique: o 1º foca e leva a câmera até a nota; o 2º na mesma nota a abre.
 */
export default function GraphCanvas3D({ nodes, links, onNodeClick, highlight, focusId, repulsion = 180, distance = 60 }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const [size, setSize] = useState({ w: 300, h: 300 });
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // Caminho percorrido no passeio (para o botão Voltar).
  const [trail, setTrail] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const colors = useGraphColors(true);
  const reduced = useReducedMotion();
  const big = nodes.length > 1500;
  const fogDensity = useRef(0.0004);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => ({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) }), [nodes, links]);
  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      (m.get(l.source) ?? m.set(l.source, new Set()).get(l.source)!).add(l.target);
      (m.get(l.target) ?? m.set(l.target, new Set()).get(l.target)!).add(l.source);
    }
    return m;
  }, [links]);

  const active = hover ?? selected ?? focusId ?? null;
  const activeSet = active ? new Set([active, ...(adj.get(active) ?? [])]) : null;
  const isActiveLink = (l: L) => !!active && (endId(l.source) === active || endId(l.target) === active);
  const dim = (id: string) => (activeSet && !activeSet.has(id)) || (highlight && !highlight.has(id));
  // Opacidade do halo conforme o foco atual. Em ref: os halos podem ser recriados pela biblioteca a qualquer momento
  // (ex.: quando chegam as cores do tema) e devem nascer já com o valor certo, sem depender da ordem dos efeitos.
  const haloOpacity = useRef<(id: string) => number>(() => 0.9);
  haloOpacity.current = (id: string) => (dim(id) ? 0.16 : id === active ? 1 : 0.92);

  // Montagem única: nitidez limitada e rotação automática.
  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const controls = g.controls() as { autoRotate?: boolean; autoRotateSpeed?: number; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
    let idle: ReturnType<typeof setTimeout> | undefined;
    const pause = () => {
      controls.autoRotate = false;
      clearTimeout(idle);
      if (!reduced) idle = setTimeout(() => (controls.autoRotate = !selectedRef.current), IDLE_MS);
    };
    controls.autoRotate = !reduced;
    controls.autoRotateSpeed = 0.45;
    controls.addEventListener?.("start", pause);
    return () => {
      clearTimeout(idle);
      controls.removeEventListener?.("start", pause);
    };
  }, [reduced]);

  // Espaço: estrelas, poeira desfocada (girando devagar) e neblina azul. Montado uma vez, desmontado na saída.
  const space = useRef<ReturnType<typeof createSpace> | null>(null);
  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    const sp = createSpace();
    space.current = sp;
    g.scene().add(sp.group);
    g.scene().fog = new FogExp2(SPACE.fog, fogDensity.current);
    let raf = 0;
    const drift = () => {
      sp.dust.rotation.y += 0.00035;
      sp.dust.rotation.x += 0.00012;
      raf = requestAnimationFrame(drift);
    };
    if (!reduced) raf = requestAnimationFrame(drift);
    return () => {
      cancelAnimationFrame(raf);
      g.scene().remove(sp.group);
      sp.dispose();
    };
  }, [reduced]);

  // Neurônio de cada nota: criado uma vez (função estável, para a biblioteca não recriar a cena a cada render).
  const nodeNeuron = useCallback(
    (n: N) => {
      const tint = luminous(colors[n.type] ?? colors.label);
      const mat = new SpriteMaterial({ map: neuronTexture(), color: tint, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: haloOpacity.current(n.id as string) });
      const s = new Sprite(mat);
      const base = radius(n) * 15;
      s.scale.set(base, base, 1);
      s.userData["base"] = base;
      s.userData["tint"] = tint;
      // Alvo de clique: só o miolo (o halo é só luz). Mínimo de 24 px no mouse (WCAG 2.2) e 36 px no toque, para notas distantes.
      const spriteRaycast = s.raycast.bind(s);
      s.raycast = (rc: Raycaster, out: Intersection[]) => {
        const hits: Intersection[] = [];
        spriteRaycast(rc, hits);
        const hit = hits[0];
        if (!hit?.uv) return;
        const cam = rc.camera as PerspectiveCamera;
        const spritePx = (s.scale.x / (2 * hit.distance * Math.tan((cam.fov * Math.PI) / 360))) * sizeRef.current.h;
        const touch = window.matchMedia("(hover: none)").matches;
        if (insideHit(hit.uv, hitRadius(touch ? 0.17 : 0.11, touch ? 36 : 24, spritePx))) out.push(hit);
      };
      return s;
    },
    [colors],
  );

  // Foco: acende o halo da nota ativa e dos vizinhos e apaga o resto, sem recriar a cena.
  const applyHalos = useRef(() => {});
  applyHalos.current = () => {
    for (const n of data.nodes as NeuronNode[]) {
      const neuron = n.__threeObj;
      if (!neuron?.userData["base"]) continue;
      const id = n.id as string;
      const mat = neuron.material as SpriteMaterial;
      mat.opacity = haloOpacity.current(id);
      mat.color.copy(id === active ? GOLD : (neuron.userData["tint"] as Color));
      const base = neuron.userData["base"] as number;
      neuron.scale.set(base, base, 1);
    }
  };
  useEffect(() => applyHalos.current(), [active, highlight, data, colors]);

  // A nota ativa "respira" (só ela, barato). Procura o neurônio a cada quadro: pode ter acabado de nascer.
  useEffect(() => {
    if (!active || reduced) return;
    const node = (data.nodes as NeuronNode[]).find((n) => n.id === active);
    let raf = 0;
    const tick = (t: number) => {
      const neuron = node?.__threeObj;
      if (neuron?.userData["base"]) {
        const k = (neuron.userData["base"] as number) * 1.8 * (1 + 0.14 * Math.sin(t / 260));
        neuron.scale.set(k, k, 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, data, reduced]);

  // Forças (os mesmos controles de Repulsão e Distância do 2D).
  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    (g.d3Force("charge") as unknown as { strength: (v: number) => void } | undefined)?.strength(-repulsion);
    (g.d3Force("link") as unknown as { distance: (v: number) => void } | undefined)?.distance(distance);
    g.d3ReheatSimulation();
  }, [repulsion, distance, data]);

  const fitted = useRef(false);
  const framed = useRef(false);
  useEffect(() => {
    fitted.current = false;
    framed.current = false;
  }, [data]);

  /**
   * Enquadra o grafo inteiro. O zoomToFit da biblioteca mede pelos objetos 3D e, com sprites, enxerga só ±1;
   * aqui a medida vem da posição real das notas.
   */
  const frame = (ms: number) => {
    const g = fg.current;
    if (!g || !data.nodes.length) return;
    let cx = 0, cy = 0, cz = 0;
    for (const n of data.nodes as N[]) { cx += n.x ?? 0; cy += n.y ?? 0; cz += n.z ?? 0; }
    const k = data.nodes.length;
    cx /= k; cy /= k; cz /= k;
    // Raio que cobre 90% das notas: algumas soltas lá longe não deixam o grafo minúsculo.
    const ds = (data.nodes as N[]).map((n) => Math.hypot((n.x ?? 0) - cx, (n.y ?? 0) - cy, (n.z ?? 0) - cz)).sort((a, b) => a - b);
    const r = Math.max(30, ds[Math.floor((ds.length - 1) * 0.9)] ?? 30);
    const cam = g.camera() as unknown as { fov: number; aspect: number };
    const fov = (Math.min(cam.fov, cam.fov * cam.aspect) * Math.PI) / 180;
    const dist = (r * 1.05) / Math.sin(fov / 2);
    g.cameraPosition({ x: cx, y: cy, z: cz + dist }, { x: cx, y: cy, z: cz }, ms);
  };

  /** Neblina e poeira proporcionais à distância da câmera: o fundo do grafo esmaece um pouco, a frente fica nítida. */
  const fitSpace = () => {
    const g = fg.current;
    if (!g) return;
    const dist = Math.max(200, g.camera().position.distanceTo((g.controls() as { target: Vector3 }).target));
    fogDensity.current = 0.4 / dist;
    const fog = g.scene().fog as FogExp2 | null;
    if (fog) fog.density = fogDensity.current;
    space.current?.dust.scale.setScalar(dist * 0.7);
  };

  /** Voa até a nota mantendo a direção do olhar: de vizinho em vizinho parece andar pela rede, não pular. */
  const flyTo = (n: N) => {
    const g = fg.current;
    if (!g || n.x === undefined) return;
    const target = new Vector3(n.x, n.y ?? 0, n.z ?? 0);
    const dir = g.camera().position.clone().sub(target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    const pos = target.clone().add(dir.normalize().multiplyScalar(Math.max(90, distance * 2.4)));
    g.cameraPosition({ x: pos.x, y: pos.y, z: pos.z }, { x: target.x, y: target.y, z: target.z }, reduced ? 0 : 1100);
  };

  const nodeById = useMemo(() => new Map((data.nodes as N[]).map((n) => [n.id as string, n])), [data]);
  /** Foca uma nota e leva a câmera até ela. `from` entra no caminho para o Voltar. */
  const go = (id: string, from: string | null) => {
    const n = nodeById.get(id);
    if (!n) return;
    if (from && from !== id) setTrail((t) => [...t.slice(-30), from]);
    setSelected(id);
    const controls = fg.current?.controls() as { autoRotate?: boolean } | undefined;
    if (controls) controls.autoRotate = false; // parado durante o passeio
    flyTo(n);
  };
  const back = () => {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    setTrail((t) => t.slice(0, -1));
    go(prev, null);
  };
  const overview = () => {
    setSelected(null);
    setTrail([]);
    frame(reduced ? 0 : 1100);
  };

  // Teclado (computador): Esc volta à visão geral; Backspace volta pelo caminho.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input,textarea,select")) return;
      if (e.key === "Escape" && selectedRef.current) overview();
      else if (e.key === "Backspace" && selectedRef.current) {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selectedNode = selected ? nodeById.get(selected) : undefined;
  // Notas ligadas à que está em foco, das mais conectadas para as menos (as "estradas" do passeio).
  const neighbors = selected
    ? [...(adj.get(selected) ?? [])].map((id) => nodeById.get(id)).filter((n): n is N => !!n).sort((a, b) => b.degree - a.degree)
    : [];

  return (
    <div ref={wrap} className="relative h-full w-full" style={{ background: SPACE.background }}>
      <ForceGraph3D<GNode, GLink>
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
        controlType="orbit"
        // Layout pré-calculado antes do 1º quadro e enquadrado já no começo: nunca abre com a câmera dentro do grafo.
        warmupTicks={big ? 40 : 80}
        onEngineTick={() => {
          if (framed.current || !fg.current) return;
          framed.current = true;
          frame(0);
          fitSpace();
        }}
        cooldownTicks={big ? 120 : 250}
        cooldownTime={big ? 6000 : 12000}
        onEngineStop={() => {
          applyHalos.current();
          if (fitted.current || !fg.current) return;
          fitted.current = true;
          frame(reduced ? 0 : 1200);
          setTimeout(fitSpace, reduced ? 0 : 1300);
        }}
        nodeRelSize={4}
        nodeVal={(n) => 1 + Math.sqrt(n.degree) * 1.8}
        nodeThreeObject={nodeNeuron}
        nodeLabel={(n) => n.title}
        linkMaterial={(l) => (isActiveLink(l) ? LINK_MATERIALS.active : active ? LINK_MATERIALS.dim : l.suggested ? LINK_MATERIALS.suggested : LINK_MATERIALS.normal)}
        linkWidth={0}
        linkDirectionalParticles={(l) => (reduced ? 0 : isActiveLink(l) ? 5 : !active && !big && nodes.length < 400 && !l.suggested ? 1 : 0)}
        linkDirectionalParticleSpeed={(l) => (isActiveLink(l) ? 0.014 : 0.0045)}
        linkDirectionalParticleWidth={(l) => (isActiveLink(l) ? 2.4 : 1.3)}
        linkDirectionalParticleResolution={6}
        linkDirectionalParticleColor={(l) => (isActiveLink(l) ? SPACE.gold : SPACE.spark)}
        onNodeHover={(n) => {
          if (window.matchMedia("(hover: none)").matches) return;
          setHover(n ? (n.id as string) : null);
          if (wrap.current) wrap.current.style.cursor = n ? "pointer" : "grab";
        }}
        onNodeClick={(n) => {
          const id = n.id as string;
          if (selected === id) {
            onNodeClick?.(id);
            return;
          }
          go(id, selected);
        }}
        // Clicar no vazio sai do foco, mas mantém a câmera onde está (para continuar explorando dali).
        onBackgroundClick={() => {
          setSelected(null);
          setTrail([]);
        }}
      />
      {selectedNode && (
        <div className="absolute inset-x-3 bottom-3 mx-auto max-w-lg rounded-2xl border border-white/10 bg-[#070d2a]/80 p-3 text-sm text-white shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: SPACE.gold, boxShadow: `0 0 10px ${SPACE.gold}` }} />
            <span className="min-w-0 flex-1 truncate font-medium">{selectedNode.title}</span>
            <button onClick={() => onNodeClick?.(selectedNode.id as string)} className="shrink-0 rounded-full bg-[#ffc46b] px-3 py-1 text-xs font-semibold text-[#1a1203] hover:brightness-110">
              Abrir
            </button>
          </div>
          {neighbors.length > 0 ? (
            <>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-white/50">Ligada a {neighbors.length} · toque para ir até lá</p>
              <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                {neighbors.slice(0, 20).map((n) => (
                  <button
                    key={n.id as string}
                    onClick={() => go(n.id as string, selected)}
                    onMouseEnter={() => setHover(n.id as string)}
                    onMouseLeave={() => setHover(null)}
                    className="flex max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs hover:border-[#4f9dff] hover:bg-[#4f9dff]/15"
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: colors[n.type] ?? colors.label }} />
                    <span className="truncate">{n.title}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-white/50">Esta nota ainda não tem ligações.</p>
          )}
          <div className="mt-2 flex items-center gap-1 text-xs">
            <button onClick={back} disabled={!trail.length} className="rounded-full px-2.5 py-1 text-white/80 hover:bg-white/10 disabled:opacity-30">
              ← Voltar
            </button>
            <button onClick={overview} className="rounded-full px-2.5 py-1 text-white/80 hover:bg-white/10">
              Visão geral
            </button>
            <span className="ml-auto hidden text-white/40 sm:inline">arraste para girar em volta · Esc sai</span>
          </div>
        </div>
      )}
    </div>
  );
}
