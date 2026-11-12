import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, GraduationCap, Smartphone, Sparkles, Unlink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cardsMetaQuery } from "@/lib/brain";
import { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { AgendaList } from "@/components/brain/AgendaList";
import { ConnectionSpark } from "@/components/brain/ConnectionSpark";
import { BriefingButtons } from "@/components/brain/BriefingButtons";
import { SmartPassCard } from "@/components/brain/SmartPassCard";
import { Reveal, StaggerItem, StaggerList } from "@/components/brain/motion";
import { addDaysISO, buildAgenda, formatDayBR, todayISO } from "@/lib/tasks-utils";
import { CaptureBox } from "@/components/brain/CaptureBox";
import { OutboxStatus } from "@/components/brain/OutboxStatus";
import { BrainPulse } from "@/components/brain/BrainPulse";
import { brainPulse } from "@/lib/pulse-utils";
import { useAuth } from "@/hooks/use-auth";
import { orphanNotes, useBrain } from "@/components/brain/app-context";
import { TypeIcon } from "@/components/brain/type-meta";

export const Route = createFileRoute("/_app/inicio")({
  head: () => ({ meta: [{ title: "Início — Segundo Cérebro" }, { name: "description", content: "Capture e reencontre ideias." }] }),
  component: Home,
});

function Home() {
  const { notes, links, tasks, events, byId } = useBrain();
  const isMobile = useIsMobile();
  const flash = useMemo(() => {
    const now = Date.now();
    const recent = notes.filter((n) => now - +new Date(n.created_at) < 3 * 864e5);
    const old = new Set(notes.filter((n) => now - +new Date(n.created_at) > 14 * 864e5).map((n) => n.id));
    for (const r of recent) {
      for (const l of links) {
        if (l.status === "rejeitada") continue;
        const o = l.source_note_id === r.id ? l.target_note_id : l.target_note_id === r.id ? l.source_note_id : null;
        if (o && old.has(o)) return { note: byId.get(o)!, from: r, reason: l.reason ?? "Ligada a uma captura recente" };
      }
      const t = notes.find((n) => old.has(n.id) && n.tags.some((x) => r.tags.includes(x)));
      if (t) return { note: t, from: r, reason: `Tags em comum: ${t.tags.filter((x) => r.tags.includes(x)).join(", ")}` };
    }
    return null;
  }, [notes, links, byId]);
  const today = todayISO();
  const pulse = useMemo(() => brainPulse(notes, today), [notes, today]);
  const accepted = useMemo(() => links.filter((l) => l.status === "aceita").length, [links]);
  const { user } = useAuth();
  const fullName = (user?.user_metadata as { full_name?: string; name?: string } | undefined);
  const firstName = (fullName?.full_name ?? fullName?.name ?? "").trim().split(/\s+/)[0] || null;
  const upcoming = buildAgenda(tasks.filter((t) => !t.done), events.filter((e) => e.status === "confirmado"), today, addDaysISO(today, 2));
  const dueCards = (useQuery(cardsMetaQuery).data ?? []).filter((c) => c.due <= today).length;
  const overdue =tasks.filter((t) => !t.done && t.due_date && t.due_date < today).length;
  const orphans = orphanNotes(notes, links).slice(0, 12);
  const recent = notes.slice(0, 8);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <BrainPulse name={firstName} total={notes.length} connections={accepted} pulse={pulse} />
      <div>
        <CaptureBox variant={isMobile ? "mobile" : "inline"} />
        <OutboxStatus />
      </div>
      <Reveal>
        <div className="mb-2"><SmartPassCard /></div>
        <BriefingButtons />
        <Link to="/atalhos" className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary md:hidden">
          <Smartphone className="size-3.5" /> Capturar pelo Botão de Ação, Siri e Compartilhar
        </Link>
      </Reveal>
      <Reveal className={flash ? "spark-card rounded-lg" : "rounded-lg"}>
      <section className="rounded-lg border bg-panel p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Lampejo do dia</h2>
        {flash ? (
          <div>
            <ConnectionSpark from={flash.from} to={flash.note} />
            <p className="mt-3 text-sm text-muted-foreground">{flash.note.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">Por quê: {flash.reason}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Quando você tiver notas com mais de 14 dias, uma delas relacionada ao que capturou recentemente aparece aqui.</p>
        )}
      </section>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="size-3" /> Hoje e próximos dias
          <Link to="/agenda" className="ml-auto normal-case tracking-normal text-primary">Ver agenda</Link>
        </h2>
        {dueCards > 0 && (
          <Link to="/estudar" className="mb-2 flex items-center gap-1.5 text-sm text-primary">
            <GraduationCap className="size-4" /> {dueCards} flashcard{dueCards > 1 ? "s" : ""} para revisar hoje
          </Link>
        )}
        {overdue > 0 && (
          <Link to="/tarefas" className="mb-2 block text-sm text-destructive">{overdue} tarefa{overdue > 1 ? "s" : ""} atrasada{overdue > 1 ? "s" : ""}</Link>
        )}
        {upcoming.size === 0 ? <p className="text-sm text-muted-foreground">Nada marcado para os próximos 3 dias.</p> : (
          <div className="space-y-3">{[...upcoming.entries()].map(([date, items]) => (
            <div key={date}>
              <p className="mb-1 text-xs text-muted-foreground">{date === today ? "Hoje" : formatDayBR(date)}</p>
              <AgendaList items={items} />
            </div>
          ))}</div>
        )}
      </Reveal>
      <Reveal delay={0.16} className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recentes</h2>
          <StaggerList className="space-y-1">{recent.map((n) => (
            <StaggerItem key={n.id}><Link to="/nota/$id" params={{ id: n.id }} className="flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-secondary"><TypeIcon type={n.type} /><span className="truncate">{n.title}</span></Link></StaggerItem>
          ))}</StaggerList>
        </section>
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Unlink className="size-3" /> Notas órfãs</h2>
          {orphans.length === 0 ? <p className="text-sm text-muted-foreground">Tudo conectado.</p> : (
            <StaggerList className="space-y-1">{orphans.map((n) => (
              <StaggerItem key={n.id}><Link to="/nota/$id" params={{ id: n.id }} className="flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-secondary"><TypeIcon type={n.type} /><span className="truncate">{n.title}</span></Link></StaggerItem>
            ))}</StaggerList>
          )}
        </section>
      </Reveal>
    </div>
  );
}
