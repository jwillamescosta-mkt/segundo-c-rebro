import { lazy, Suspense, useEffect, useState, type ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import type GraphCanvasT from "./GraphCanvas";

// O grafo só existe no navegador. No build do servidor (SSR) estas importações somem: as bibliotecas de grafo
// acessam `window` ao carregar e, empacotadas junto com código compartilhado (ex.: motion), derrubavam o servidor
// inteiro com "window is not defined" (todas as rotas davam 500, inclusive /api/capturar).
const NoGraph = { default: () => null };
const GraphCanvas = lazy(() => (import.meta.env.SSR ? Promise.resolve(NoGraph as never) : import("./GraphCanvas")));
// O 3D (three.js) só é baixado quando alguém abre o grafo em 3D.
const GraphCanvas3D = lazy(() => (import.meta.env.SSR ? Promise.resolve(NoGraph as never) : import("./GraphCanvas3D")));

let webgl: boolean | undefined;
/** O aparelho consegue desenhar em 3D (WebGL)? Testa uma vez só: cada teste abre um contexto, e o Safari tem limite. */
export function canUse3D() {
  if (webgl !== undefined) return webgl;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // devolve o contexto de teste na hora
    webgl = !!gl;
  } catch {
    webgl = false;
  }
  return webgl;
}

const OPEN_3D_KEY = "sc-grafo-3d-aberto";/** Marca que o grafo 3D está na tela. Se a página morrer por falta de memória, a marca sobra. */
export function mark3D(on: boolean) {
  if (on) crashed = false; // o 3D voltou à tela por escolha do usuário: esquece a queda
  try {
    if (on) sessionStorage.setItem(OPEN_3D_KEY, "1");
    else sessionStorage.removeItem(OPEN_3D_KEY);
  } catch {
    /* sem armazenamento */
  }
}
let crashed: boolean | undefined;
/**
 * A página caiu com o 3D aberto da última vez? Lê e apaga a marca uma vez por carregamento; a resposta fica
 * guardada no módulo porque a página do grafo monta mais de uma vez na abertura.
 */
export function crashed3D() {
  if (crashed !== undefined) return crashed;
  try {
    crashed = sessionStorage.getItem(OPEN_3D_KEY) === "1";
    sessionStorage.removeItem(OPEN_3D_KEY);
  } catch {
    crashed = false;
  }
  return crashed;
}

export function LazyGraph({
  dimension = "2d",
  onContextLost,
  ...props
}: ComponentProps<typeof GraphCanvasT> & { dimension?: "2d" | "3d"; onContextLost?: () => void }) {
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
      {dimension === "3d" && canUse3D() ? <GraphCanvas3D {...props} onContextLost={onContextLost} /> : <GraphCanvas {...props} />}
    </Suspense>
  );
}
