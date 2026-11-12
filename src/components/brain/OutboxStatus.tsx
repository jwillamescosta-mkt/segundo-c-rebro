import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AudioLines, Download, FileText, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { OUTBOX_EVENT, listQueued, queuedFile, removeQueued, type QueuedCapture } from "@/lib/offline-queue";
import { useApp } from "./app-context";

function download(it: QueuedCapture) {
  const f = queuedFile(it);
  if (!f) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(f);
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Capturas guardadas neste aparelho que ainda não foram confirmadas pelo servidor. Some quando está tudo enviado. */
export function OutboxStatus() {
  const { flushOutbox } = useApp();
  const [items, setItems] = useState<QueuedCapture[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = () => void listQueued().then(setItems).catch(() => {});
    load();
    window.addEventListener(OUTBOX_EVENT, load);
    return () => window.removeEventListener(OUTBOX_EVENT, load);
  }, []);

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          role="status"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="mt-2 rounded-lg border border-[#ffc46b]/40 bg-[#ffc46b]/5 p-3 text-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-[#ffc46b]" />
              <p className="min-w-0 flex-1">
                <span className="font-medium">
                  {items.length} captura{items.length > 1 ? "s" : ""} guardada{items.length > 1 ? "s" : ""} neste aparelho
                </span>
                <span className="block text-xs text-muted-foreground">Nada se perde: o envio se repete sozinho até dar certo.</span>
              </p>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await flushOutbox();
                  setBusy(false);
                }}
                className="flex shrink-0 items-center gap-1 rounded-md bg-[#ffc46b] px-2.5 py-1 text-xs font-semibold text-[#1a1203] disabled:opacity-60"
              >
                {busy && <Loader2 className="size-3 animate-spin" />} Enviar agora
              </button>
            </div>
            <ul className="mt-2 space-y-1.5">
              {items.map((it) => (
                <li key={it.id} className="flex items-start gap-2 text-xs">
                  {it.file ? <AudioLines className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> : <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{it.text || it.fileName || "Captura"}</span>
                    <span className="text-muted-foreground">
                      {new Date(it.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {it.file ? ` · ${Math.max(1, Math.round(it.file.size / 1024))} KB` : ""}
                    </span>
                    {it.lastError && <span className="block text-destructive">Última tentativa: {it.lastError}</span>}
                  </span>
                  {it.file && (
                    <button onClick={() => download(it)} aria-label="Baixar o arquivo" title="Baixar uma cópia" className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
                      <Download className="size-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => confirm("Descartar esta captura? Ela ainda não foi enviada e será apagada deste aparelho.") && void removeQueued(it.id)}
                    aria-label="Descartar captura"
                    title="Descartar"
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
