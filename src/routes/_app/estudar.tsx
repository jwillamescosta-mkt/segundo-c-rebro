import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { GraduationCap, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrain } from "@/components/brain/app-context";
import { GenerateCardsButton } from "@/components/brain/GenerateCardsButton";
import { Reveal, StaggerItem, StaggerList } from "@/components/brain/motion";
import { StudySession } from "@/components/brain/StudySession";
import { SynthesisBox } from "@/components/brain/SynthesisBox";
import { TypeIcon } from "@/components/brain/type-meta";
import { cardsMetaQuery, dueCardsQuery } from "@/lib/brain";
import { localDate, todayISO } from "@/lib/tasks-utils";

export const Route = createFileRoute("/_app/estudar")({
  head: () => ({ meta: [{ title: "Estudar — Segundo Cérebro" }, { name: "description", content: "Revisão espaçada das suas notas." }] }),
  component: StudyPage,
});

const STUDY_TYPES = new Set(["aprendizado", "conteudo", "referencia"]);

function StudyPage() {
  const today = todayISO();
  const { notes } = useBrain();
  const meta = useQuery(cardsMetaQuery).data ?? [];
  const due = useQuery(dueCardsQuery(today));
  const [session, setSession] = useState(false);
  const [finished, setFinished] = useState<number | null>(null);

  const stats = useMemo(() => {
    const withCards = new Set(meta.map((c) => c.note_id));
    return {
      due: meta.filter((c) => c.due <= today).length,
      reviewedToday: meta.filter((c) => c.last_reviewed_at && localDate(c.last_reviewed_at) === today).length,
      total: meta.length,
      notes: withCards.size,
      withCards,
    };
  }, [meta, today]);
  const toStudy = notes.filter((n) => STUDY_TYPES.has(n.type) && !stats.withCards.has(n.id) && n.status === "pronta").slice(0, 8);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div className="flex items-center gap-2">
        <GraduationCap className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">Estudar</h1>
      </div>

      <Reveal className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Para hoje", stats.due],
          ["Revisados hoje", stats.reviewedToday],
          ["Cards", stats.total],
          ["Notas estudadas", stats.notes],
        ].map(([label, n]) => (
          <div key={label} className="rounded-lg border bg-panel p-3">
            <p className="font-mono text-2xl font-semibold">{n}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </Reveal>

      {session && due.data?.length ? (
        <StudySession
          cards={due.data}
          onDone={(n) => {
            setSession(false);
            setFinished(n);
            due.refetch();
          }}
        />
      ) : finished !== null ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="rounded-xl border bg-panel p-6 text-center">
          <motion.div animate={{ rotate: [0, -12, 12, 0] }} transition={{ duration: 0.8 }} className="mx-auto mb-2 w-fit"><PartyPopper className="size-8 text-primary" /></motion.div>
          <p className="font-medium">Sessão concluída: {finished} revisões.</p>
          <p className="mt-1 text-sm text-muted-foreground">Cada revisão fortalece a memória. Volte amanhã para os próximos.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setFinished(null)}>Ok</Button>
        </motion.div>
      ) : (
        <div className="rounded-xl border bg-panel p-6 text-center">
          {due.data?.length ? (
            <>
              <p className="mb-3 text-sm">Você tem <b>{due.data.length}</b> card{due.data.length > 1 ? "s" : ""} para revisar agora.</p>
              <Button onClick={() => setSession(true)}>Começar revisão</Button>
              <p className="mt-2 text-xs text-muted-foreground">Atalhos: espaço vira o card; 1 a 4 para avaliar.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nada para revisar agora. {stats.total ? "Os próximos cards voltam nos dias marcados." : "Gere flashcards das suas notas abaixo."}</p>
          )}
        </div>
      )}

      <Reveal delay={0.05}>
        <SynthesisBox />
      </Reveal>

      <Reveal delay={0.1}>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notas para transformar em estudo</h2>
        {toStudy.length === 0 ? (
          <p className="text-sm text-muted-foreground">Notas de aprendizado, conteúdo e referência sem flashcards aparecem aqui. Você também pode gerar cards de qualquer nota pelo botão no topo dela.</p>
        ) : (
          <StaggerList className="divide-y rounded-lg border bg-panel">
            {toStudy.map((n) => (
              <StaggerItem key={n.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <TypeIcon type={n.type} />
                <Link to="/nota/$id" params={{ id: n.id }} className="flex-1 truncate hover:text-primary">{n.title}</Link>
                <GenerateCardsButton noteId={n.id} label="Gerar cards" />
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </Reveal>
    </div>
  );
}
