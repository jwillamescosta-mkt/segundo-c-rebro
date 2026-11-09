import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AgendaList } from "@/components/brain/AgendaList";
import { useBrain } from "@/components/brain/app-context";
import { confirmEvent, deleteEvent } from "@/lib/brain";
import { addDaysISO, buildAgenda, formatDayBR, todayISO } from "@/lib/tasks-utils";

export const Route = createFileRoute("/_app/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Segundo Cérebro" }, { name: "description", content: "Compromissos e prazos extraídos das suas notas." }] }),
  component: AgendaPage,
});

const RANGES = [
  { days: 1, label: "Dia" },
  { days: 7, label: "Semana" },
  { days: 30, label: "Mês" },
];

function AgendaPage() {
  const { tasks, events } = useBrain();
  const [days, setDays] = useState(7);
  const [start, setStart] = useState(todayISO());
  const end = addDaysISO(start, days - 1);
  const agenda = buildAgenda(tasks, events, start, end);
  const today = todayISO();
  const suggested = events.filter((e) => e.status === "sugerido");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Agenda</h1>
        <div className="flex rounded-md border">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)} aria-pressed={days === r.days} className={`px-3 py-1 text-sm ${days === r.days ? "bg-secondary font-medium" : "text-muted-foreground"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" aria-label="Período anterior" onClick={() => setStart(addDaysISO(start, -days))}><ChevronLeft /></Button>
        <Button variant="outline" size="sm" onClick={() => setStart(today)}>Hoje</Button>
        <Button variant="ghost" size="icon" aria-label="Próximo período" onClick={() => setStart(addDaysISO(start, days))}><ChevronRight /></Button>
      </div>

      {suggested.length > 0 && (
        <section className="rounded-lg border bg-panel p-4">
          <h2 className="mb-2 text-sm font-semibold">Sugestões da IA <span className="font-mono text-xs text-muted-foreground">{suggested.length}</span></h2>
          <p className="mb-3 text-xs text-muted-foreground">Compromissos que a IA encontrou nas notas, mas sem certeza. Confirme ou descarte.</p>
          <ul className="divide-y">
            {suggested.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">{e.title}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", ...(e.all_day ? {} : { hour: "2-digit", minute: "2-digit" }) }).format(new Date(e.starts_at))}
                </span>
                <EventActions id={e.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {agenda.size === 0 ? (
        <p className="text-sm text-muted-foreground">Nada marcado neste período. Datas e compromissos que você escrever nas notas aparecem aqui.</p>
      ) : (
        [...agenda.entries()].map(([date, items]) => (
          <section key={date}>
            <h2 className={`mb-2 text-xs font-medium uppercase tracking-wide ${date === today ? "text-primary" : "text-muted-foreground"}`}>
              {date === today ? "Hoje · " : ""}{formatDayBR(date)}
            </h2>
            <AgendaList items={items} />
          </section>
        ))
      )}
    </div>
  );
}

function EventActions({ id }: { id: string }) {
  const qc = useQueryClient();
  const run = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ["events"] });
    } catch {
      toast.error("Não foi possível atualizar o compromisso.");
    }
  };
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Confirmar" onClick={run(() => confirmEvent(id))}><Check /></Button>
      <Button variant="ghost" size="icon" aria-label="Descartar" onClick={run(() => deleteEvent(id))}><X /></Button>
    </>
  );
}
