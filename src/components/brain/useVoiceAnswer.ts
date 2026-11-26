import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { sniffAudio } from "@/lib/audio-utils";
import { transcribeAnswerFn } from "@/lib/interview.functions";

/** Grava uma resposta falada e devolve o texto transcrito (para a entrevista; não vira captura). */
export function useVoiceAnswer(onText: (t: string) => void) {
  const transcribe = useServerFn(transcribeAnswerFn);
  const rec = useRef<MediaRecorder | null>(null);
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks);
        if (blob.size < 1024) {
          setState("idle");
          toast.error("A gravação ficou vazia. Verifique o microfone.");
          return;
        }
        // Mesma regra da captura: os bytes dizem o formato (no iPhone o MIME vem vazio).
        const sniffed = sniffAudio(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
        const ext = sniffed?.ext ?? ((r.mimeType || "").includes("mp4") ? "m4a" : "webm");
        setState("busy");
        try {
          const b64 = await new Promise<string>((ok, fail) => {
            const fr = new FileReader();
            fr.onload = () => ok(String(fr.result).split(",")[1] ?? "");
            fr.onerror = () => fail(fr.error);
            fr.readAsDataURL(blob);
          });
          const res = await transcribe({ data: { audio: b64, ext } });
          if (res.ok) onText(res.text);
          else toast.error(res.error);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao transcrever.");
        } finally {
          setState("idle");
        }
      };
      r.start(1000);
      rec.current = r;
      setState("rec");
    } catch {
      toast.error("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  }

  const stop = () => rec.current?.stop();
  return { state, start, stop };
}
