import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  CheckCheck,
  Inbox,
  Link2,
  ListTodo,
  Loader2,
  PartyPopper,
  Sparkles,
  Unlink,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BriefingButtons } from "@/components/brain/BriefingButtons";
import { orphanNotes, useApp, useBrain } from "@/components/brain/app-context";
import { TypeIcon } from "@/components/brain/type-meta";
import {
  rescheduleTasks,
  setLinksStatus,
  setTaskDone,
  type Link as BrainLink,
  type Task,
} from "@/lib/brain";
import { connectOrphansFn } from "@/lib/review.functions";
import {
  BULK_ACCEPT_MIN,
  rescheduleOptions,
  reviewCount,
  strongSuggestions,
} from "@/lib/review-utils";
import { formatDateBR, todayISO } from "@/lib/tasks-utils";

export const Route = createFileRoute("/_app/revisar")({
  head: () => ({
    meta: [
      { title: "Revisar — Segundo Cérebro" },
      { name: "description", content: "Revisão semanal: zere o que pede decisão." },
    ],
  }),
  component: ReviewPage,
});

const SHOW = 30;

function ReviewPage() {
  const { notes, links, tasks, byId } = useBrain();
  const { pendingSmart, smartBusy, runSmart } = useApp();
  const qc = useQueryClient();
  const today = todayISO();

  const suggested = useMemo(
    () =>
      links
        .filter(
          (l) =>
            l.status === "sugerida" && byId.has(l.source_note_id) && byId.has(l.target_note_id),
        )
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
    [links, byId],
  );
  const strong = useMemo(() => strongSuggestions(suggested), [suggested]);
  const overdue = useMemo(
    () =>
      tasks
        .filter((t) => !t.done && t.due_date && t.due_date < today)
        .sort((a, b) => a.due_date!.localeCompare(b.due_date!)),
    [tasks, today],
  );
  const orphans = useMemo(() => orphanNotes(notes, links), [notes, links]);
  const total = reviewCount({
    suggested: suggested.length,
    overdue: overdue.length,
    orphans: orphans.length,
    pending: pendingSmart,
  });

  // Atualização otimista: a lista responde na hora; o realtime confirma depois.
  async function decideLinks(ids: string[], status: "aceita" | "rejeitada") {
    const set = new Set(ids);
    const before = qc.getQueryData<BrainLink[]>(["links"]);
    qc.setQueryData<BrainLink[]>(["links"], (old) =>
      old?.map((l) => (set.has(l.id) ? { ...l, status } : l)),
    );
    try {
      await setLinksStatus(ids, status);
      if (ids.length > 1)
        toast.success(`${ids.length} ligações ${status === "aceita" ? "aceitas" : "rejeitadas"}.`);
    } catch (e) {
      qc.setQueryData(["links"], before);
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  async function moveTasks(ids: string[], date: string | null, done = false) {
    const set = new Set(ids);
    const before = qc.getQueryData<Task[]>(["tasks"]);
    qc.setQueryData<Task[]>(["tasks"], (old) =>
      old?.map((t) =>
        set.has(t.id)
          ? done
            ? { ...t, done: true }
            : { ...t, due_date: date, due_time: date ? t.due_time : null }
          : t,
      ),
    );
    try {
      if (done) await Promise.all(ids.map((id) => setTaskDone(id, true)));
      else await rescheduleTasks(ids, date);
      if (ids.length > 1)
        toast.success(
          `${ids.length} tarefas ${done ? "concluídas" : date ? `movidas para ${formatDateBR(date)}` : "sem data"}.`,
        );
    } catch (e) {
      qc.setQueryData(["tasks"], before);
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  const connect = useServerFn(connectOrphansFn);
  const [connecting, setConnecting] = useState(false);
  async function connectOrphans() {
    setConnecting(true);
    try {
      const r = await connect({ data: { noteIds: orphans.slice(0, 20).map((n) => n.id) } });
      if (!r.ok) toast.error(r.error);
      else
        toast.success(
          r.links
            ? `${r.links} ligações encontradas. As de confiança alta já entraram; as outras aparecem acima para você decidir.`
            : "A IA não achou ligações fortes para essas notas. Vale abrir e ligar à mão com [[ ]].",
        );
      qc.invalidateQueries({ queryKey: ["links"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao conectar.");
    } finally {
      setConnecting(false);
    }
  }

  const opts = rescheduleOptions(today);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Inbox className="size-5 text-primary" /> Revisão
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uma vez por semana, 15 minutos: decida o que a IA sugeriu, reagende o que atrasou e
          conecte o que ficou solto. É o hábito que mantém o cérebro vivo.
        </p>
        <p className="mt-3 text-sm">
          {total === 0 ? (
            <span className="flex items-center gap-2 font-medium text-primary">
              <PartyPopper className="size-4" /> Caixa zerada. Seu cérebro está em ordem.
            </span>
          ) : (
            <span>
              <strong>{total}</strong> {total === 1 ? "item pede" : "itens pedem"} uma decisão.
            </span>
          )}
        </p>
      </header>

      {/* 1. Ligações sugeridas */}
      <section className="rounded-lg border bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="size-4 text-primary" /> Ligações sugeridas pela IA{" "}
            <span className="text-muted-foreground">({suggested.length})</span>
          </h2>
          {strong.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 gap-1 text-xs"
              onClick={() =>
                decideLinks(
                  strong.map((l) => l.id),
                  "aceita",
                )
              }
            >
              <CheckCheck className="size-3.5" /> Aceitar as {strong.length} com confiança ≥{" "}
              {Math.round(BULK_ACCEPT_MIN * 100)}%
            </Button>
          )}
        </div>
        {suggested.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sugestão esperando.</p>
        ) : (
          <ul className="divide-y">
            {suggested.slice(0, SHOW).map((l) => {
              const a = byId.get(l.source_note_id)!;
              const b = byId.get(l.target_note_id)!;
              return (
                <li key={l.id} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-1">
                      <Link
                        to="/nota/$id"
                        params={{ id: a.id }}
                        className="flex items-center gap-1 truncate hover:text-primary"
                      >
                        <TypeIcon type={a.type} />
                        {a.title}
                      </Link>
                      <span className="text-muted-foreground">↔</span>
                      <Link
                        to="/nota/$id"
                        params={{ id: b.id }}
                        className="flex items-center gap-1 truncate hover:text-primary"
                      >
                        <TypeIcon type={b.type} />
                        {b.title}
                      </Link>
                    </div>
                    {l.reason && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {l.reason} · {Math.round((l.confidence ?? 0) * 100)}%
                      </p>
                    )}
                  </div>
                  <button
                    aria-label="Aceitar ligação"
                    title="Aceitar"
                    onClick={() => decideLinks([l.id], "aceita")}
                    className="rounded p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    aria-label="Rejeitar ligação"
                    title="Rejeitar"
                    onClick={() => decideLinks([l.id], "rejeitada")}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {suggested.length > SHOW && (
          <p className="mt-2 text-xs text-muted-foreground">
            Mostrando as {SHOW} mais fortes. Decida estas e as próximas aparecem.
          </p>
        )}
      </section>

      {/* 2. Tarefas atrasadas */}
      <section className="rounded-lg border bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ListTodo className="size-4 text-primary" /> Tarefas atrasadas{" "}
            <span className="text-muted-foreground">({overdue.length})</span>
          </h2>
          {overdue.length > 1 && (
            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  moveTasks(
                    overdue.map((t) => t.id),
                    opts[2].date,
                  )
                }
              >
                Todas para segunda
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  moveTasks(
                    overdue.map((t) => t.id),
                    null,
                  )
                }
              >
                Todas sem data
              </Button>
            </div>
          )}
        </div>
        {overdue.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada atrasado.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              Seja honesto: se não vai fazer nesta semana, tire a data. Tarefa atrasada que fica
              parada vira ruído e esconde o que importa.
            </p>
            <ul className="divide-y">
              {overdue.slice(0, SHOW).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {t.text}
                    <span className="ml-2 text-xs text-destructive">
                      {formatDateBR(t.due_date!)}
                    </span>
                    {t.note_id && byId.has(t.note_id) && (
                      <Link
                        to="/nota/$id"
                        params={{ id: t.note_id }}
                        className="ml-2 text-xs text-muted-foreground hover:text-primary"
                      >
                        {byId.get(t.note_id)!.title}
                      </Link>
                    )}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {opts.map((o) => (
                      <button
                        key={o.key}
                        onClick={() => moveTasks([t.id], o.date)}
                        className="rounded border px-1.5 py-0.5 text-xs hover:border-primary hover:text-primary"
                      >
                        {o.label}
                      </button>
                    ))}
                    <button
                      onClick={() => moveTasks([t.id], null, true)}
                      className="rounded border px-1.5 py-0.5 text-xs hover:border-primary hover:text-primary"
                    >
                      Feita
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 3. Notas órfãs e fila da IA */}
      <section className="rounded-lg border bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Unlink className="size-4 text-primary" /> Notas sem ligação{" "}
            <span className="text-muted-foreground">({orphans.length})</span>
          </h2>
          {orphans.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 gap-1 text-xs"
              disabled={connecting}
              onClick={connectOrphans}
            >
              {connecting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}{" "}
              Procurar ligações com IA
            </Button>
          )}
        </div>
        {orphans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tudo conectado.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {orphans.slice(0, 40).map((n) => (
              <li key={n.id}>
                <Link
                  to="/nota/$id"
                  params={{ id: n.id }}
                  className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs hover:border-primary hover:text-primary"
                >
                  <TypeIcon type={n.type} />
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {pendingSmart > 0 && (
          <div className="mt-4 flex items-center gap-2 border-t pt-3 text-sm">
            <span className="text-muted-foreground">
              {pendingSmart} nota{pendingSmart > 1 ? "s" : ""} esperando a conexão inteligente.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 gap-1 text-xs"
              disabled={smartBusy}
              onClick={() => runSmart()}
            >
              {smartBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}{" "}
              Rodar agora
            </Button>
          </div>
        )}
      </section>

      {/* 4. Fechar a semana */}
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Fechar a semana
        </h2>
        <BriefingButtons />
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Zere as três caixas acima.</li>
          <li>
            Gere a <strong>revisão da semana</strong> e leia o que a IA percebeu.
          </li>
          <li>
            Escolha <strong>uma</strong> nota boa da semana e use <strong>Expressar</strong> para
            virar vídeo, post ou mensagem.
          </li>
          <li>
            Confira as{" "}
            <Link to="/metas" className="text-primary">
              metas
            </Link>
            : a semana te aproximou delas?
          </li>
        </ol>
      </section>
    </div>
  );
}
