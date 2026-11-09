/** MIME de áudio a partir da extensão do arquivo (o iPhone grava m4a, o Chrome grava webm). */
export function audioMime(ext: string) {
  const e = ext.toLowerCase();
  if (e === "m4a" || e === "mp4" || e === "aac") return e === "aac" ? "audio/aac" : "audio/mp4";
  if (e === "mp3" || e === "mpeg") return "audio/mpeg";
  if (e === "wav") return "audio/wav";
  if (e === "webm" || e === "weba") return "audio/webm";
  if (e === "ogg") return "audio/ogg";
  if (e === "flac") return "audio/flac";
  return "audio/mpeg";
}

/** Descrição curta e segura de um erro, para mostrar ao usuário o que falhou. */
export function describeError(e: unknown) {
  const x = e as { code?: string; httpStatus?: number; message?: string } | null;
  const head = [x?.code, x?.httpStatus].filter(Boolean).join(" ");
  const msg = String(x?.message ?? e ?? "erro desconhecido").replace(/\s+/g, " ").slice(0, 110);
  return head ? `${head}: ${msg}` : msg;
}
