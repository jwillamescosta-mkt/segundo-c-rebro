import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { topicByKey } from "./core-utils";

// ~10 MB de áudio em base64: cobre uns 10 minutos de fala gravada no navegador.
const MAX_AUDIO_B64 = 14_000_000;
const AUDIO_EXT = ["webm", "weba", "m4a", "mp4", "mp3", "wav", "ogg", "aac"];

const topicKey = (k: unknown) => {
  if (typeof k !== "string" || !topicByKey(k)) throw new Error("Tema desconhecido.");
  return k;
};

/** "entrevista": transcreve uma resposta falada. */
export const transcribeAnswerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { audio: string; ext: string }) => {
    const audio = typeof d?.audio === "string" ? d.audio : "";
    if (!audio) throw new Error("Áudio vazio.");
    if (audio.length > MAX_AUDIO_B64)
      throw new Error("Áudio muito longo. Grave respostas de até uns 10 minutos.");
    const ext = AUDIO_EXT.includes(d.ext) ? d.ext : "webm";
    return { audio, ext };
  })
  .handler(async ({ data }) => {
    const { transcribeAnswer } = await import("./interview.server");
    return transcribeAnswer(data.audio, data.ext);
  });

/** "entrevista": monta a prévia da nota-núcleo de um tema (não grava). */
export const draftCoreNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; answer: string }) => {
    const answer = typeof d?.answer === "string" ? d.answer.trim() : "";
    if (answer.length < 10) throw new Error("Responda um pouco mais antes de gerar a nota.");
    return { key: topicKey(d.key), answer: answer.slice(0, 15000) };
  })
  .handler(async ({ data, context }) => {
    const { draftCoreNote } = await import("./interview.server");
    return draftCoreNote(context.supabase, data.key, data.answer);
  });

/** "entrevista": grava a nota-núcleo aprovada pelo usuário. */
export const saveCoreNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; content: string; summary: string }) => {
    const content = typeof d?.content === "string" ? d.content.trim() : "";
    if (!content) throw new Error("A nota está vazia.");
    if (content.length > 20000) throw new Error("Nota muito longa (máximo de 20.000 caracteres).");
    const summary = typeof d.summary === "string" ? d.summary.trim().slice(0, 400) : "";
    return { key: topicKey(d.key), content, summary };
  })
  .handler(async ({ data, context }) => {
    const { saveCoreNote } = await import("./interview.server");
    return saveCoreNote(context.supabase, context.userId, data.key, data.content, data.summary);
  });
