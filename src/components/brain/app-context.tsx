import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { needsProcessing } from "@/lib/capture-utils";
import { smartPassFn } from "@/lib/smart.functions";
import { DEFAULT_THRESHOLD, isSmartPending, readThreshold, shouldAutoRun, writeThreshold } from "@/lib/smart-utils";
import { saveCapture } from "@/lib/capture-client";
import { enqueue, flushQueue, queuedFile, recClear, recRecover } from "@/lib/offline-queue";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { eventsQuery, invalidateBrain, linksQuery, notesQuery, tasksQuery, type Link, type Note, type NoteMeta } from "@/lib/brain";
import { ensureProfileNote, ensureRulesNote } from "@/lib/rules-note";
import { processNote } from "@/lib/process.functions";

interface Ctx {
  tabs: string[];
  closeTab: (id: string) => void;
  captureOpen: boolean;
  setCaptureOpen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  runProcess: (noteId: string, mode?: "full" | "reanalyze") => Promise<void>;
  /** Notas aguardando a passada inteligente em lote (separar, reconhecer pessoas/projetos e conectar). */
  pendingSmart: number;
  smartBusy: boolean;
  runSmart: (noteIds?: string[]) => Promise<void>;
  /** Tenta enviar agora as capturas guardadas no aparelho. */
  flushOutbox: () => Promise<{ sent: number; left: number }>;
  threshold: number;
  setThreshold: (n: number) => void;
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

export function orphanNotes<T extends Pick<Note, "id" | "type">>(notes: T[], links: Link[]) {
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
          const row = p.new as Note & { search_vector?: unknown; user_id?: string };
          const { content, search_vector: _sv, user_id: _u, ...meta } = row;
          qc.setQueryData<NoteMeta[]>(["notes"], (old) => old?.map((n) => (n.id === row.id ? { ...n, ...meta } : n)));
          qc.setQueryData<Note | null>(["note", row.id], (old) => (old ? { ...old, ...meta, content: content ?? old.content } : old));
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

  // Garante a nota fixada "Regras do meu cérebro" (idempotente) e atualiza a lista se ela foi criada.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const uid = data.user.id;
      Promise.all([ensureRulesNote(supabase, uid), ensureProfileNote(supabase, uid)]).then((made) => made.some(Boolean) && invalidateBrain(qc));
    });
  }, [qc]);

  // Notas paradas em "processando" (chegaram pelo Atalho, ficaram na fila ou o app fechou no meio):
  // a IA retoma aqui, com o login do usuário, uma por vez. Cada nota é retomada uma vez por sessão.
  const [clock, setClock] = useState(0); // reavalia a cada minuto: uma nota pode "envelhecer" sem mudar
  useEffect(() => {
    const t = setInterval(() => setClock((c) => c + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const pending = useQuery(notesQuery).data?.filter((n) => needsProcessing(n));
  const pendingKey = pending?.map((n) => n.id).join(",") ?? "";
  const started = useRef(new Set<string>());
  useEffect(() => {
    const ids = pendingKey ? pendingKey.split(",").filter((id) => !started.current.has(id)) : [];
    if (!ids.length) return;
    ids.forEach((id) => started.current.add(id));
    void (async () => {
      for (const id of ids) await runProcessRef.current(id, "full");
    })();
  }, [pendingKey, clock]);

  // Caixa de saída: envia o que está guardado no aparelho ao abrir, ao voltar a conexão, ao voltar para o app
  // e a cada 30 s enquanto houver algo. Só sai da caixa o que o servidor confirmou.
  const flushOutbox = useCallback(async () => {
    const r = await flushQueue(async (item) => {
      const n = await saveCapture(item.text, queuedFile(item), item.id);
      started.current.add(n.id);
      qc.setQueryData<NoteMeta[]>(["notes"], (old) => [n, ...(old ?? []).filter((x) => x.id !== n.id)]);
      if (n.status === "processando") void runProcessRef.current(n.id, "full");
    });
    if (r.sent) toast.success(r.sent === 1 ? "Captura salva no seu cérebro. A IA está organizando." : `${r.sent} capturas salvas no seu cérebro.`);
    return r;
  }, [qc]);
  useEffect(() => {
    // Gravação interrompida (o app fechou enquanto gravava): o que foi gravado entra na caixa de saída.
    void recRecover()
      .then(async (file) => {
        if (!file) return;
        await enqueue("", file);
        await recClear();
        toast.success("Recuperei uma gravação que tinha sido interrompida.");
      })
      .catch(() => {})
      .finally(() => void flushOutbox());
    const onVisible = () => document.visibilityState === "visible" && void flushOutbox();
    const kick = () => void flushOutbox();
    const offline = () => toast.info("Sem internet. O que você capturar fica guardado neste aparelho.", { id: "sem-internet" });
    window.addEventListener("online", kick);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(kick, 30_000);
    return () => {
      window.removeEventListener("online", kick);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, [flushOutbox]);

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
      qc.setQueryData<NoteMeta[]>(["notes"], (old) =>
        old?.map((n) => (n.id === noteId ? { ...n, status: "processando", progress: "Na fila…" } : n)),
      );
      try {
        const r = await process({ data: { noteId, mode } });
        if (!r.ok) toast.error(r.error);
        // Reanalisar é um pedido explícito: faz a conexão inteligente desta nota agora, sem esperar o lote.
        else if (mode === "reanalyze") await runSmartRef.current([noteId]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao processar a nota.");
      } finally {
        qc.invalidateQueries({ queryKey: ["notes"] });
        qc.invalidateQueries({ queryKey: ["links"] });
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["events"] });
        qc.invalidateQueries({ queryKey: ["note", noteId] });
      }
    },
    [process, qc],
  );
  const runProcessRef = useRef(runProcess);
  runProcessRef.current = runProcess;

  // Passada inteligente em lote: roda sozinha a cada N notas (ou só manual) e quando o usuário pede.
  const smartFn = useServerFn(smartPassFn);
  const allNotes = useQuery(notesQuery).data;
  const pendingSmart = allNotes?.filter(isSmartPending).length ?? 0;
  const busyNow = allNotes?.some((n) => n.status === "processando") ?? false;
  const [threshold, setThresholdState] = useState(DEFAULT_THRESHOLD);
  const [smartBusy, setSmartBusy] = useState(false);
  const smartRunning = useRef(false);
  const blockedAt = useRef<number | null>(null); // após uma falha, só tenta sozinho de novo quando entrar mais nota na fila
  useEffect(() => setThresholdState(readThreshold()), []);
  const setThreshold = useCallback((n: number) => {
    setThresholdState(n);
    writeThreshold(n);
  }, []);

  const runSmart = useCallback(
    async (noteIds?: string[]) => {
      if (smartRunning.current) return;
      smartRunning.current = true;
      setSmartBusy(true);
      try {
        const r = await smartFn({ data: noteIds ? { noteIds } : {} });
        if (!r.ok) {
          blockedAt.current = pendingRef.current;
          toast.error(r.error);
        } else if (r.processed) {
          blockedAt.current = null;
          toast.success(`Conexão inteligente: ${r.processed} nota${r.processed > 1 ? "s" : ""}, ${r.links} ligaç${r.links === 1 ? "ão" : "ões"}${r.points ? ` e ${r.points} ponto${r.points > 1 ? "s" : ""} novo${r.points > 1 ? "s" : ""}` : ""}.`);
        }
      } catch (e) {
        blockedAt.current = pendingRef.current;
        toast.error(e instanceof Error ? e.message : "Falha na conexão inteligente.");
      } finally {
        smartRunning.current = false;
        setSmartBusy(false);
        invalidateBrain(qc);
      }
    },
    [smartFn, qc],
  );
  const pendingRef = useRef(0);
  pendingRef.current = pendingSmart;
  const runSmartRef = useRef(runSmart);
  runSmartRef.current = runSmart;

  useEffect(() => {
    if (!shouldAutoRun(pendingSmart, threshold) || busyNow || smartRunning.current) return;
    if (blockedAt.current !== null && pendingSmart <= blockedAt.current) return;
    void runSmart();
  }, [pendingSmart, threshold, busyNow, runSmart]);

  return (
    <AppCtx.Provider value={{ tabs, closeTab, captureOpen, setCaptureOpen, paletteOpen, setPaletteOpen, runProcess, pendingSmart, smartBusy, runSmart, threshold, setThreshold, flushOutbox }}>
      {children}
    </AppCtx.Provider>
  );
}
