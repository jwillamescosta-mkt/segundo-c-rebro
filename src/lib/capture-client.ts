import { supabase } from "@/integrations/supabase/client";
import { createNote, currentUserId, getNote, type Note } from "./brain";

export type Kind = "audio" | "imagem" | "arquivo";
const DOC_EXT = ["pdf", "docx", "txt", "md", "markdown"];

export function kindOf(file: File): Kind | null {
  const e = (file.name.split(".").pop() ?? "").toLowerCase();
  if (file.type.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "webm", "aac", "flac"].includes(e)) return "audio";
  if (file.type.startsWith("image/")) return "imagem";
  if (DOC_EXT.includes(e)) return "arquivo";
  return null;
}

export function fileExt(file: File, kind: Kind) {
  const e = (file.name.split(".").pop() ?? "").toLowerCase();
  if (e && e !== file.name.toLowerCase()) return e === "markdown" ? "md" : e;
  if (kind === "imagem") return file.type.split("/")[1] ?? "png";
  if (kind === "audio") return file.type.includes("mp4") ? "m4a" : "webm";
  return "txt";
}

/** Rede lenta não pode travar o envio para sempre: depois do limite, falha e a caixa de saída tenta de novo. */
export function withTimeout<T>(p: PromiseLike<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Tempo esgotado ao ${what} (rede lenta). Vou tentar de novo.`)), ms);
    Promise.resolve(p).then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/**
 * Envia o anexo (se houver) e cria a nota na fila de processamento.
 * `id` vem da caixa de saída e é o id da nota: repetir o envio (resposta perdida, app fechado no meio)
 * regrava o mesmo arquivo e encontra a mesma nota, sem duplicar.
 */
export async function saveCapture(text: string, file: File | null, id: string = crypto.randomUUID()): Promise<Note> {
  const t = text.trim();
  const url = t.match(/https?:\/\/[^\s<>"]+/)?.[0] ?? null;
  const uid = await currentUserId();
  let attachment_path: string | null = null;
  let source_kind: Note["source_kind"] = "texto";
  if (file) {
    const k = kindOf(file) ?? "arquivo";
    source_kind = k;
    attachment_path = `${uid}/${id}.${fileExt(file, k)}`;
    const { error } = await withTimeout(
      supabase.storage.from("anexos").upload(attachment_path, file, { contentType: file.type || undefined, upsert: true }),
      120_000,
      "enviar o arquivo",
    );
    if (error) throw new Error("Falha ao enviar o arquivo: " + error.message);
  } else if (url) source_kind = "link";
  try {
    return await withTimeout(
      createNote({
        id,
        title: "Processando…",
        content: t,
        source_kind,
        attachment_path,
        source_url: !file && url ? url : null,
        status: "processando",
        progress: "Na fila…",
        type: "ideia",
        tags: [],
      }),
      30_000,
      "salvar a nota",
    );
  } catch (e) {
    // Já existe (um envio anterior chegou ao servidor, mas a confirmação se perdeu): usa a nota que está lá.
    if ((e as { code?: string } | null)?.code === "23505") {
      const existing = await getNote(id);
      if (existing) return existing;
    }
    throw e;
  }
}

/** Erro de rede (sem sinal), e não de validação: vale guardar para enviar depois. */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return e instanceof TypeError || (e instanceof Error && /fetch|network|load failed|conex/i.test(e.message));
}
