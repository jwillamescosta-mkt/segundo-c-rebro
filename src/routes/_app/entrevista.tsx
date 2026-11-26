import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, Mic, Sparkles, Square, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBrain } from "@/components/brain/app-context";
import { Markdown } from "@/components/brain/Markdown";
import { useVoiceAnswer } from "@/components/brain/useVoiceAnswer";
import { CORE_TAG, CORE_TOPICS, topicByKey } from "@/lib/core-utils";
import { draftCoreNoteFn, saveCoreNoteFn } from "@/lib/interview.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/entrevista")({
  head: () => ({
    meta: [
      { title: "Montar meu cérebro — Segundo Cérebro" },
      { name: "description", content: "Entrevista guiada que cria as notas-núcleo." },
    ],
  }),
  component: InterviewPage,
});

// As respostas ficam no aparelho até virarem nota: fechar o app no meio não perde o que foi falado.
const draftKey = (k: string) => `entrevista:${k}`;
const readDraft = (k: string) => {
  try {
    return localStorage.getItem(draftKey(k)) ?? "";
  } catch {
    return "";
  }
};
const writeDraft = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(draftKey(k), v);
    else localStorage.removeItem(draftKey(k));
  } catch {
    /* sem armazenamento: segue só na memória */
  }
};

function InterviewPage() {
  const { notes } = useBrain();
  const qc = useQueryClient();
  const draft = useServerFn(draftCoreNoteFn);
  const save = useServerFn(saveCoreNoteFn);
  const done = new Set(
    CORE_TOPICS.filter((t) =>
      notes.some((n) => n.title === t.title && n.tags.includes(CORE_TAG)),
    ).map((t) => t.key),
  );
  const [key, setKey] = useState(() => CORE_TOPICS.find((t) => !done.has(t.key))?.key ?? "perfil");
  const topic = topicByKey(key)!;
  const [answer, setAnswer] = useState("");
  const [preview, setPreview] = useState<{
    content: string;
    summary: string;
    replaces: boolean;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const voice = useVoiceAnswer((t) => setAnswer((a) => (a ? `${a}\n\n${t}` : t)));
  const savedNote = notes.find((n) => n.title === topic.title);

  useEffect(() => {
    setAnswer(readDraft(key));
    setPreview(null);
    setEditing(false);
  }, [key]);
  useEffect(() => writeDraft(key, answer), [key, answer]);

  async function generate() {
    setBusy("draft");
    try {
      const r = await draft({ data: { key, answer } });
      if (r.ok) setPreview({ content: r.content, summary: r.summary, replaces: r.replaces });
      else toast.error(r.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar a nota.");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!preview) return;
    setBusy("save");
    try {
      const r = await save({ data: { key, content: preview.content, summary: preview.summary } });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`"${r.title}" salva no núcleo.`);
      writeDraft(key, "");
      setAnswer("");
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["note", r.noteId] });
      const next = CORE_TOPICS.find((t) => t.key !== key && !done.has(t.key));
      if (next) setKey(next.key);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h1 className="text-xl font-semibold">Montar meu cérebro</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Poucas notas muito boas valem mais que milhares soltas. Responda cada tema falando à
          vontade, sem organizar: a IA monta a nota-núcleo, você revisa e aprova. Todas as respostas
          da IA passam a usar esse contexto.
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {done.size} de {CORE_TOPICS.length} temas no núcleo
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Temas">
        {CORE_TOPICS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === key}
            onClick={() => setKey(t.key)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-primary",
              t.key === key && "border-primary bg-primary/10 text-primary",
            )}
          >
            {done.has(t.key) ? (
              <CheckCircle2 className="size-3.5 text-primary" />
            ) : (
              <Circle className="size-3.5 opacity-50" />
            )}
            {t.title}
          </button>
        ))}
      </div>

      <section className="space-y-3 rounded-xl border bg-panel p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">{topic.title}</h2>
          {savedNote && (
            <Link
              to="/nota/$id"
              params={{ id: savedNote.id }}
              className="text-xs text-primary hover:underline"
            >
              Ver nota atual
            </Link>
          )}
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground/90">
          {topic.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={8}
          aria-label="Sua resposta"
          placeholder="Fale ou escreva tudo o que vier à cabeça. Não precisa organizar."
          className="w-full rounded-md border bg-background p-3 text-sm outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={voice.state === "rec" ? "destructive" : "outline"}
            size="sm"
            disabled={voice.state === "busy"}
            onClick={voice.state === "rec" ? voice.stop : voice.start}
          >
            {voice.state === "rec" ? (
              <Square className="size-3.5" />
            ) : voice.state === "busy" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Mic className="size-3.5" />
            )}
            {voice.state === "rec"
              ? "Parar e transcrever"
              : voice.state === "busy"
                ? "Transcrevendo…"
                : "Responder falando"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy !== null || voice.state !== "idle" || answer.trim().length < 10}
            onClick={generate}
          >
            {busy === "draft" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wand2 className="size-3.5" />
            )}
            {savedNote?.tags.includes(CORE_TAG) ? "Atualizar a nota" : "Gerar a nota"}
          </Button>
        </div>
      </section>

      {preview && (
        <section
          className="space-y-3 rounded-xl border border-primary/40 bg-panel p-4"
          aria-label="Prévia da nota"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Prévia{" "}
              {preview.replaces && (
                <span className="font-normal text-muted-foreground">
                  (junta com a versão atual)
                </span>
              )}
            </h2>
            <button
              onClick={() => setEditing((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {editing ? "Ver prévia" : "Editar"}
            </button>
          </div>
          {editing ? (
            <textarea
              value={preview.content}
              onChange={(e) => setPreview({ ...preview, content: e.target.value })}
              rows={16}
              aria-label="Conteúdo da nota"
              className="w-full rounded-md border bg-background p-3 font-mono text-xs outline-none focus:border-primary"
            />
          ) : (
            <div className="max-h-[28rem] overflow-y-auto rounded-md border bg-background p-3">
              <Markdown content={preview.content} />
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy !== null} onClick={approve}>
              {busy === "save" && <Loader2 className="size-3.5 animate-spin" />} Aprovar e salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setPreview(null)}
            >
              Descartar
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
