/** Utilitários da captura externa (Atalhos do iPhone). Sem dependências de servidor: testáveis. */

export const TOKEN_PREFIX = "scb_";
export const PENDING_PROGRESS = "Na fila (Atalho)…";
export const MAX_TEXT = 20000;
export const HOURLY_LIMIT = 60;
export const FILE_LIMITS = { audio: 25 * 1024 * 1024, imagem: 10 * 1024 * 1024, arquivo: 20 * 1024 * 1024 };

/** Token novo: prefixo + 32 bytes aleatórios em base64url. */
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return TOKEN_PREFIX + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** "Bearer scb_..." → token, ou null se o formato não bate. */
export function parseBearer(header: string | null) {
  const m = /^Bearer\s+(scb_[A-Za-z0-9_-]{40,60})$/.exec(header?.trim() ?? "");
  return m?.[1] ?? null;
}

/** Tipo de captura a partir do MIME do arquivo enviado pelo Atalho. */
export function kindFromMime(mime: string): "audio" | "imagem" | "arquivo" | null {
  const m = mime.toLowerCase();
  if (m.startsWith("audio/") || m === "video/mp4" || m === "video/quicktime") return "audio"; // memos de voz chegam como m4a
  if (m.startsWith("image/")) return "imagem";
  if (m === "application/pdf" || m === "text/plain" || m === "text/markdown" || m.includes("wordprocessingml")) return "arquivo";
  return null;
}

export function extFromMime(mime: string, fallback: string) {
  const map: Record<string, string> = {
    "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/aac": "m4a", "video/mp4": "m4a", "video/quicktime": "m4a",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm",
    "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/webp": "webp", "image/gif": "gif",
    "application/pdf": "pdf", "text/plain": "txt", "text/markdown": "md",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  return map[mime.toLowerCase()] ?? fallback;
}

/** Primeiro link http(s) de um texto. */
export function firstUrl(text: string) {
  return text.match(/https?:\/\/[^\s<>"]+/)?.[0] ?? null;
}
