import { lazy, Suspense, useEffect, useState, type ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import type GraphCanvasT from "./GraphCanvas";

const GraphCanvas = lazy(() => import("./GraphCanvas"));
// O 3D (three.js) só é baixado quando alguém abre o grafo em 3D.
const GraphCanvas3D = lazy(() => import("./GraphCanvas3D"));

/** O aparelho consegue desenhar em 3D (WebGL)? */
export function canUse3D() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function LazyGraph({ dimension = "2d", ...props }: ComponentProps<typeof GraphCanvasT> & { dimension?: "2d" | "3d" }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fallback = (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
  if (!mounted) return fallback;
  return (
    <Suspense fallback={fallback}>
      {dimension === "3d" && canUse3D() ? <GraphCanvas3D {...props} /> : <GraphCanvas {...props} />}
    </Suspense>
  );
}
