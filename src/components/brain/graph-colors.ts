import { useEffect, useState } from "react";
import { cssVar } from "./type-meta";

export type GraphColors = Record<string, string> & { bg: string; link: string; sugg: string; label: string; primary: string };
export const NO_COLORS: GraphColors = { bg: "", link: "", sugg: "", label: "", primary: "" };
const TYPES = ["ideia", "tarefa", "cliente", "projeto", "conteudo", "pessoa", "referencia", "diario", "aprendizado"];

let probe: CanvasRenderingContext2D | null = null;
/** Converte qualquer cor CSS (inclusive oklch) para rgb/rgba, deixando o próprio navegador fazer a conta. O 3D (three.js) não entende oklch. */
export function toRgb(color: string) {
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe || !color) return color || "#888888";
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#888888";
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return a !== undefined && a < 255 ? `rgba(${r},${g},${b},${(a / 255).toFixed(2)})` : `rgb(${r},${g},${b})`;
}

/** Cores do grafo vindas do tema, atualizadas quando o tema claro/escuro muda. `rgb` = convertidas para o 3D. */
export function useGraphColors(rgb = false) {
  const [colors, setColors] = useState<GraphColors>(NO_COLORS);
  useEffect(() => {
    const read = () => {
      const conv = (v: string) => (rgb ? toRgb(v) : v);
      const c: GraphColors = { ...NO_COLORS };
      for (const t of TYPES) c[t] = conv(cssVar(`--type-${t}`));
      c.bg = conv(cssVar("--graph-bg"));
      c.link = conv(cssVar("--graph-link"));
      c.sugg = conv(cssVar("--graph-link-suggested"));
      c.label = conv(cssVar("--graph-label"));
      c.primary = conv(cssVar("--primary"));
      setColors(c);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [rgb]);
  return colors;
}
