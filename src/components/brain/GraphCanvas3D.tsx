import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-3d";
import { AdditiveBlending, CanvasTexture, FogExp2, Sprite, SpriteMaterial } from "three";
import { useReducedMotion } from "motion/react";
import type { GLink, GNode } from "./GraphCanvas";
import { isDarkColor, useGraphColors } from "./graph-colors";

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

let glowTex: CanvasTexture | null = null;
/** Textura do halo: um ponto de luz suave, criado uma vez e reaproveitado por todas as notas. */
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  glowTex = new CanvasTexture(c);
  return glowTex;
}

type HaloNode = N & { __threeObj?: { children: Sprite[] } };
/** Mesmo cálculo de raio da biblioteca (cbrt do valor × nodeRelSize), para o halo acompanhar a esfera. */
const radius = (n: GNode) => Math.cbrt(1 + Math.sqrt(n.degree) * 1.8) * 4;

/**
 * Grafo 3D (WebGL): esferas com halo de luz (brilho aditivo, sem pós-processamento: cor exata do tema e leve no celular),
 * neblina para dar profundidade,
 * pulsos nas ligações da nota em foco e rotação lenta quando ninguém mexe.
 * Desempenho: resolução de pixels limitada a 2x (o iPhone tem 3x), esferas mais simples e sem
 * pulsos em repouso em grafos grandes, e o próprio navegador pausa tudo com a aba escondida.
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
  const glowStrength = useRef(0.9);
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
  haloOpacity.current = (id: string) => (dim(id) ? 0.03 : id === active ? 1 : glowStrength.current);

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

  // Tema: brilho forte no escuro e suave no claro; neblina na cor do fundo.
  useEffect(() => {
    const g = fg.current;
    if (!g || !colors.bg) return;
    const dark = isDarkColor(colors.bg);
    glowStrength.current = dark ? 0.9 : 0.35;
    g.scene().fog = new FogExp2(colors.bg, fogDensity.current);
  }, [colors.bg]);

  // Halo de cada nota: criado uma vez (função estável, para a biblioteca não recriar a cena a cada render).
  const nodeHalo = useCallback(
    (n: N) => {
      const mat = new SpriteMaterial({ map: glowTexture(), color: colors[n.type] ?? colors.label, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: haloOpacity.current(n.id as string) });
      const s = new Sprite(mat);
      const base = radius(n) * 5;
      s.scale.set(base, base, 1);
      s.userData["base"] = base;
      return s;
    },
    [colors],
  );

  // Foco: acende o halo da nota ativa e dos vizinhos e apaga o resto, sem recriar a cena.
  const applyHalos = useRef(() => {});
  applyHalos.current = () => {
    for (const n of data.nodes as HaloNode[]) {
      const halo = n.__threeObj?.children[0];
      if (!halo) continue;
      const id = n.id as string;
      (halo.material as SpriteMaterial).opacity = haloOpacity.current(id);
      const base = halo.userData["base"] as number;
      halo.scale.set(base, base, 1);
    }
  };
  useEffect(() => applyHalos.current(), [active, highlight, data, colors]);

  // A nota ativa "respira" (só ela, barato). Procura o halo a cada quadro: pode ter acabado de nascer.
  useEffect(() => {
    if (!active || reduced) return;
    const node = (data.nodes as HaloNode[]).find((n) => n.id === active);
    let raf = 0;
    const tick = (t: number) => {
      const halo = node?.__threeObj?.children[0];
      if (halo) {
        const k = (halo.userData["base"] as number) * 1.5 * (1 + 0.12 * Math.sin(t / 280));
        halo.scale.set(k, k, 1);
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
  useEffect(() => {
    fitted.current = false;
  }, [data]);

  const flyTo = (n: N) => {
    const g = fg.current;
    if (!g || n.x === undefined) return;
    const d = 120;
    const ratio = 1 + d / Math.max(1, Math.hypot(n.x, n.y ?? 0, n.z ?? 0));
    g.cameraPosition({ x: n.x * ratio, y: (n.y ?? 0) * ratio, z: (n.z ?? 0) * ratio }, { x: n.x, y: n.y ?? 0, z: n.z ?? 0 }, reduced ? 0 : 1200);
  };

  const selectedTitle = selected ? nodes.find((n) => n.id === selected)?.title : null;

  return (
    <div ref={wrap} className="relative h-full w-full">
      <ForceGraph3D<GNode, GLink>
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor={colors.bg || "#1e1e1e"}
        showNavInfo={false}
        controlType="orbit"
        cooldownTicks={big ? 120 : 250}
        cooldownTime={big ? 6000 : 12000}
        onEngineStop={() => {
          applyHalos.current();
          if (fitted.current || !fg.current) return;
          fitted.current = true;
          fg.current.zoomToFit(reduced ? 0 : 1200, 60);
          // Neblina proporcional à distância da câmera: o fundo do grafo esmaece um pouco, a frente fica nítida.
          setTimeout(() => {
            const g = fg.current;
            const fog = g?.scene().fog as FogExp2 | null | undefined;
            if (!g || !fog) return;
            fogDensity.current = 0.4 / Math.max(200, g.camera().position.length());
            fog.density = fogDensity.current;
          }, reduced ? 0 : 1300);
        }}
        nodeRelSize={4}
        nodeResolution={big ? 8 : 18}
        nodeVal={(n) => 1 + Math.sqrt(n.degree) * 1.8}
        nodeColor={(n) => {
          const id = n.id as string;
          if (dim(id)) return "rgba(120,120,130,0.18)";
          return id === active ? colors.primary : (colors[n.type] ?? colors.label);
        }}
        nodeOpacity={0.95}
        nodeThreeObject={nodeHalo}
        nodeThreeObjectExtend
        nodeLabel={(n) => n.title}
        linkColor={(l) => (isActiveLink(l) ? colors.primary : l.suggested ? colors.sugg : colors.link)}
        linkOpacity={active ? 0.55 : 0.3}
        linkWidth={(l) => (isActiveLink(l) ? 1.4 : 0)}
        linkVisibility={(l) => !activeSet || (activeSet.has(endId(l.source)) && activeSet.has(endId(l.target)))}
        linkDirectionalParticles={(l) => (reduced ? 0 : isActiveLink(l) ? 4 : !active && !big && nodes.length < 400 && !l.suggested ? 1 : 0)}
        linkDirectionalParticleSpeed={(l) => (isActiveLink(l) ? 0.012 : 0.004)}
        linkDirectionalParticleWidth={(l) => (isActiveLink(l) ? 2.2 : 1.2)}
        linkDirectionalParticleColor={() => colors.primary}
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
