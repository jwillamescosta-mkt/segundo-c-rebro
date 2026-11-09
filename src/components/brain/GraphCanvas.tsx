import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-2d";
import { cssVar } from "./type-meta";

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

function endId(x: unknown) {
  return typeof x === "object" && x ? (x as N).id : (x as string);
}

export default function GraphCanvas({ nodes, links, onNodeClick, highlight, focusId, repulsion = 180, distance = 60, compact }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const [size, setSize] = useState({ w: 300, h: 300 });
  const [hover, setHover] = useState<string | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const read = () => {
      const c: Record<string, string> = {};
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

  return (
    <div ref={wrap} className="h-full w-full">
      <ForceGraph2D<GNode, GLink>
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor={colors.bg}
        cooldownTicks={compact ? 120 : 300}
        nodeRelSize={4}
        nodeVal={(n) => 1 + Math.sqrt(n.degree) * 1.6}
        linkColor={(l) => {
          const s = endId(l.source);
          const t = endId(l.target);
          const on = activeSet ? activeSet.has(s) && activeSet.has(t) && (s === active || t === active) : true;
          if (!on) return "transparent";
          return l.suggested ? colors.sugg : colors.link;
        }}
        linkLineDash={(l) => (l.suggested ? [3, 3] : null)}
        linkWidth={(l) => {
          const s = endId(l.source);
          const t = endId(l.target);
          return active && (s === active || t === active) ? 1.6 : 0.8;
        }}
        onNodeHover={(n) => {
          setHover(n ? (n.id as string) : null);
          if (wrap.current) wrap.current.style.cursor = n ? "pointer" : "default";
        }}
        onNodeClick={(n) => onNodeClick?.(n.id as string)}
        nodeCanvasObject={(n, ctx, scale) => {
          const r = 3 + Math.sqrt(n.degree) * 1.9;
          const id = n.id as string;
          const dim = (activeSet && !activeSet.has(id)) || (highlight && !highlight.has(id));
          ctx.globalAlpha = dim ? 0.15 : 1;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
          ctx.fillStyle = colors[n.type] ?? colors.label;
          ctx.fill();
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
