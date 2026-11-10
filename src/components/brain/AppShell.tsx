import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { BrainCircuit, CalendarDays, Home, Network, NotebookText, Plus, X, Loader2 } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { EASE } from "./motion";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useApp, useBrain } from "./app-context";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import { CommandPalette } from "./CommandPalette";
import { CaptureBox } from "./CaptureBox";
import { TypeIcon } from "./type-meta";

function TabsBar() {
  const { tabs, closeTab } = useApp();
  const { byId } = useBrain();
  const loc = useLocation();
  if (!tabs.length) return null;
  return (
    <div className="flex h-9 shrink-0 items-end gap-px overflow-x-auto border-b bg-panel px-1">
      {tabs.map((id) => {
        const isGraph = id === "grafo";
        const n = isGraph ? null : byId.get(id);
        if (!isGraph && !n) return null;
        const active = isGraph ? loc.pathname === "/grafo" : loc.pathname === `/nota/${id}`;
        return (
          <div
            key={id}
            className={cn(
              "group flex h-8 max-w-48 shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 border-transparent px-2.5 text-xs text-muted-foreground",
              active && "border-border bg-background text-foreground",
            )}
          >
            {isGraph ? (
              <Link to="/grafo" className="flex items-center gap-1.5">
                <Network className="size-3.5" /> Grafo
              </Link>
            ) : (
              <Link to="/nota/$id" params={{ id }} className="flex min-w-0 items-center gap-1.5">
                {n!.status === "processando" ? <Loader2 className="size-3 animate-spin text-primary" /> : <TypeIcon type={n!.type} />}
                <span className="truncate">{n!.title}</span>
              </Link>
            )}
            <button onClick={() => closeTab(id)} className="rounded p-0.5 opacity-60 hover:bg-secondary hover:opacity-100" aria-label="Fechar aba">
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CaptureDialog() {
  const { captureOpen, setCaptureOpen } = useApp();
  return (
    <Dialog open={captureOpen} onOpenChange={setCaptureOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova captura</DialogTitle>
        </DialogHeader>
        <CaptureBox variant="dialog" autoFocus onDone={() => setCaptureOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

const NAV_LEFT = [
  { to: "/inicio" as const, label: "Início", icon: Home },
  { to: "/notas" as const, label: "Notas", icon: NotebookText },
  { to: "/grafo" as const, label: "Grafo", icon: Network },
];
const NAV_RIGHT = [
  { to: "/perguntar" as const, label: "Perguntar", icon: BrainCircuit },
  { to: "/agenda" as const, label: "Agenda", icon: CalendarDays },
];

/** Dock flutuante: vidro fosco, pílula que desliza até a aba ativa e o botão de captura no centro. */
function MobileNav() {
  const { setCaptureOpen } = useApp();
  const path = useLocation().pathname;
  const item = (i: (typeof NAV_LEFT)[number] | (typeof NAV_RIGHT)[number]) => {
    const active = path === i.to || (i.to === "/notas" && path.startsWith("/nota/"));
    return (
      <Link key={i.to} to={i.to} aria-current={active ? "page" : undefined} className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px]">
        {active && (
          <motion.span layoutId="dock-pill" className="absolute inset-x-1 inset-y-0.5 rounded-xl bg-primary/15" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
        )}
        <motion.span animate={{ y: active ? -1 : 0, scale: active ? 1.1 : 1 }} transition={{ type: "spring", stiffness: 500, damping: 25 }} className="relative">
          <i.icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} strokeWidth={active ? 2.2 : 1.75} />
        </motion.span>
        <span className={cn("relative", active ? "font-medium text-primary" : "text-muted-foreground")}>{i.label}</span>
      </Link>
    );
  };
  return (
    <nav aria-label="Navegação principal" className="shrink-0 px-3 pt-1 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="relative flex items-center rounded-2xl border bg-panel/80 px-1 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        {NAV_LEFT.map(item)}
        <div className="flex w-16 shrink-0 justify-center">
          <motion.button
            onClick={() => setCaptureOpen(true)}
            aria-label="Nova captura"
            whileTap={{ scale: 0.9 }}
            whileHover={{ rotate: 90 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            className="-mt-6 flex size-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background"
            style={{ boxShadow: "0 8px 24px -6px color-mix(in oklab, var(--primary) 70%, transparent)" }}
          >
            <Plus className="size-6" />
          </motion.button>
        </div>
        {NAV_RIGHT.map(item)}
      </div>
    </nav>
  );
}

/** Entrada suave a cada troca de página. */
function PageTransition({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return (
    <motion.div
      key={loc.pathname}
      className="h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <Shell>{children}</Shell>
    </MotionConfig>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { setCaptureOpen } = useApp();

  const fab = (
    <motion.button
      onClick={() => setCaptureOpen(true)}
      className={cn(
        "fixed z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90",
        "bottom-6 right-6",
      )}
      aria-label="Nova captura"
      title="Nova captura"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.08, rotate: 90, boxShadow: "0 0 0 8px color-mix(in oklab, var(--primary) 18%, transparent)" }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 18 }}
    >
      <Plus className="size-5" />
    </motion.button>
  );
  const page = <PageTransition>{children}</PageTransition>;

  if (isMobile) {
    return (
      <div className="aurora flex h-[100dvh] flex-col bg-background pt-[env(safe-area-inset-top)]">
        {/* Faixa atrás da barra de status/Dynamic Island: escura, para o texto branco do iOS ficar legível em qualquer tema */}
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-[#0c1124]" />
        <main className="min-h-0 flex-1 overflow-y-auto">{page}</main>
        <MobileNav />
        <CaptureDialog />
        <CommandPalette />
      </div>
    );
  }

  return (
    <div className="aurora h-screen bg-background">
      <ResizablePanelGroup orientation="horizontal" id="sc-layout">
        <ResizablePanel id="left" defaultSize="18" minSize="200px" maxSize="35">
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="center" defaultSize="60" minSize="30">
          <div className="flex h-full flex-col">
            <TabsBar />
            <main className="min-h-0 flex-1 overflow-y-auto">{page}</main>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="right" defaultSize="22" minSize="220px" maxSize="40">
          <RightPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
      {fab}
      <CaptureDialog />
      <CommandPalette />
    </div>
  );
}
