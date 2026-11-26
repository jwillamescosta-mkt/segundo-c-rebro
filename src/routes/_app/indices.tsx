import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ListTree, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBrain } from "@/components/brain/app-context";
import { Markdown } from "@/components/brain/Markdown";
import { TypeIcon } from "@/components/brain/type-meta";
import { buildBrainMap, INDEX_TAG } from "@/lib/brain-map";
import { indexTitle, INDEXABLE } from "@/lib/index-utils";
import { draftIndexFn, saveIndexFn } from "@/lib/index-notes.functions";

export const Route = createFileRoute("/_app/indices")({
  head: () => ({
    meta: [
      { title: "Índices — Segundo Cérebro" },
      { name: "description", content: "Um índice por área, mantido pela IA." },
    ],
  }),
  component: IndexesPage,
});

function IndexesPage() {
  const { notes, links } = useBrain();
  const [showMap, setShowMap] = useState(false);
  const qc = useQueryClient();
  const draft = useServerFn(draftIndexFn);
  const save = useServerFn(saveIndexFn);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ type: string; content: string; count: number } | null>(
    null,
  );

  async function generate(type: string) {
    setBusy(type);
    try {
      const r = await draft({ data: { type } });
      if (r.ok) setPreview({ type, content: r.content, count: r.count });
      else toast.error(r.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o índice.");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!preview) return;
    setBusy("save");
    try {
      const r = await save({ data: { type: preview.type, content: preview.content } });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Índice salvo.");
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["note", r.noteId] });
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
          <ListTree className="size-5 text-primary" />
          <h1 className="text-xl font-semibold">Índices</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Um mapa por área, escrito pela IA a partir dos resumos e das tarefas abertas: situação e
          próxima ação de cada nota. A IA (e você) começa por ele em vez de abrir nota por nota.
          Você vê a prévia antes de salvar.
        </p>
      </div>

      <section className="rounded-xl border bg-panel p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Mapa do cérebro</h2>
            <p className="text-xs text-muted-foreground">
              O que existe e por onde começar. É o mesmo mapa que vai como AGENTS.md na exportação e
              que o conector com leitura entrega à IA.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowMap((v) => !v)}>
            {showMap ? "Esconder" : "Ver mapa"}
          </Button>
        </div>
        {showMap && (
          <div className="mt-3 max-h-[32rem] overflow-y-auto rounded-md border bg-background p-3">
            <Markdown content={buildBrainMap(notes, links)} />
          </div>
        )}
      </section>

      <ul className="divide-y rounded-xl border bg-panel">
        {INDEXABLE.map((t) => {
          const count = notes.filter(
            (n) => n.type === t.value && !n.tags.includes(INDEX_TAG),
          ).length;
          const idx = notes.find((n) => n.title === indexTitle(t.label));
          return (
            <li key={t.value} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <TypeIcon type={t.value} />
              <span className="text-sm font-medium">{t.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{count}</span>
              {idx && (
                <Link
                  to="/nota/$id"
                  params={{ id: idx.id }}
                  className="text-xs text-primary hover:underline"
                >
                  ver índice ({new Date(idx.updated_at).toLocaleDateString("pt-BR")})
                </Link>
              )}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={!count || busy !== null}
                onClick={() => generate(t.value)}
              >
                {busy === t.value ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Wand2 className="size-3.5" />
                )}
                {idx ? "Atualizar" : "Gerar"}
              </Button>
            </li>
          );
        })}
      </ul>

      {preview && (
        <section
          className="space-y-3 rounded-xl border border-primary/40 bg-panel p-4"
          aria-label="Prévia do índice"
        >
          <h2 className="text-sm font-semibold">
            Prévia{" "}
            <span className="font-normal text-muted-foreground">({preview.count} notas lidas)</span>
          </h2>
          <div className="max-h-[32rem] overflow-y-auto rounded-md border bg-background p-3">
            <Markdown content={preview.content} />
          </div>
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
