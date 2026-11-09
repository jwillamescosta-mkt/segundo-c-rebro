import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Mic, Network, NotebookText, ListTodo, Plus, X, Loader2 } from "lucide-react";
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

function MobileNav() {
  const items = [
    { to: "/inicio" as const, label: "Capturar", icon: Mic },
    { to: "/notas" as const, label: "Notas", icon: NotebookText },
    { to: "/grafo" as const, label: "Grafo", icon: Network },
    { to: "/tarefas" as const, label: "Tarefas", icon: ListTodo },
  ];
  return (
    <nav className="grid shrink-0 grid-cols-4 border-t bg-panel pb-[env(safe-area-inset-bottom)]">
      {items.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
          activeProps={{ className: "text-primary" }}
        >
          <i.icon className="size-5" strokeWidth={1.75} />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { setCaptureOpen } = useApp();

  const fab = (
    <button
      onClick={() => setCaptureOpen(true)}
      className={cn(
        "fixed z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90",
        isMobile ? "bottom-20 right-4" : "bottom-6 right-6",
      )}
      aria-label="Nova captura"
      title="Nova captura"
    >
      <Plus className="size-5" />
    </button>
  );

  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        <MobileNav />
        {fab}
        <CaptureDialog />
        <CommandPalette />
      </div>
    );
  }

  return (
    <div className="h-screen bg-background">
      <ResizablePanelGroup orientation="horizontal" id="sc-layout">
        <ResizablePanel id="left" defaultSize="18" minSize="200px" maxSize="35">
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="center" defaultSize="60" minSize="30">
          <div className="flex h-full flex-col">
            <TabsBar />
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
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
