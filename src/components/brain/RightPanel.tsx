import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, Link2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { createManualLink, fetchContents, findMentions, setLinkStatus, setSharing, setTaskDone, updateNote, type NoteMeta } from "@/lib/brain";
import { NOTE_TYPES, mergeTags, normalizeTitle } from "@/lib/markdown-utils";
import { formatDateBR } from "@/lib/tasks-utils";
import { localNeighborhood, buildGraph } from "@/lib/graph-data";
import { useBrain } from "./app-context";
import { TypeIcon } from "./type-meta";
import { LazyGraph } from "./LazyGraph";
import { AnimatePresence, motion } from "motion/react";
import { EASE, StaggerItem, StaggerList } from "./motion";

function Section({ title, count, children, defaultOpen = true }: { title: string; count?: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("size-3 transition-transform", !open && "-rotate-90")} />
        {title}
        {count !== undefined && <span className="ml-auto font-mono">{count}</span>}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

function snippetAround(content: string, needle: string) {
  const i = content.toLocaleLowerCase("pt-BR").indexOf(needle.toLocaleLowerCase("pt-BR"));
  if (i < 0) return null;
  const s = Math.max(0, i - 60);
  return (s > 0 ? "…" : "") + content.slice(s, i + needle.length + 80).replace(/\n+/g, " ") + "…";
}

export function RightPanel() {
  const params = useParams({ strict: false }) as { id?: string };
  const { byId } = useBrain();
  const note = params.id ? byId.get(params.id) : undefined;
  if (!note)
    return (
      <aside className="flex h-full items-center justify-center bg-panel p-6 text-center text-xs text-muted-foreground">
        Abra uma nota para ver ligações, backlinks e o grafo local.
      </aside>
    );
  return <NoteSidePanel note={note} />;
}

function NoteSidePanel({ note }: { note: NoteMeta }) {
  const { notes, links, tasks, byId } = useBrain();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tagInput, setTagInput] = useState("");

  const mine = links.filter((l) => l.source_note_id === note.id || l.target_note_id === note.id);
  const other = (l: (typeof links)[number]) => byId.get(l.source_note_id === note.id ? l.target_note_id : l.source_note_id);
  const suggested = mine.filter((l) => l.status === "sugerida");
  const accepted = mine.filter((l) => l.status === "aceita");
  const backlinks = links.filter((l) => l.target_note_id === note.id && l.status === "aceita");
  const linkedIds = new Set(mine.map((l) => (l.source_note_id === note.id ? l.target_note_id : l.source_note_id)));
  // Menções e trechos vêm do servidor: a lista em memória não carrega o conteúdo das notas.
  const unlinkedQ = useQuery({
    queryKey: ["mentions", note.id, note.title, mine.length],
    queryFn: () => findMentions(note.title, [note.id, ...linkedIds]),
    enabled: note.title.length >= 3,
    staleTime: 60_000,
  });
  const unlinked = unlinkedQ.data ?? [];
  const backlinkIds = links.filter((l) => l.target_note_id === note.id && l.status === "aceita").map((l) => l.source_note_id);
  const contents = useQuery({
    queryKey: ["contents", backlinkIds.join(",")],
    queryFn: () => fetchContents(backlinkIds.slice(0, 50)),
    enabled: backlinkIds.length > 0,
    staleTime: 60_000,
  }).data;
  const noteTasks = tasks.filter((t) => t.note_id === note.id);
  const local = useMemo(() => {
    const only = localNeighborhood(note.id, links, 2);
    return buildGraph(notes, links, { only });
  }, [note.id, notes, links]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["links"] });
    qc.invalidateQueries({ queryKey: ["notes"] });
  };

  async function act(p: Promise<unknown>, ok?: string) {
    try {
      await p;
      if (ok) toast.success(ok);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Algo deu errado.");
    }
  }

  const shareUrl = note.share_token ? `${window.location.origin}/s/${note.share_token}` : "";

  return (
    <aside className="h-full overflow-y-auto bg-panel text-[13px]">
      <Section title="Ligações sugeridas" count={suggested.length}>
        {suggested.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {note.status === "processando" ? "Procurando conexões…" : "Nenhuma sugestão pendente."}
          </p>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
            {suggested.map((l, idx) => {
              const o = other(l);
              if (!o) return null;
              const pct = Math.round(Number(l.confidence ?? 0) * 100);
              return (
                <motion.li
                  key={l.id}
                  layout
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: idx * 0.05, ease: EASE } }}
                  exit={{ opacity: 0, x: 24, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.25 } }}
                  whileHover={{ y: -2, boxShadow: "0 6px 20px -8px color-mix(in oklab, var(--primary) 45%, transparent)" }}
                  className="overflow-hidden rounded-md border bg-background p-2"
                >
                  <div className="flex items-center gap-1.5">
                    <motion.span animate={{ rotate: [0, 18, -12, 0], scale: [1, 1.25, 1] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.5 }}>
                      <Sparkles className="size-3 text-primary" />
                    </motion.span>
                    <Link to="/nota/$id" params={{ id: o.id }} className="truncate font-medium hover:text-primary">
                      {o.title}
                    </Link>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                    <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.15 + idx * 0.05 }} />
                  </div>
                  {l.reason && <p className="mt-1 text-xs text-muted-foreground">{l.reason}</p>}
                  <div className="mt-2 flex gap-1">
                    <button onClick={() => act(setLinkStatus(l.id, "aceita"))} className="flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:bg-primary/90">
                      <Check className="size-3" /> Aceitar
                    </button>
                    <button onClick={() => act(setLinkStatus(l.id, "rejeitada"))} className="flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-secondary">
                      <X className="size-3" /> Rejeitar
                    </button>
                  </div>
                </motion.li>
              );
            })}
            </AnimatePresence>
          </ul>
        )}
      </Section>

      <Section title="Backlinks" count={backlinks.length}>
        {backlinks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma nota aponta para esta.</p>
        ) : (
          <StaggerList key={note.id} className="space-y-2">
            {backlinks.map((l) => {
              const o = byId.get(l.source_note_id);
              if (!o) return null;
              const c = contents?.get(o.id) ?? "";
              const snip = snippetAround(c, `[[${note.title}`) ?? snippetAround(c, note.title) ?? o.summary;
              return (
                <StaggerItem key={l.id}>
                  <Link to="/nota/$id" params={{ id: o.id }} className="flex items-center gap-1.5 font-medium hover:text-primary">
                    <TypeIcon type={o.type} /> <span className="truncate">{o.title}</span>
                  </Link>
                  {snip && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{snip}</p>}
                </StaggerItem>
              );
            })}
          </StaggerList>
        )}
        {accepted.filter((l) => l.source_note_id === note.id).length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-[11px] text-muted-foreground">Esta nota liga para</p>
            <div className="flex flex-wrap gap-1">
              {accepted
                .filter((l) => l.source_note_id === note.id)
                .map((l) => {
                  const o = byId.get(l.target_note_id);
                  return o ? (
                    <Link key={l.id} to="/nota/$id" params={{ id: o.id }} className="rounded border px-1.5 py-0.5 text-xs hover:border-primary">
                      {o.title}
                    </Link>
                  ) : null;
                })}
            </div>
          </div>
        )}
      </Section>

      <Section title="Menções não ligadas" count={unlinked.length} defaultOpen={unlinked.length > 0}>
        {unlinked.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma menção solta ao título.</p>
        ) : (
          <ul className="space-y-2">
            {unlinked.map((o) => (
              <li key={o.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link to="/nota/$id" params={{ id: o.id }} className="block truncate font-medium hover:text-primary">
                    {o.title}
                  </Link>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{snippetAround(o.content, note.title)}</p>
                </div>
                <button
                  onClick={() => act(createManualLink(o.id, note.id, "Menciona o título"), "Ligado")}
                  className="flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-xs hover:bg-secondary"
                >
                  <Link2 className="size-3" /> Ligar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Tarefas" count={noteTasks.length} defaultOpen={noteTasks.length > 0}>
        {noteTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma tarefa detectada.</p>
        ) : (
          <ul className="space-y-1.5">
            {noteTasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <Checkbox
                  checked={t.done}
                  onCheckedChange={(v) => act(setTaskDone(t.id, !!v)).then(() => qc.invalidateQueries({ queryKey: ["tasks"] }))}
                  className="mt-0.5"
                />
                <span className={cn("flex-1 text-xs", t.done && "text-muted-foreground line-through")}>{t.text}</span>
                {t.due_date && <span className="font-mono text-[10px] text-muted-foreground">{formatDateBR(t.due_date)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Grafo local">
        <div className="h-56 overflow-hidden rounded-md border">
          {local.nodes.length > 1 ? (
            <LazyGraph
              nodes={local.nodes}
              links={local.links}
              focusId={note.id}
              compact
              repulsion={90}
              distance={40}
              onNodeClick={(id) => navigate({ to: "/nota/$id", params: { id } })}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem vizinhos ainda.</div>
          )}
        </div>
      </Section>

      <Section title="Propriedades">
        <dl className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Tipo</dt>
            <dd>
              <select
                value={note.type}
                onChange={(e) => act(updateNote(note.id, { type: e.target.value }))}
                className="rounded border bg-background px-1.5 py-0.5 outline-none"
              >
                {NOTE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.singular}
                  </option>
                ))}
              </select>
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-muted-foreground">Tags</dt>
            <dd className="flex flex-wrap gap-1">
              {note.tags.map((t) => (
                <span key={t} className="tag-pill flex items-center gap-0.5">
                  #{t}
                  <button onClick={() => act(updateNote(note.id, { tags: note.tags.filter((x) => x !== t) }))} aria-label={`Remover ${t}`}>
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    act(updateNote(note.id, { tags: mergeTags(note.tags, [tagInput]) }));
                    setTagInput("");
                  }
                }}
                placeholder="+ tag"
                className="w-16 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </dd>
          </div>
          <Row k="Origem" v={note.source_kind} />
          <Row k="Criada" v={new Date(note.created_at).toLocaleString("pt-BR")} mono />
          <Row k="Atualizada" v={new Date(note.updated_at).toLocaleString("pt-BR")} mono />
          {note.entities && typeof note.entities === "object" && !Array.isArray(note.entities) &&
            (["pessoas", "clientes", "projetos"] as const).map((k) => {
              const v = (note.entities as Record<string, unknown>)[k];
              return Array.isArray(v) && v.length ? <Row key={k} k={k[0].toUpperCase() + k.slice(1)} v={v.join(", ")} /> : null;
            })}
          <div className="flex items-center justify-between border-t pt-2.5">
            <dt>
              <span className="text-foreground">Compartilhar</span>
              <p className="text-[11px] text-muted-foreground">Página pública somente leitura</p>
            </dt>
            <Switch checked={note.is_shared} onCheckedChange={(v) => act(setSharing(note, v), v ? "Link público criado" : "Compartilhamento revogado")} />
          </div>
          {note.is_shared && shareUrl && (
            <div className="flex items-center gap-1 rounded border bg-background px-2 py-1">
              <span className="truncate font-mono text-[10px]">{shareUrl}</span>
              <button
                className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => navigator.clipboard.writeText(shareUrl).then(() => toast.success("Link copiado"))}
                aria-label="Copiar link"
              >
                <Copy className="size-3" />
              </button>
            </div>
          )}
        </dl>
      </Section>
    </aside>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className={cn("text-right", mono && "font-mono text-[11px]")}>{v}</dd>
    </div>
  );
}
