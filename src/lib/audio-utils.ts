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

/** Container real pelos primeiros bytes (o iOS às vezes informa MIME vazio e grava MP4/AAC). */
export function sniffAudio(b: Uint8Array): { type: string; ext: string } | null {
  const s = (i: number, t: string) => [...t].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (s(4, "ftyp")) return { type: "audio/mp4", ext: "m4a" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { type: "audio/webm", ext: "webm" };
  if (s(0, "RIFF")) return { type: "audio/wav", ext: "wav" };
  if (s(0, "OggS")) return { type: "audio/ogg", ext: "ogg" };
  return null;
}

/** Descrição curta e segura de um erro, para mostrar ao usuário o que falhou. */
export function describeError(e: unknown) {
  const x = e as { code?: string; httpStatus?: number; message?: string } | null;
  const head = [x?.code, x?.httpStatus].filter(Boolean).join(" ");
  const msg = String(x?.message ?? e ?? "erro desconhecido").replace(/\s+/g, " ").slice(0, 110);
  return head ? `${head}: ${msg}` : msg;
}
