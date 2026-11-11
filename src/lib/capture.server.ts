import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CAPTURE_OK,
  FILE_LIMITS,
  HOURLY_LIMIT,
  MAX_TEXT,
  PENDING_PROGRESS,
  extFromMime,
  firstUrl,
  kindFromMime,
  parseBearer,
  sha256Hex,
} from "./capture-utils";

export type CaptureResult = { status: number; body: { ok: boolean; mensagem: string } };
export type CaptureAuth = { uid: string; tokenId: string };

const fail = (status: number, mensagem: string): CaptureResult => ({ status, body: { ok: false, mensagem } });
const json = (r: CaptureResult) =>
  new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/**
 * Segurança (Atalhos do iPhone e conector do Claude): o token só cria notas do próprio dono.
 * Usa o cliente admin (ignora RLS), por isso toda escrita leva o user_id do token e nada é lido de
 * outros usuários. A IA NÃO roda aqui: a nota fica na fila e é processada com o login do usuário quando o app abre.
 */
export async function authorizeCapture(token: string | null): Promise<CaptureAuth | CaptureResult> {
  if (!token) return fail(401, "Token ausente ou inválido.");
  const { data: tok } = await supabaseAdmin
    .from("capture_tokens")
    .select("id,user_id,revoked_at,scope")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  // Token de agenda só lê a agenda: não serve para criar notas.
  if (!tok || tok.revoked_at || tok.scope !== "captura") return fail(401, "Token inválido ou revogado.");

  // Limite simples por hora, contando as capturas externas (Atalho e conector).
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabaseAdmin
    .from("notes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", tok.user_id)
    .contains("tags", ["atalho"])
    .gte("created_at", since);
  if ((count ?? 0) >= HOURLY_LIMIT) return fail(429, "Muitas capturas nesta hora. Tente mais tarde.");
  return { uid: tok.user_id, tokenId: tok.id };
}

/** Grava a captura (texto, link ou arquivo) na fila de processamento do dono do token. */
export async function storeCapture({ uid, tokenId }: CaptureAuth, rawText: string, file: File | null): Promise<CaptureResult> {
  const text = rawText.trim().slice(0, MAX_TEXT);
  if (!text && !file) return fail(400, "Nada para capturar: envie texto, link ou arquivo.");

  let source_kind: "texto" | "audio" | "imagem" | "arquivo" | "link" = "texto";
  let attachment_path: string | null = null;
  const url = firstUrl(text);
  if (file) {
    const kind = kindFromMime(file.type || "");
    if (!kind) return fail(415, `Tipo de arquivo não aceito (${file.type || "desconhecido"}).`);
    if (file.size > FILE_LIMITS[kind]) return fail(413, "Arquivo grande demais.");
    source_kind = kind;
    attachment_path = `${uid}/${crypto.randomUUID()}.${extFromMime(file.type, kind === "audio" ? "m4a" : "bin")}`;
    const { error } = await supabaseAdmin.storage.from("anexos").upload(attachment_path, file, { contentType: file.type || undefined });
    if (error) return fail(500, "Falha ao guardar o arquivo.");
  } else if (url) source_kind = "link";

  const { error } = await supabaseAdmin.from("notes").insert({
    user_id: uid,
    title: "Processando…",
    content: text,
    source_kind,
    attachment_path,
    source_url: !file && url ? url : null,
    status: "processando",
    progress: PENDING_PROGRESS,
    type: "ideia",
    tags: ["atalho"],
    entities: {},
  });
  if (error) {
    if (attachment_path) await supabaseAdmin.storage.from("anexos").remove([attachment_path]);
    return fail(500, "Não consegui salvar a captura.");
  }
  await supabaseAdmin.from("capture_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenId);
  return { status: 200, body: { ok: true, mensagem: CAPTURE_OK } };
}

/** POST /api/capturar — usado pelos Atalhos do iPhone. */
export async function handleCapture(request: Request) {
  const auth = await authorizeCapture(parseBearer(request.headers.get("authorization")));
  if ("status" in auth) return json(auth);

  let text = "";
  let file: File | null = null;
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      text = [form.get("texto"), form.get("url")].filter((v): v is string => typeof v === "string" && !!v.trim()).join("\n\n");
      const f = form.get("arquivo");
      if (f && typeof f !== "string" && f.size > 0) file = f;
    } else if (type.includes("application/json")) {
      const body = (await request.json()) as { texto?: unknown; url?: unknown };
      text = [body.texto, body.url].filter((v): v is string => typeof v === "string" && !!v.trim()).join("\n\n");
    } else {
      text = await request.text();
    }
  } catch {
    return json(fail(400, "Não consegui ler o conteúdo enviado."));
  }
  return json(await storeCapture(auth, text, file));
}
