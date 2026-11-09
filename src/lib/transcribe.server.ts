import { GatewayError, transcribeAudio } from "@lovable.dev/ai-gateway";
import { audioMime, describeError } from "./audio-utils";

type Chat = (system: string, parts: unknown[]) => Promise<string>;

const SYSTEM =
  "Você transcreve áudios em português do Brasil com fidelidade. Responda apenas com a transcrição, com pontuação e parágrafos. Não invente conteúdo.";

function b64(buf: ArrayBuffer) {
  return Buffer.from(buf).toString("base64");
}

/**
 * Transcreve um áudio tentando alternativas em sequência até uma funcionar.
 * Falta de créditos (402) e excesso de pedidos (429) interrompem na hora, com a mensagem própria.
 * Se tudo falhar, o erro diz o que cada tentativa respondeu (para o usuário e para quem for corrigir).
 */
export async function transcribeWithFallbacks(buf: ArrayBuffer, ext: string, chat: Chat) {
  const mime = audioMime(ext);
  const file = () => new File([buf], `audio.${ext || "m4a"}`, { type: mime });
  const dedicated = (model: "openai/gpt-4o-transcribe" | "openai/gpt-4o-mini-transcribe" | "google/gemini-3.5-transcribe", extra: Record<string, unknown> = {}) => async () => {
    // O tipo do SDK varia por modelo; todos aceitam `file`, e `language` só os da OpenAI.
    const r = await transcribeAudio({ model, file: file(), ...extra } as never);
    const out = r as unknown as string | { text?: string };
    return (typeof out === "string" ? out : out.text ?? "").trim();
  };
  const viaChatFile = async () =>
    chat(SYSTEM, [
      { type: "text", text: "Transcreva este áudio." },
      { type: "file", file: { file_data: `data:${mime};base64,${b64(buf)}`, filename: `audio.${ext || "m4a"}` } },
    ]);
  const viaChatAudio = async () =>
    chat(SYSTEM, [
      { type: "text", text: "Transcreva este áudio." },
      { type: "input_audio", input_audio: { data: b64(buf), format: ext === "weba" ? "webm" : ext || "webm" } },
    ]);

  const steps: [string, () => Promise<string>][] = [
    ["gpt-4o-transcribe", dedicated("openai/gpt-4o-transcribe", { language: "pt" })],
    ["gemini-transcribe", dedicated("google/gemini-3.5-transcribe")],
    ["gpt-4o-mini-transcribe", dedicated("openai/gpt-4o-mini-transcribe", { language: "pt" })],
    ["chat-arquivo", viaChatFile],
    ["chat-audio", viaChatAudio],
  ];
  // webm (gravação do navegador) já funcionava pelo chat: mantém esse caminho primeiro.
  if (ext === "webm" || ext === "weba") steps.unshift(steps.pop()!);

  const failures: string[] = [];
  for (const [name, run] of steps) {
    try {
      const text = (await run()).trim();
      if (text) return text;
      failures.push(`${name}: resposta vazia`);
    } catch (e) {
      if (e instanceof GatewayError && (e.httpStatus === 402 || e.httpStatus === 429)) throw e;
      console.warn("transcrição falhou:", name, e);
      failures.push(`${name}: ${describeError(e)}`);
    }
  }
  throw new Error(`Não consegui transcrever o áudio (.${ext}). ${failures.join(" | ")}`.slice(0, 600));
}
