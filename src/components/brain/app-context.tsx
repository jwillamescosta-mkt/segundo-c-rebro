import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { eventsQuery, linksQuery, notesQuery, tasksQuery, type Link, type Note } from "@/lib/brain";
import { processNote } from "@/lib/process.functions";

interface Ctx {
  tabs: string[];
  closeTab: (id: string) => void;
  captureOpen: boolean;
  setCaptureOpen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  runProcess: (noteId: string, mode?: "full" | "reanalyze") => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
}

export function useBrain() {
  const notes = useQuery(notesQuery);
  const links = useQuery(linksQuery);
  const tasks = useQuery(tasksQuery);
  const events = useQuery(eventsQuery);
  const byId = useMemo(() => new Map((notes.data ?? []).map((n) => [n.id, n])), [notes.data]);
  return {
    notes: notes.data ?? [],
    links: links.data ?? [],
    tasks: tasks.data ?? [],
    events: events.data ?? [],
    byId,
    loading: notes.isLoading || links.isLoading,
    error: notes.error ?? links.error,
  };
}

/** Accepted (non-rejected) neighbors helper. */
export function neighborsOf(id: string, links: Link[], includeSuggested = false) {
  const s = new Set<string>();
  for (const l of links) {
    if (l.status === "rejeitada") continue;
    if (l.status === "sugerida" && !includeSuggested) continue;
    if (l.source_note_id === id) s.add(l.target_note_id);
    if (l.target_note_id === id) s.add(l.source_note_id);
  }
  return s;
}

export function orphanNotes(notes: Note[], links: Link[]) {
  const linked = new Set<string>();
  for (const l of links) {
    if (l.status !== "aceita") continue;
    linked.add(l.source_note_id);
    linked.add(l.target_note_id);
  }
  return notes.filter((n) => !linked.has(n.id) && n.type !== "diario");
}

const TAB_KEY = "sc-tabs";

export function AppProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const loc = useLocation();
  const navigate = useNavigate();
  const process = useServerFn(processNote);
  const [tabs, setTabs] = useState<string[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      setTabs(JSON.parse(localStorage.getItem(TAB_KEY) ?? "[]"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const m = loc.pathname.match(/^\/nota\/([^/]+)/);
    const key = m ? m[1] : loc.pathname === "/grafo" ? "grafo" : null;
    if (!key) return;
    setTabs((t) => {
      if (t.includes(key)) return t;
      const next = [...t, key].slice(-12);
      localStorage.setItem(TAB_KEY, JSON.stringify(next));
      return next;
    });
  }, [loc.pathname]);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((t) => {
        const idx = t.indexOf(id);
        const next = t.filter((x) => x !== id);
        localStorage.setItem(TAB_KEY, JSON.stringify(next));
        const activeKey = loc.pathname === "/grafo" ? "grafo" : loc.pathname.split("/")[2];
        if (activeKey === id) {
          const n = next[Math.max(0, idx - 1)];
          if (!n) navigate({ to: "/inicio" });
          else if (n === "grafo") navigate({ to: "/grafo" });
          else navigate({ to: "/nota/$id", params: { id: n } });
        }
        return next;
      });
    },
    [loc.pathname, navigate],
  );

  // Realtime: keep everything fresh (processing progress, new links, tasks)
  useEffect(() => {
    const ch = supabase
      .channel(`brain-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, (p) => {
        if (p.eventType === "UPDATE") {
          const row = p.new as Note;
          qc.setQueryData<Note[]>(["notes"], (old) => old?.map((n) => (n.id === row.id ? { ...n, ...row } : n)));
        } else qc.invalidateQueries({ queryKey: ["notes"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "links" }, () =>
        qc.invalidateQueries({ queryKey: ["links"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () =>
        qc.invalidateQueries({ queryKey: ["tasks"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () =>
        qc.invalidateQueries({ queryKey: ["events"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Ctrl/Cmd+K
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const runProcess = useCallback(
    async (noteId: string, mode: "full" | "reanalyze" = "full") => {
      qc.setQueryData<Note[]>(["notes"], (old) =>
        old?.map((n) => (n.id === noteId ? { ...n, status: "processando", progress: "Na fila…" } : n)),
      );
      try {
        const r = await process({ data: { noteId, mode } });
        if (!r.ok) toast.error(r.error);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao processar a nota.");
      } finally {
        qc.invalidateQueries({ queryKey: ["notes"] });
        qc.invalidateQueries({ queryKey: ["links"] });
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["events"] });
      }
    },
    [process, qc],
  );

  return (
    <AppCtx.Provider value={{ tabs, closeTab, captureOpen, setCaptureOpen, paletteOpen, setPaletteOpen, runProcess }}>
      {children}
    </AppCtx.Provider>
  );
}
