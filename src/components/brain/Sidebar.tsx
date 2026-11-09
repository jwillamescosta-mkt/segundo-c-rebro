import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  Brain,
  BrainCircuit,
  GraduationCap,
  Target,
  CalendarDays,
  ChevronRight,
  Download,
  Hash,
  Home,
  ListTodo,
  Loader2,
  LogOut,
  Moon,
  Network,
  Pin,
  Plus,
  Search,
  Share2,
  Sun,
  AlertCircle,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { NOTE_TYPES, safeHeadline } from "@/lib/markdown-utils";
import { getOrCreateDaily, type NoteMeta as Note } from "@/lib/brain";
import { exportVault } from "@/lib/export";
import { useApp, useBrain } from "./app-context";
import { TypeIcon } from "./type-meta";

interface SearchHit {
  id: string;
  title: string;
  type: string;
  headline: string;
}

export function useFullTextSearch(q: string) {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_notes", { q: term });
      setLoading(false);
      if (error) return toast.error("Erro na busca: " + error.message);
      setHits((data ?? []) as SearchHit[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return { hits, loading };
}

export function useOpenToday() {
  const { notes } = useBrain();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async () => {
    try {
      const n = await getOrCreateDaily(notes);
      qc.invalidateQueries({ queryKey: ["notes"] });
      navigate({ to: "/nota/$id", params: { id: n.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir a nota do dia.");
    }
  };
}

export function useTheme() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.classList.contains("light")), []);
  return {
    light,
    toggle: () => {
      const next = !document.documentElement.classList.contains("light");
      document.documentElement.classList.toggle("light", next);
      localStorage.setItem("sc-theme", next ? "light" : "dark");
      setLight(next);
    },
  };
}

function NoteRow({ n, active }: { n: Note; active: boolean }) {
  return (
    <Link
      to="/nota/$id"
      params={{ id: n.id }}
      className={cn(
        "group flex items-center gap-2 rounded px-2 py-1 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground",
        active && "bg-secondary text-foreground",
      )}
    >
      {n.status === "processando" ? (
        <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
      ) : n.status === "erro" ? (
        <AlertCircle className="size-3 shrink-0 text-destructive" />
      ) : n.pinned ? (
        <Pin className="size-3 shrink-0 text-primary" />
      ) : null}
      <span className="truncate">{n.title}</span>
    </Link>
  );
}

export function Sidebar() {
  const { notes, links, tasks, events, loading } = useBrain();
  const { setCaptureOpen, setPaletteOpen } = useApp();
  const params = useParams({ strict: false }) as { id?: string };
  const openToday = useOpenToday();
  const theme = useTheme();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Com milhares de notas, cada grupo mostra um pedaço por vez.
  const [shown, setShown] = useState<Record<string, number>>({});
  const { hits, loading: searching } = useFullTextSearch(q);
  const [exporting, setExporting] = useState(false);

  const filtered = tag ? notes.filter((n) => n.tags.includes(tag)) : notes;
  const groups = useMemo(
    () =>
      NOTE_TYPES.map((t) => ({
        ...t,
        items: filtered
          .filter((n) => n.type === t.value)
          .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title, "pt-BR")),
      })).filter((g) => g.items.length),
    [filtered],
  );
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [notes]);

  const nav = [
    { to: "/inicio" as const, label: "Início", icon: Home },
    { to: "/grafo" as const, label: "Grafo", icon: Network },
    { to: "/perguntar" as const, label: "Perguntar", icon: BrainCircuit },
    { to: "/estudar" as const, label: "Estudar", icon: GraduationCap },
    { to: "/metas" as const, label: "Metas", icon: Target },
    { to: "/agenda" as const, label: "Agenda", icon: CalendarDays },
    { to: "/tarefas" as const, label: "Tarefas", icon: ListTodo },
    { to: "/compartilhadas" as const, label: "Compartilhadas", icon: Share2 },
  ];

  return (
    <aside className="flex h-full flex-col bg-panel">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Brain className="size-4 text-primary" strokeWidth={1.75} />
        <span className="text-sm font-semibold">Segundo Cérebro</span>
        <button
          onClick={() => setPaletteOpen(true)}
          className="ml-auto rounded border px-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
          title="Paleta de comandos"
        >
          Ctrl K
        </button>
      </div>

      <div className="space-y-2 p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar em tudo…"
            className="h-8 w-full rounded-md border bg-background pl-7 pr-7 text-[13px] outline-none focus:border-primary"
          />
          {q && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setQ("")} aria-label="Limpar busca">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setCaptureOpen(true)}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-3.5" /> Nova captura
          </button>
          <button
            onClick={openToday}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md border text-[13px] hover:bg-secondary"
          >
            <CalendarDays className="size-3.5" /> Hoje
          </button>
        </div>
      </div>

      <nav className="space-y-0.5 px-2 pb-2">
        {nav.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className="flex items-center gap-2 rounded px-2 py-1 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "bg-secondary text-foreground" }}
          >
            <i.icon className="size-3.5" strokeWidth={1.75} /> {i.label}
          </Link>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto border-t px-2 py-2">
        {q.trim().length >= 2 ? (
          <div className="space-y-1">
            <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              {searching ? "Buscando…" : `${hits?.length ?? 0} resultados`}
            </p>
            {hits?.map((h) => (
              <Link
                key={h.id}
                to="/nota/$id"
                params={{ id: h.id }}
                className="block rounded px-2 py-1.5 hover:bg-secondary"
              >
                <div className="flex items-center gap-1.5 text-[13px] font-medium">
                  <TypeIcon type={h.type} />
                  <span className="truncate">{h.title}</span>
                </div>
                <p
                  className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: safeHeadline(h.headline) }}
                />
              </Link>
            ))}
          </div>
        ) : loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-secondary" />
            ))}
          </div>
        ) : (
          <>
            {tag && (
              <button onClick={() => setTag(null)} className="mb-2 flex items-center gap-1 px-2 text-xs text-primary">
                <Hash className="size-3" />
                {tag} <X className="size-3" />
              </button>
            )}
            {groups.length === 0 && <p className="px-2 text-xs text-muted-foreground">Nenhuma nota ainda.</p>}
            {groups.map((g) => (
              <div key={g.value} className="mb-1">
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [g.value]: !c[g.value] }))}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-[12px] font-medium text-foreground/80 hover:bg-secondary"
                >
                  <ChevronRight className={cn("size-3 transition-transform", !collapsed[g.value] && "rotate-90")} />
                  <TypeIcon type={g.value} />
                  {g.label}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{g.items.length}</span>
                </button>
                {!collapsed[g.value] && (
                  <div className="ml-3 border-l pl-1">
                    {g.items.slice(0, shown[g.value] ?? 50).map((n) => (
                      <NoteRow key={n.id} n={n} active={params.id === n.id} />
                    ))}
                    {g.items.length > (shown[g.value] ?? 50) && (
                      <button
                        onClick={() => setShown((s) => ({ ...s, [g.value]: (s[g.value] ?? 50) + 200 }))}
                        className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        Mostrar mais ({g.items.length - (shown[g.value] ?? 50)})
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {tagCounts.length > 0 && (
              <div className="mt-3 border-t pt-2">
                <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Tags</p>
                <div className="flex flex-wrap gap-1 px-1">
                  {tagCounts.map(([t, c]) => (
                    <button
                      key={t}
                      onClick={() => setTag(tag === t ? null : t)}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground",
                        tag === t && "bg-accent text-accent-foreground",
                      )}
                    >
                      #{t} <span className="font-mono opacity-60">{c}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1 border-t p-2">
        <button onClick={theme.toggle} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Alternar tema">
          {theme.light ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </button>
        <button
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await exportVault(links, tasks, events);
              toast.success("Exportação pronta: abra a pasta no Obsidian.");
            } catch {
              toast.error("Falha ao exportar.");
            } finally {
              setExporting(false);
            }
          }}
          className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Exportar tudo (.zip)"
        >
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </button>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{notes.length} notas</span>
        <button
          onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/entrar"))}
          className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Sair"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  );
}
