import { lazy, Suspense, useEffect, useState, type ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import type GraphCanvasT from "./GraphCanvas";

const GraphCanvas = lazy(() => import("./GraphCanvas"));

export function LazyGraph(props: ComponentProps<typeof GraphCanvasT>) {
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
      <GraphCanvas {...props} />
    </Suspense>
  );
}
