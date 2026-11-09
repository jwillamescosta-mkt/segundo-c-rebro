import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Pin, RefreshCw, Sparkles, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteNote, noteQuery, saveNoteContent, signedUrl, splitChildren, undoSplit, updateNote, type Note } from "@/lib/brain";
import { useApp, useBrain } from "@/components/brain/app-context";
import { Markdown } from "@/components/brain/Markdown";
import { GenerateCardsButton } from "@/components/brain/GenerateCardsButton";
import { TypeIcon } from "@/components/brain/type-meta";
import { typeLabel } from "@/lib/markdown-utils";

export const Route = createFileRoute("/_app/nota/$id")({
  head: () => ({ meta: [{ title: "Nota — Segundo Cérebro" }, { name: "description", content: "Nota do seu segundo cérebro." }] }),
  component: NotePage,
});

function NotePage() {
  const { id } = Route.useParams();
  const full = useQuery(noteQuery(id));
  const note = full.data;
  if (full.isLoading) return <div className="p-8"><Loader2 className="size-4 animate-spin" /></div>;
  if (!note) return <div className="p-8 text-sm text-muted-foreground">Nota não encontrada. <Link to="/inicio" className="text-primary">Voltar</Link></div>;
  return <NoteEditor key={note.id} note={note} />;
}

function Attachment({ note }: { note: Note }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (note.attachment_path) signedUrl(note.attachment_path).then(setUrl).catch(() => setUrl(null));
  }, [note.attachment_path]);
  if (note.source_kind === "link" && note.source_url)
    return (
      <a href={note.source_url} target="_blank" rel="noreferrer noopener" className="mb-4 block overflow-hidden rounded-lg border bg-panel">
        {note.og_image && <img src={note.og_image} alt="" className="max-h-56 w-full object-cover" />}
        <p className="truncate px-3 py-2 font-mono text-xs text-muted-foreground">{note.source_url}</p>
      </a>
    );
  if (!url) return null;
  if (note.source_kind === "imagem") return <img src={url} alt="" className="mb-4 max-h-96 rounded-lg border" />;
  if (note.source_kind === "audio") return <audio controls src={url} className="mb-4 w-full" />;
  return <a href={url} target="_blank" rel="noreferrer" className="mb-4 inline-block text-sm text-primary">Abrir arquivo original</a>;
}

function NoteEditor({ note }: { note: Note }) {
  const { notes } = useBrain();
  const { runProcess } = useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [mode, setMode] = useState<"editar" | "dividir" | "ler">("ler");
  const [ac, setAc] = useState<{ q: string; i: number } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const dirty = useRef(false);

  // follow server updates while not editing (e.g. AI processing)
  useEffect(() => {
    if (!dirty.current) { setContent(note.content); setTitle(note.title); }
  }, [note.content, note.title]);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      try {
        await saveNoteContent(note, { title, content });
        dirty.current = false;
        qc.invalidateQueries({ queryKey: ["links"] });
        qc.invalidateQueries({ queryKey: ["notes"] });
        qc.setQueryData<Note | null>(["note", note.id], (old) => (old ? { ...old, title, content } : old));
      } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar."); }
    }, 900);
    return () => clearTimeout(t);
  }, [title, content]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = ac ? notes.filter((n) => n.id !== note.id && n.title.toLowerCase().includes(ac.q.toLowerCase())).slice(0, 8) : [];

  function onChange(v: string) {
    dirty.current = true;
    setContent(v);
    const pos = ta.current?.selectionStart ?? v.length;
    const m = v.slice(0, pos).match(/\[\[([^\]\n]*)$/);
    setAc(m ? { q: m[1], i: 0 } : null);
  }
  function insert(t: string) {
    const el = ta.current!;
    const pos = el.selectionStart;
    const before = content.slice(0, pos).replace(/\[\[([^\]\n]*)$/, `[[${t}]]`);
    const after = content.slice(pos).replace(/^\]\]/, "");
    onChange(before + after);
    setAc(null);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = before.length; });
  }

  const points = splitChildren(notes, note.id);
  const captures = note.type === "diario" && note.daily_date ? notes.filter((n) => n.id !== note.id && n.created_at.slice(0, 10) === note.daily_date) : [];

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <TypeIcon type={note.type} /> {typeLabel(note.type)}
        {note.status === "processando" && <span className="flex animate-pulse-soft items-center gap-1 text-primary"><Sparkles className="size-3" /> {note.progress ?? "Processando…"}</span>}
        <div className="ml-auto flex gap-1">
          {(["editar", "dividir", "ler"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("rounded px-2 py-0.5 capitalize", mode === m ? "bg-secondary text-foreground" : "hover:text-foreground")}>{m}</button>
          ))}
          <button title="Fixar" onClick={() => updateNote(note.id, { pinned: !note.pinned }).then(() => { qc.invalidateQueries({ queryKey: ["notes"] }); qc.invalidateQueries({ queryKey: ["note", note.id] }); })} className={cn("rounded p-1 hover:bg-secondary", note.pinned && "text-primary")}><Pin className="size-3.5" /></button>
          <GenerateCardsButton noteId={note.id} />
          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" disabled={note.status === "processando"} onClick={() => runProcess(note.id, "reanalyze")}><RefreshCw className="size-3" /> Reanalisar com IA</Button>
          <button title="Excluir" onClick={async () => { if (!confirm("Excluir esta nota?")) return; await deleteNote(note); qc.invalidateQueries({ queryKey: ["notes"] }); navigate({ to: "/inicio" }); }} className="rounded p-1 hover:bg-secondary hover:text-destructive"><Trash2 className="size-3.5" /></button>
        </div>
      </div>
      {note.status === "erro" && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <AlertCircle className="size-4 text-destructive" /> {note.error_message ?? "Falha ao processar."}
          <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => runProcess(note.id, "full")}>Tentar de novo</Button>
        </div>
      )}
      {points.length > 0 && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            <span className="font-medium">A IA separou esta captura em {points.length} pontos</span>
            <button
              onClick={async () => {
                if (!confirm(`Desfazer a separação? Os ${points.length} pontos serão apagados. Esta captura continua como está.`)) return;
                try {
                  await undoSplit(note.id);
                  qc.invalidateQueries({ queryKey: ["notes"] });
                  qc.invalidateQueries({ queryKey: ["links"] });
                  toast.success("Separação desfeita.");
                } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível desfazer."); }
              }}
              className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-destructive"
            >
              <Undo2 className="size-3" /> Desfazer
            </button>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {points.map((p) => (
              <li key={p.id}>
                <Link to="/nota/$id" params={{ id: p.id }} className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs hover:border-primary hover:text-primary">
                  <TypeIcon type={p.type} /> {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <input value={title} onChange={(e) => { dirty.current = true; setTitle(e.target.value); }} className="mb-2 w-full bg-transparent text-2xl font-semibold outline-none" />
      {note.summary && <p className="mb-4 border-l-2 border-primary pl-3 text-sm text-muted-foreground">{note.summary}</p>}
      <Attachment note={note} />
      <div className={cn("grid gap-4", mode === "dividir" && "md:grid-cols-2")}>
        {mode !== "ler" && (
          <div className="relative">
            <textarea ref={ta} value={content} onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (!ac || !suggestions.length) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setAc({ ...ac, i: (ac.i + 1) % suggestions.length }); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setAc({ ...ac, i: (ac.i - 1 + suggestions.length) % suggestions.length }); }
                else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(suggestions[ac.i].title); }
                else if (e.key === "Escape") setAc(null);
              }}
              className="min-h-[60vh] w-full resize-none rounded-md border bg-panel p-3 font-mono text-sm leading-relaxed outline-none focus:border-primary" />
            {ac && suggestions.length > 0 && (
              <div className="absolute left-2 right-2 top-2 z-10 rounded-md border bg-popover p-1 shadow-lg">
                <p className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Ligar a…</p>
                {suggestions.map((s, i) => (
                  <button key={s.id} onMouseDown={(e) => { e.preventDefault(); insert(s.title); }} className={cn("flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm", i === ac.i && "bg-accent")}><TypeIcon type={s.type} />{s.title}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {mode !== "editar" && <div onDoubleClick={() => setMode("dividir")}><Markdown content={content || "*Nota vazia — clique duas vezes para editar.*"} /></div>}
      </div>
      {note.type === "diario" && (
        <section className="mt-8 border-t pt-4">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Capturas do dia</h2>
          {captures.length === 0 ? <p className="text-sm text-muted-foreground">Nada capturado hoje ainda.</p> : (
            <ul className="space-y-1">{captures.map((n) => <li key={n.id}><Link to="/nota/$id" params={{ id: n.id }} className="flex items-center gap-2 text-sm hover:text-primary"><TypeIcon type={n.type} />{n.title}</Link></li>)}</ul>
          )}
        </section>
      )}
    </div>
  );
}
