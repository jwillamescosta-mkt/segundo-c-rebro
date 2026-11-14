import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Link2, Loader2, Mic, Paperclip, Send, Square, X, Image as ImageIcon, FileText, AudioLines } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LIMITS, type Note } from "@/lib/brain";
import { kindOf, saveCapture } from "@/lib/capture-client";
import { enqueue, recAppend, recClear } from "@/lib/offline-queue";
import { sniffAudio } from "@/lib/audio-utils";
import { useApp } from "./app-context";

const ACCEPT = "audio/*,image/*,.pdf,.docx,.txt,.md,.markdown";

function fmtSize(b: number) {
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;
}

export function CaptureBox({ variant = "inline", onDone, autoFocus }: { variant?: "inline" | "mobile" | "dialog"; onDone?: () => void; autoFocus?: boolean }) {
  const { runProcess, flushOutbox } = useApp();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  // O fim da gravação dispara o envio a partir de um fecho antigo: lê o texto atual por aqui.
  const textRef = useRef(text);
  textRef.current = text;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // iOS pausa o microfone sem avisar ao travar a tela/trocar de app: fecha e guarda o que já foi gravado.
  useEffect(() => {
    if (!recording) return;
    const stop = () => {
      recRef.current?.stop();
      setRecording(false);
      toast.info("Gravação encerrada e guardada porque você saiu do app.");
    };
    const onVis = () => document.visibilityState === "hidden" && stop();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", stop);
    };
  }, [recording]);

  function pick(f: File) {
    const k = kindOf(f);
    if (!k) return toast.error("Formato não suportado. Use áudio, imagem, PDF, DOCX, TXT ou MD.");
    const limit = LIMITS[k];
    if (f.size > limit) return toast.error(`Arquivo muito grande (${fmtSize(f.size)}). Limite para ${k === "audio" ? "áudio" : k === "imagem" ? "imagens" : "arquivos"}: ${fmtSize(limit)}.`);
    setFile(f);
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      await recClear();
      // Cada pedaço vai também para o disco: se o app fechar no meio da gravação, o áudio é recuperado ao abrir.
      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        chunks.current.push(e.data);
        void recAppend(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const raw = new Blob(chunks.current);
        // Mínimo de ~1 KB: abaixo disso o microfone foi mudo/cortado pelo sistema.
        if (raw.size < 1024) return void toast.error("A gravação ficou vazia ou sem som. Verifique o microfone e tente de novo.");
        // Os bytes mandam mais que o MIME informado: no iPhone ele vem vazio e o conteúdo é MP4/AAC.
        const sniffed = sniffAudio(new Uint8Array(await raw.slice(0, 16).arrayBuffer()));
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const type = sniffed?.type ?? (rec.mimeType || (ios ? "audio/mp4" : "audio/webm"));
        const ext = sniffed?.ext ?? (type.includes("mp4") ? "m4a" : "webm");
        const blob = new Blob(chunks.current, { type });
        // Gravou, guardou: a gravação vai direto para a caixa de saída (sem depender de mais um toque).
        void submit(new File([blob], `gravacao-${Date.now()}.${ext}`, { type })).then(() => recClear());
      };
      rec.start(1000);
      recRef.current = rec;
      setSeconds(0);
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  }

  function stopRec() {
    recRef.current?.stop();
    setRecording(false);
  }

  /**
   * Blindagem: a captura é gravada no aparelho ANTES de qualquer envio e a caixa é liberada na hora.
   * O envio acontece em segundo plano e se repete até o servidor confirmar (ver offline-queue.ts).
   */
  async function submit(recorded?: File) {
    if (busy && !recorded) return;
    const f = recorded ?? file;
    const t = textRef.current.trim();
    if (!f && !t) return void toast.error("Escreva algo, grave um áudio ou anexe um arquivo.");
    setBusy(true);
    try {
      await enqueue(t, f);
    } catch {
      // Sem armazenamento no aparelho (ex.: aba anônima): envia direto e, se falhar, mantém tudo na caixa.
      try {
        const note = await saveCapture(t, f);
        qc.setQueryData<Note[]>(["notes"], (old) => [note, ...(old ?? []).filter((n) => n.id !== note.id)]);
        setText("");
        setFile(null);
        toast.success("Capturado! A IA está organizando.");
        onDone?.();
        void runProcess(note.id, "full");
      } catch (e) {
        if (recorded) setFile(recorded); // não perde a gravação: fica na caixa para tentar de novo
        toast.error(e instanceof Error ? e.message : "Não foi possível capturar. Seu conteúdo continua aqui.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setText("");
    setFile(null);
    setBusy(false);
    onDone?.();
    toast.success(navigator.onLine === false ? "Guardado no aparelho. Envio assim que a internet voltar." : "Guardado. Enviando para o seu cérebro…");
    void flushOutbox();
  }

  const FileIcon = file ? (kindOf(file) === "audio" ? AudioLines : kindOf(file) === "imagem" ? ImageIcon : FileText) : Paperclip;
  const isMobile = variant === "mobile";

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-panel transition-colors",
        dragging && "border-primary bg-accent/40",
        isMobile && "border-0 bg-transparent",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) pick(f);
      }}
    >
      {isMobile && (
        <div className="flex flex-col items-center gap-3 py-8">
          <button
            type="button"
            onClick={recording ? stopRec : startRec}
            className={cn(
              "flex size-28 items-center justify-center rounded-full border-2 transition-colors",
              recording ? "animate-rec border-destructive bg-destructive text-destructive-foreground" : "border-primary bg-primary text-primary-foreground",
            )}
            aria-label={recording ? "Parar gravação" : "Gravar áudio"}
          >
            {recording ? <Square className="size-10" /> : <Mic className="size-12" strokeWidth={1.5} />}
          </button>
          <p className="font-mono text-sm text-muted-foreground">
            {recording ? `Gravando ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Toque para gravar"}
          </p>
        </div>
      )}
      <div className={cn(isMobile && "rounded-lg border bg-panel")}>
        <textarea
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const f = Array.from(e.clipboardData.files)[0];
            if (f) {
              e.preventDefault();
              pick(f);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={isMobile ? 3 : variant === "dialog" ? 5 : 2}
          placeholder="Capture uma ideia, cole um link ou uma imagem, arraste um arquivo…"
          className="block w-full resize-none bg-transparent px-3 pt-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        {file && (
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs">
            {preview ? <img src={preview} alt="" className="size-10 rounded object-cover" /> : <FileIcon className="size-4 text-primary" />}
            <span className="truncate">{file.name}</span>
            <span className="font-mono text-muted-foreground">{fmtSize(file.size)}</span>
            <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setFile(null)} aria-label="Remover anexo">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1 px-2 pb-2">
          {!isMobile && (
            <Button
              type="button"
              size="sm"
              variant={recording ? "destructive" : "ghost"}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={recording ? stopRec : startRec}
            >
              {recording ? <Square className="size-3.5" /> : <Mic className="size-3.5" />}
              {recording ? <span className="font-mono">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</span> : "Gravar"}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={() => inputRef.current?.click()}>
            <FileUp className="size-3.5" /> Anexar
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
              e.target.value = "";
            }}
          />
          {/https?:\/\//.test(text) && !file && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link2 className="size-3.5" /> link detectado
            </span>
          )}
          <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">Ctrl+Enter</span>
          <Button type="button" size="sm" className="h-7 gap-1.5 px-3 text-xs" onClick={() => submit()} disabled={busy || recording}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Capturar
          </Button>
        </div>
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg text-sm font-medium text-primary">
          Solte para anexar
        </div>
      )}
    </div>
  );
}
