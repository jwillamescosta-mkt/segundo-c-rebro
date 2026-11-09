import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookmarkPlus, BrainCircuit, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/brain/Markdown";
import { EASE } from "@/components/brain/motion";
import { TypeIcon } from "@/components/brain/type-meta";
import { askBrainFn } from "@/lib/ask.functions";
import { createNote, saveNoteContent } from "@/lib/brain";

export const Route = createFileRoute("/_app/perguntar")({
  head: () => ({ meta: [{ title: "Perguntar — Segundo Cérebro" }, { name: "description", content: "Pergunte ao seu segundo cérebro." }] }),
  component: AskPage,
});

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string; type: string }[];
  error?: boolean;
}

const KEY = "sc-perguntar";
const STARTERS = [
  "Quais são minhas prioridades para hoje e esta semana?",
  "O que eu aprendi recentemente? Faça um resumo.",
  "Que ideias minhas poderiam se conectar e virar um projeto?",
  "Monte um plano de estudo com base nas minhas notas.",
];

function load(): Msg[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function AskPage() {
  const ask = useServerFn(askBrainFn);
  const qc = useQueryClient();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMsgs(load()), []);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30)));
    } catch {
      /* armazenamento indisponível: a conversa só não sobrevive à navegação */
    }
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history = msgs.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    try {
      const r = await ask({ data: { question: q, history } });
      setMsgs((m) => [...m, r.ok ? { role: "assistant", content: r.answer, sources: r.sources } : { role: "assistant", content: r.error, error: true }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Falha ao perguntar.", error: true }]);
    } finally {
      setBusy(false);
      ta.current?.focus();
    }
  }

  async function saveAsNote(i: number) {
    const answer = msgs[i];
    const question = [...msgs.slice(0, i)].reverse().find((m) => m.role === "user")?.content ?? "Pergunta";
    if (!answer) return;
    try {
      const title = question.length > 80 ? question.slice(0, 78) + "…" : question;
      const content = `# ${title}\n\n> ${question}\n\n${answer.content}\n\n#pergunta`;
      const n = await createNote({ title, content, type: "aprendizado", tags: ["pergunta"], status: "pronta" });
      await saveNoteContent(n, { content }); // cria as ligações dos [[wikilinks]] citados
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["links"] });
      toast.success("Resposta salva como nota, ligada às fontes.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col p-4 md:p-8">
      <div className="mb-4 flex items-center gap-2">
        <BrainCircuit className="size-5 text-primary" />
        <h1 className="mr-auto text-xl font-semibold">Pergunte ao seu cérebro</h1>
        {msgs.length > 0 && (
          <button onClick={() => setMsgs([])} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
            <RotateCcw className="size-3" /> Nova conversa
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4">
        {msgs.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE, duration: 0.5 }} className="py-6">
            <p className="mb-4 text-sm text-muted-foreground">
              Respostas baseadas nas suas notas, com as fontes citadas. Pergunte sobre o que você sabe, peça resumos, planos de estudo ou prioridades.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s, i) => (
                <motion.button
                  key={s}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: 0.1 + i * 0.06, ease: EASE } }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => send(s)}
                  className="rounded-lg border bg-panel p-3 text-left text-sm transition-colors hover:border-primary"
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground" : "max-w-full"}
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap">{m.content}</p>
              ) : m.error ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{m.content}</p>
              ) : (
                <div className="rounded-lg border bg-panel p-4">
                  <Markdown content={m.content} />
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                    {m.sources?.map((s) => (
                      <Link key={s.id} to="/nota/$id" params={{ id: s.id }} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:border-primary hover:text-primary">
                        <TypeIcon type={s.type} /> {s.title}
                      </Link>
                    ))}
                    <button onClick={() => saveAsNote(i)} className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
                      <BookmarkPlus className="size-3" /> Salvar como nota
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {busy && <Thinking />}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 mt-4 flex items-end gap-2 rounded-xl border bg-panel p-2 shadow-sm focus-within:border-primary"
      >
        <textarea
          ref={ta}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Pergunte qualquer coisa sobre suas notas…"
          aria-label="Pergunta"
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        <motion.button
          type="submit"
          disabled={busy || !input.trim()}
          whileTap={{ scale: 0.9 }}
          aria-label="Enviar pergunta"
          className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </motion.button>
      </form>
    </div>
  );
}

/** Três "neurônios" disparando enquanto a IA pensa. */
function Thinking() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-2 rounded-full bg-primary"
            animate={{ scale: [1, 1.6, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </span>
      Conectando suas notas…
    </motion.div>
  );
}
