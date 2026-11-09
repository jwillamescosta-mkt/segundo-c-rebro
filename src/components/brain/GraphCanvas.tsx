import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-2d";
import { useReducedMotion } from "motion/react";
import { cssVar } from "./type-meta";

function easeOutBack(x: number) {
  const c = 1.70158;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}

export interface GNode {
  id: string;
  title: string;
  type: string;
  degree: number;
}
export interface GLink {
  source: string;
  target: string;
  suggested: boolean;
}

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
  compact?: boolean;
}

type Colors = Record<string, string> & { bg: string; link: string; sugg: string; label: string; primary: string };
const NO_COLORS: Colors = { bg: "", link: "", sugg: "", label: "", primary: "" };

function endId(x: unknown) {
  return typeof x === "object" && x ? (x as N).id : (x as string);
}

export default function GraphCanvas({ nodes, links, onNodeClick, highlight, focusId, repulsion = 180, distance = 60, compact }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const [size, setSize] = useState({ w: 300, h: 300 });
  const [hover, setHover] = useState<string | null>(null);
  const [colors, setColors] = useState<Colors>(NO_COLORS);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const read = () => {
      const c: Colors = { ...NO_COLORS };
      for (const t of ["ideia", "tarefa", "cliente", "projeto", "conteudo", "pessoa", "referencia", "diario", "aprendizado"])
        c[t] = cssVar(`--type-${t}`);
      c.bg = cssVar("--graph-bg");
      c.link = cssVar("--graph-link");
      c.sugg = cssVar("--graph-link-suggested");
      c.label = cssVar("--graph-label");
      c.primary = cssVar("--primary");
      setColors(c);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // stable graph data object (keeps positions across renders)
  const data = useMemo(() => ({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) }), [nodes, links]);

  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    }
    return m;
  }, [links]);

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    const charge = g.d3Force("charge") as unknown as { strength: (v: number) => void } | undefined;
    charge?.strength(-repulsion);
    const link = g.d3Force("link") as unknown as { distance: (v: number) => void } | undefined;
    link?.distance(distance);
    g.d3ReheatSimulation();
  }, [repulsion, distance, data]);

  const active = hover ?? focusId ?? null;
  const activeSet = active ? new Set([active, ...(adj.get(active) ?? [])]) : null;
  const isActiveLink = (l: L) => !!active && (endId(l.source) === active || endId(l.target) === active);

  // Animação: nascimento dos nós, transição suave do foco e ondas no nó ativo.
  const reduced = useReducedMotion();
  const bornAt = useRef(new Map<string, number>());
  const focusAt = useRef(0);
  useEffect(() => {
    focusAt.current = performance.now();
  }, [active]);
  const fitted = useRef(false);
  useEffect(() => {
    fitted.current = false;
  }, [data]);
  const glow = !reduced && nodes.length < 400; // shadowBlur custa caro em grafos grandes
  // Grafos grandes: sem pulsos em repouso e sem redesenho contínuo, só quando há uma nota em foco.
  const big = nodes.length > 1500;
  const calm = !!reduced || (big && !active);

  return (
    <div ref={wrap} className="h-full w-full">
      <ForceGraph2D<GNode, GLink>
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor={colors.bg}
        cooldownTicks={compact ? 120 : 300}
        cooldownTime={big ? 6000 : 15000}
        autoPauseRedraw={calm}
        onEngineStop={() => {
          if (fitted.current || !fg.current) return;
          fitted.current = true;
          fg.current.zoomToFit(reduced ? 0 : 900, compact ? 20 : 60);
        }}
        nodeRelSize={4}
        nodeVal={(n) => 1 + Math.sqrt(n.degree) * 1.6}
        linkColor={(l) => {
          const s = endId(l.source);
          const t = endId(l.target);
          const on = activeSet ? activeSet.has(s) && activeSet.has(t) && (s === active || t === active) : true;
          if (!on) return "transparent";
          if (active) return colors.primary;
          return l.suggested ? colors.sugg : colors.link;
        }}
        linkLineDash={(l) => (l.suggested ? [3, 3] : null)}
        linkWidth={(l) => (isActiveLink(l) ? 1.8 : 0.8)}
        linkCurvature={0.12}
        // "Sinapses": pulsos que viajam pelas ligações; mais rápidos e intensos no nó em foco.
        linkDirectionalParticles={(l) => (reduced ? 0 : isActiveLink(l) ? 4 : activeSet || l.suggested || big ? 0 : 1)}
        linkDirectionalParticleSpeed={(l) => (isActiveLink(l) ? 0.014 : 0.004)}
        linkDirectionalParticleWidth={(l) => (isActiveLink(l) ? 3 : 1.6)}
        linkDirectionalParticleColor={() => colors.primary}
        onNodeHover={(n) => {
          setHover(n ? (n.id as string) : null);
          if (wrap.current) wrap.current.style.cursor = n ? "pointer" : "default";
        }}
        onNodeClick={(n) => onNodeClick?.(n.id as string)}
        nodeCanvasObject={(n, ctx, scale) => {
          const now = performance.now();
          const id = n.id as string;
          if (!bornAt.current.has(id)) bornAt.current.set(id, now + Math.random() * 400);
          const grow = reduced ? 1 : easeOutBack(Math.min(1, Math.max(0, (now - bornAt.current.get(id)!) / 700)));
          if (grow <= 0) return;
          const base = 3 + Math.sqrt(n.degree) * 1.9;
          const isActive = id === active;
          const neighbor = !!activeSet?.has(id) && !isActive;
          const breathe = !reduced && (isActive || neighbor) ? 1 + 0.08 * Math.sin(now / 260 + id.length) : 1;
          const r = base * grow * breathe;
          const color = colors[n.type] ?? colors.label;
          const fade = reduced ? 1 : Math.min(1, (now - focusAt.current) / 280);
          const dim = (activeSet && !activeSet.has(id)) || (highlight && !highlight.has(id));
          ctx.globalAlpha = dim ? 1 - 0.85 * fade : 1;

          // Ondas saindo do nó em foco
          if (isActive && !reduced) {
            for (let k = 0; k < 2; k++) {
              const p = ((now / 1400 + k / 2) % 1 + 1) % 1;
              ctx.beginPath();
              ctx.arc(n.x!, n.y!, r + p * 18, 0, 2 * Math.PI);
              ctx.strokeStyle = colors.primary;
              ctx.globalAlpha = (1 - p) * 0.5;
              ctx.lineWidth = 1.2 / scale;
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
          }

          ctx.save();
          if (glow && !dim) {
            ctx.shadowColor = color;
            ctx.shadowBlur = isActive ? 24 : neighbor ? 14 : 6;
          }
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.restore();
          if (id === focusId || id === hover || (highlight && highlight.has(id))) {
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeStyle = colors.primary;
            ctx.stroke();
          }
          const showLabel = scale > (compact ? 1.2 : 1.6) || id === hover || id === focusId || (activeSet?.has(id) ?? false);
          if (showLabel && !dim) {
            const fs = Math.max(11 / scale, 2);
            ctx.font = `${fs}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = colors.label;
            const label = n.title.length > 40 ? n.title.slice(0, 38) + "…" : n.title;
            ctx.fillText(label, n.x!, n.y! + r + 2 / scale);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(n, color, ctx) => {
          const r = 4 + Math.sqrt(n.degree) * 1.9;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
    </div>
  );
}
