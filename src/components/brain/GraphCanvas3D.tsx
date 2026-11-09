import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-3d";
import { AdditiveBlending, Color, FogExp2, Sprite, SpriteMaterial, Vector3 } from "three";
import { useReducedMotion } from "motion/react";
import type { GLink, GNode } from "./GraphCanvas";
import { useGraphColors } from "./graph-colors";
import { LINK_MATERIALS, SPACE, createSpace, luminous, neuronTexture } from "./space-scene";

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
  const [selected, setSelected] = useState<string | null>(null);
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
      if (!reduced) idle = setTimeout(() => (controls.autoRotate = true), IDLE_MS);
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

  const flyTo = (n: N) => {
    const g = fg.current;
    if (!g || n.x === undefined) return;
    const d = 120;
    const ratio = 1 + d / Math.max(1, Math.hypot(n.x, n.y ?? 0, n.z ?? 0));
    g.cameraPosition({ x: n.x * ratio, y: (n.y ?? 0) * ratio, z: (n.z ?? 0) * ratio }, { x: n.x, y: n.y ?? 0, z: n.z ?? 0 }, reduced ? 0 : 1200);
  };

  const selectedTitle = selected ? nodes.find((n) => n.id === selected)?.title : null;

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
          setSelected(id);
          flyTo(n);
        }}
        onBackgroundClick={() => setSelected(null)}
      />
      {selectedTitle && (
        <button
          onClick={() => selected && onNodeClick?.(selected)}
          className="absolute bottom-4 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full border bg-panel/90 px-4 py-2 text-sm shadow-lg backdrop-blur hover:border-primary"
        >
          {selectedTitle} · <span className="text-primary">abrir</span>
        </button>
      )}
    </div>
  );
}
