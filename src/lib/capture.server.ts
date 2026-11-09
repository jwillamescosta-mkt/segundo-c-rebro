import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
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

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/**
 * POST /api/capturar — usado pelos Atalhos do iPhone.
 * Segurança: o token só cria notas do próprio dono. Usa o cliente admin (ignora RLS), por isso
 * toda escrita leva o user_id do token e nada é lido de outros usuários. A IA NÃO roda aqui:
 * a nota fica na fila e é processada com o login do usuário quando o app abre.
 */
export async function handleCapture(request: Request) {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return json(401, { ok: false, mensagem: "Token ausente ou inválido." });

  const { data: tok } = await supabaseAdmin
    .from("capture_tokens")
    .select("id,user_id,revoked_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!tok || tok.revoked_at) return json(401, { ok: false, mensagem: "Token inválido ou revogado." });
  const uid = tok.user_id;

  // Limite simples por hora, contando as capturas feitas por Atalho.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabaseAdmin
    .from("notes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .contains("tags", ["atalho"])
    .gte("created_at", since);
  if ((count ?? 0) >= HOURLY_LIMIT) return json(429, { ok: false, mensagem: "Muitas capturas nesta hora. Tente mais tarde." });

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
    return json(400, { ok: false, mensagem: "Não consegui ler o conteúdo enviado." });
  }
  text = text.trim().slice(0, MAX_TEXT);
  if (!text && !file) return json(400, { ok: false, mensagem: "Nada para capturar: envie texto, link ou arquivo." });

  let source_kind: "texto" | "audio" | "imagem" | "arquivo" | "link" = "texto";
  let attachment_path: string | null = null;
  const url = firstUrl(text);
  if (file) {
    const kind = kindFromMime(file.type || "");
    if (!kind) return json(415, { ok: false, mensagem: `Tipo de arquivo não aceito (${file.type || "desconhecido"}).` });
    if (file.size > FILE_LIMITS[kind]) return json(413, { ok: false, mensagem: "Arquivo grande demais." });
    source_kind = kind;
    attachment_path = `${uid}/${crypto.randomUUID()}.${extFromMime(file.type, kind === "audio" ? "m4a" : "bin")}`;
    const { error } = await supabaseAdmin.storage.from("anexos").upload(attachment_path, file, { contentType: file.type || undefined });
    if (error) return json(500, { ok: false, mensagem: "Falha ao guardar o arquivo." });
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
    return json(500, { ok: false, mensagem: "Não consegui salvar a captura." });
  }
  await supabaseAdmin.from("capture_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tok.id);
  return json(200, { ok: true, mensagem: "Capturado no seu Segundo Cérebro ✓" });
}
