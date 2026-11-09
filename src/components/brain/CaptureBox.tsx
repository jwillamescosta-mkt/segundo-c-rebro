import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileUp, Link2, Loader2, Mic, Paperclip, Send, Square, X, Image as ImageIcon, FileText, AudioLines } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LIMITS, type Note } from "@/lib/brain";
import { isNetworkError, kindOf, saveCapture } from "@/lib/capture-client";
import { enqueue } from "@/lib/offline-queue";
import { useApp } from "./app-context";

const ACCEPT = "audio/*,image/*,.pdf,.docx,.txt,.md,.markdown";

function fmtSize(b: number) {
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;
}

export function CaptureBox({ variant = "inline", onDone, autoFocus }: { variant?: "inline" | "mobile" | "dialog"; onDone?: () => void; autoFocus?: boolean }) {
  const { runProcess } = useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
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
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        const ext = type.includes("mp4") ? "m4a" : "webm";
        pick(new File([blob], `gravacao-${Date.now()}.${ext}`, { type }));
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

  async function submit() {
    if (busy) return;
    const t = text.trim();
    if (!file && !t) return toast.error("Escreva algo, grave um áudio ou anexe um arquivo.");
    setBusy(true);
    try {
      const note = await saveCapture(t, file);
      qc.setQueryData<Note[]>(["notes"], (old) => [note, ...(old ?? []).filter((n) => n.id !== note.id)]);
      setText("");
      setFile(null);
      toast.success("Capturado! A IA está organizando.", {
        action: { label: "Abrir", onClick: () => navigate({ to: "/nota/$id", params: { id: note.id } }) },
      });
      onDone?.();
      void runProcess(note.id, "full");
    } catch (e) {
      if (isNetworkError(e)) {
        // Sem sinal: guarda no aparelho e envia sozinho quando a internet voltar.
        try {
          await enqueue(t, file);
          setText("");
          setFile(null);
          toast.success("Sem internet: guardado no aparelho. Envio automático quando a conexão voltar.");
          onDone?.();
          return;
        } catch {
          /* IndexedDB indisponível: cai no erro normal */
        }
      }
      toast.error(e instanceof Error ? e.message : "Não foi possível capturar.");
    } finally {
      setBusy(false);
    }
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
          <Button type="button" size="sm" className="h-7 gap-1.5 px-3 text-xs" onClick={submit} disabled={busy || recording}>
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
