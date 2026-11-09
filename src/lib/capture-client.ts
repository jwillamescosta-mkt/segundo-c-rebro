import { supabase } from "@/integrations/supabase/client";
import { createNote, currentUserId, type Note } from "./brain";

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

/** Envia o anexo (se houver) e cria a nota na fila de processamento. */
export async function saveCapture(text: string, file: File | null): Promise<Note> {
  const t = text.trim();
  const url = t.match(/https?:\/\/[^\s<>"]+/)?.[0] ?? null;
  const uid = await currentUserId();
  let attachment_path: string | null = null;
  let source_kind: Note["source_kind"] = "texto";
  if (file) {
    const k = kindOf(file)!;
    source_kind = k;
    attachment_path = `${uid}/${crypto.randomUUID()}.${fileExt(file, k)}`;
    const { error } = await supabase.storage.from("anexos").upload(attachment_path, file, { contentType: file.type || undefined });
    if (error) throw new Error("Falha ao enviar o arquivo: " + error.message);
  } else if (url) source_kind = "link";
  return createNote({
    title: "Processando…",
    content: t,
    source_kind,
    attachment_path,
    source_url: !file && url ? url : null,
    status: "processando",
    progress: "Na fila…",
    type: "ideia",
    tags: [],
  });
}

/** Erro de rede (sem sinal), e não de validação: vale guardar para enviar depois. */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return e instanceof TypeError || (e instanceof Error && /fetch|network|load failed|conex/i.test(e.message));
}
