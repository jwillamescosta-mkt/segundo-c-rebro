import { generateChatCompletion, GatewayError } from "@lovable.dev/ai-gateway";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { NOTE_TYPE_VALUES, extractHashtags, linkStatusForConfidence, mergeTags, normalizeTitle } from "./markdown-utils";
import { syncWikilinks } from "./wikilink-sync";
import { cleanTime, eventStatusForConfidence, localToTimestamptz } from "./tasks-utils";

const MODEL = "google/gemini-3.8-flash" as const;
const MAX_TEXT = 30000;
type DB = SupabaseClient<Database>;

type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } }
  | { type: "file"; file: { file_data: string; filename: string } };

async function chatText(system: string, parts: Part[]): Promise<string> {
  const res = await generateChatCompletion({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: parts },
    ],
  });
  const c = res.choices?.[0]?.message?.content;
  if (typeof c === "string") return c.trim();
  if (Array.isArray(c)) return c.map((p) => ("text" in p && typeof p.text === "string" ? p.text : "")).join("").trim();
  return "";
}

async function chatTool<T>(system: string, user: string, name: string, parameters: Record<string, unknown>): Promise<T> {
  const res = await generateChatCompletion({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools: [{ type: "function", function: { name, description: name, parameters } }],
    tool_choice: { type: "function", function: { name } },
  });
  const msg = res.choices?.[0]?.message;
  const call = msg?.tool_calls?.[0];
  let args: string | undefined;
  if (call && "function" in call && call.function) args = call.function.arguments;
  if (!args && typeof msg?.content === "string") {
    const m = msg.content.match(/\{[\s\S]*\}/);
    args = m?.[0];
  }
  if (!args) throw new Error("A IA não retornou dados estruturados.");
  return JSON.parse(args) as T;
}

function toB64(buf: ArrayBuffer) {
  return Buffer.from(buf).toString("base64");
}

function ext(path: string) {
  return (path.split(".").pop() ?? "").toLowerCase();
}

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function todayContext() {
  const now = new Date();
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const human = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
  return { iso, human };
}

async function setProgress(db: DB, id: string, progress: string) {
  await db.from("notes").update({ progress, status: "processando", error_message: null }).eq("id", id);
}

async function download(db: DB, path: string) {
  const { data, error } = await db.storage.from("anexos").download(path);
  if (error || !data) throw new Error("Não foi possível ler o anexo.");
  return data.arrayBuffer();
}

function assertPublicUrl(raw: string) {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error("URL inválida.");
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "[::1]"
  )
    throw new Error("Endereço não permitido.");
  return u;
}

function meta(html: string, key: string) {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i");
  const m = html.match(re1) ?? html.match(re2);
  return m ? decodeEntities(m[1]).trim() : null;
}

async function extractLink(url: string) {
  const u = assertPublicUrl(url);
  const res = await fetch(u.toString(), {
    headers: { "user-agent": "Mozilla/5.0 (compatible; SegundoCerebro/1.0)", accept: "text/html,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`O site respondeu com erro ${res.status}.`);
  const html = (await res.text()).slice(0, 2_000_000);
  const title =
    meta(html, "og:title") ?? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim() ?? u.hostname;
  const description = meta(html, "og:description") ?? meta(html, "description");
  let image = meta(html, "og:image");
  if (image) {
    try {
      image = new URL(image, u).toString();
    } catch {
      image = null;
    }
  }
  const main = html.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const text = decodeEntities(
    main
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
  return { title: title || u.hostname, description, image, text };
}

async function extractDocx(buf: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("DOCX inválido.");
  return decodeEntities(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface Analysis {
  title: string;
  summary: string;
  type: string;
  tags: string[];
  tasks: { text: string; due_date: string | null; due_time?: string | null }[];
  events?: { title: string; date: string; start_time: string | null; end_time: string | null; confidence: number }[];
  entities: { pessoas?: string[]; clientes?: string[]; projetos?: string[] };
}

const analysisSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Título curto e claro (até 70 caracteres), em português." },
    summary: { type: "string", description: "Resumo de 2 a 3 frases." },
    type: { type: "string", enum: NOTE_TYPE_VALUES },
    tags: { type: "array", items: { type: "string" }, description: "3 a 6 tags, minúsculas, sem #, sem espaços." },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          due_date: { type: ["string", "null"], description: "Data real YYYY-MM-DD calculada a partir de hoje, ou null." },
          due_time: { type: ["string", "null"], description: "Hora do prazo HH:MM (24h), só se a nota disser a hora; senão null." },
        },
        required: ["text", "due_date", "due_time"],
      },
    },
    events: {
      type: "array",
      description: "Compromissos com data marcada: reuniões, consultas, viagens, aniversários, datas importantes. Prazos de entrega vão em tasks, não aqui.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título curto do compromisso." },
          date: { type: "string", description: "Data real YYYY-MM-DD." },
          start_time: { type: ["string", "null"], description: "Início HH:MM (24h) ou null se for o dia todo." },
          end_time: { type: ["string", "null"], description: "Fim HH:MM (24h) ou null." },
          confidence: { type: "number", minimum: 0, maximum: 1, description: "Certeza de que é um compromisso real com essa data e hora." },
        },
        required: ["title", "date", "start_time", "end_time", "confidence"],
      },
    },
    entities: {
      type: "object",
      properties: {
        pessoas: { type: "array", items: { type: "string" } },
        clientes: { type: "array", items: { type: "string" } },
        projetos: { type: "array", items: { type: "string" } },
      },
    },
  },
  required: ["title", "summary", "type", "tags", "tasks", "entities"],
};

const linksSchema = {
  type: "object",
  properties: {
    links: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          reason: { type: "string", description: "Motivo curto (até 120 caracteres)." },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["id", "reason", "confidence"],
      },
    },
  },
  required: ["links"],
};

function words(s: string) {
  return new Set(
    s
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

export async function runPipeline(db: DB, userId: string, noteId: string, mode: "full" | "reanalyze") {
  const { data: note, error } = await db.from("notes").select("*").eq("id", noteId).single();
  if (error || !note) throw new Error("Nota não encontrada.");

  try {
    let content = note.content ?? "";
    let ogImage = note.og_image;
    let linkTitle: string | null = null;

    if (mode === "full") {
      const userText = content.trim();
      if (note.source_kind === "audio" && note.attachment_path) {
        await setProgress(db, noteId, "Transcrevendo…");
        const buf = await download(db, note.attachment_path);
        const e = ext(note.attachment_path);
        const transcript = await chatText(
          "Você transcreve áudios em português do Brasil com fidelidade. Responda apenas com a transcrição, com pontuação e parágrafos. Não invente conteúdo.",
          [
            { type: "text", text: "Transcreva este áudio." },
            { type: "input_audio", input_audio: { data: toB64(buf), format: e === "weba" ? "webm" : e || "webm" } },
          ],
        );
        if (!transcript) throw new Error("Não foi possível transcrever o áudio.");
        content = (userText ? userText + "\n\n" : "") + "## Transcrição\n\n" + transcript;
      } else if (note.source_kind === "imagem" && note.attachment_path) {
        await setProgress(db, noteId, "Lendo imagem…");
        const buf = await download(db, note.attachment_path);
        const e = ext(note.attachment_path);
        const mime = e === "jpg" ? "image/jpeg" : `image/${e || "png"}`;
        const desc = await chatText(
          "Você descreve imagens em português do Brasil. Responda em markdown com duas seções: '## Descrição' (detalhada) e '## Texto visível' (todo o texto presente na imagem, transcrito fielmente; escreva 'Nenhum' se não houver).",
          [
            { type: "text", text: "Descreva esta imagem e transcreva todo texto visível." },
            { type: "image_url", image_url: { url: `data:${mime};base64,${toB64(buf)}` } },
          ],
        );
        content = (userText ? userText + "\n\n" : "") + desc;
      } else if (note.source_kind === "arquivo" && note.attachment_path) {
        await setProgress(db, noteId, "Extraindo texto…");
        const buf = await download(db, note.attachment_path);
        const e = ext(note.attachment_path);
        let text = "";
        if (e === "pdf") {
          text = await chatText(
            "Extraia todo o texto do documento, preservando a estrutura em markdown simples. Responda apenas com o texto extraído.",
            [
              { type: "text", text: "Extraia o texto deste PDF." },
              { type: "file", file: { file_data: `data:application/pdf;base64,${toB64(buf)}`, filename: "documento.pdf" } },
            ],
          );
        } else if (e === "docx") {
          text = await extractDocx(buf);
        } else {
          text = new TextDecoder().decode(buf);
        }
        text = text.slice(0, MAX_TEXT);
        if (!text.trim()) throw new Error("O arquivo não tem texto legível.");
        content = (userText ? userText + "\n\n" : "") + "## Conteúdo do arquivo\n\n" + text;
      } else if (note.source_kind === "link" && note.source_url) {
        await setProgress(db, noteId, "Lendo página…");
        const page = await extractLink(note.source_url);
        linkTitle = page.title;
        ogImage = page.image;
        content =
          (userText && userText !== note.source_url ? userText + "\n\n" : "") +
          `Fonte: <${note.source_url}>\n\n` +
          (page.description ? `> ${page.description}\n\n` : "") +
          "## Texto da página\n\n" +
          page.text;
      }
      await db.from("notes").update({ content, og_image: ogImage }).eq("id", noteId);
    }

    // Analysis
    await setProgress(db, noteId, "Analisando…");
    const today = todayContext();
    const analysis = await chatTool<Analysis>(
      `Você organiza um segundo cérebro pessoal em português do Brasil. Hoje é ${today.human} (${today.iso}). ` +
        "Analise a nota e devolva título, resumo, tipo, tags, tarefas com datas reais (calcule datas relativas como 'quinta' ou 'amanhã' a partir de hoje; use a próxima ocorrência), compromissos de agenda e entidades. " +
        "Só crie tarefas quando houver uma ação concreta a fazer. Só crie compromissos quando houver data identificável; não invente horários. " +
        "Horários estão no fuso de Brasília.",
      `Título atual: ${note.title}\n${linkTitle ? `Título da página: ${linkTitle}\n` : ""}\nConteúdo:\n${content.slice(0, MAX_TEXT)}`,
      "salvar_analise",
      analysisSchema,
    );

    const type = NOTE_TYPE_VALUES.includes(analysis.type as never) ? analysis.type : note.type;
    const tags = mergeTags(analysis.tags.slice(0, 6), extractHashtags(content), mode === "reanalyze" ? note.tags : []);
    const keepTitle = mode === "reanalyze" && note.title && !/^(Sem título|Processando…?|Nova captura)$/i.test(note.title);
    const title = keepTitle ? note.title : (analysis.title || linkTitle || note.title).slice(0, 120);

    await db
      .from("notes")
      .update({
        title,
        summary: analysis.summary,
        type: note.type === "diario" ? "diario" : type,
        tags,
        entities: analysis.entities ?? {},
      })
      .eq("id", noteId);

    // Tasks: replace pending ones of this note
    await db.from("tasks").delete().eq("note_id", noteId).eq("done", false);
    const validTasks = (analysis.tasks ?? []).filter((t) => t.text?.trim());
    if (validTasks.length) {
      await db.from("tasks").insert(
        validTasks.map((t) => ({
          user_id: userId,
          note_id: noteId,
          text: t.text.trim(),
          due_date: t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
          due_time: t.due_date ? cleanTime(t.due_time) : null,
        })),
      );
    }

    // Events: replace suggestions of this note; keep confirmed ones (user may have accepted them)
    await db.from("events").delete().eq("note_id", noteId).eq("status", "sugerido");
    const { data: kept } = await db.from("events").select("title,starts_at").eq("note_id", noteId);
    const keptKeys = new Set((kept ?? []).map((e) => `${normalizeTitle(e.title)}|${+new Date(e.starts_at)}`));
    const eventRows = (analysis.events ?? []).flatMap((e) => {
      const startTime = cleanTime(e.start_time);
      const starts_at = localToTimestamptz(e.date, startTime);
      if (!starts_at || !e.title?.trim()) return [];
      if (keptKeys.has(`${normalizeTitle(e.title)}|${+new Date(starts_at)}`)) return [];
      const endTime = cleanTime(e.end_time);
      const confidence = Math.max(0, Math.min(1, Number(e.confidence) || 0));
      return [{
        user_id: userId,
        note_id: noteId,
        title: e.title.trim().slice(0, 200),
        starts_at,
        ends_at: startTime && endTime && endTime > startTime ? localToTimestamptz(e.date, endTime) : null,
        all_day: !startTime,
        confidence,
        status: eventStatusForConfidence(confidence),
      }];
    });
    if (eventRows.length) await db.from("events").insert(eventRows);

    // Connections
    await setProgress(db, noteId, "Encontrando conexões…");
    const { data: others } = await db
      .from("notes")
      .select("id,title,summary,tags,content,updated_at")
      .neq("id", noteId)
      .order("updated_at", { ascending: false })
      .limit(1000);
    const myWords = words(`${title} ${analysis.summary} ${content.slice(0, 4000)}`);
    const myTags = new Set(tags);
    const scored = (others ?? []).map((o, i) => {
      const ot = o.tags ?? [];
      const tagScore = ot.filter((t) => myTags.has(t)).length * 3;
      const ow = words(`${o.title} ${o.summary ?? ""} ${(o.content ?? "").slice(0, 600)}`);
      let w = 0;
      for (const x of ow) if (myWords.has(x)) w++;
      return { o, score: tagScore + Math.min(w, 15) + (i < 30 ? 1 : 0) };
    });
    const candidates = scored.sort((a, b) => b.score - a.score).slice(0, 150).map((s) => s.o);

    if (candidates.length) {
      const list = candidates
        .map((c) => JSON.stringify({ id: c.id, titulo: c.title, resumo: (c.summary ?? "").slice(0, 200), tags: c.tags }))
        .join("\n");
      const result = await chatTool<{ links: { id: string; reason: string; confidence: number }[] }>(
        "Você encontra conexões significativas entre notas de um segundo cérebro. Escolha até 6 notas realmente relacionadas à nota principal, com motivo curto em português e confiança de 0 a 1. Não force conexões fracas.",
        `NOTA PRINCIPAL\nTítulo: ${title}\nResumo: ${analysis.summary}\nTags: ${tags.join(", ")}\n\nNOTAS EXISTENTES (uma por linha):\n${list}`,
        "sugerir_ligacoes",
        linksSchema,
      );
      const validIds = new Set(candidates.map((c) => c.id));
      const { data: existing } = await db
        .from("links")
        .select("source_note_id,target_note_id")
        .or(`source_note_id.eq.${noteId},target_note_id.eq.${noteId}`);
      const linked = new Set((existing ?? []).map((l) => (l.source_note_id === noteId ? l.target_note_id : l.source_note_id)));
      const rows = (result.links ?? [])
        .filter((l) => validIds.has(l.id) && !linked.has(l.id))
        .slice(0, 6)
        .map((l) => {
          const confidence = Math.max(0, Math.min(1, Number(l.confidence) || 0));
          return {
            user_id: userId,
            source_note_id: noteId,
            target_note_id: l.id,
            kind: "ia",
            reason: (l.reason ?? "").slice(0, 300),
            confidence,
            status: linkStatusForConfidence(confidence),
          };
        });
      if (rows.length) await db.from("links").insert(rows);
    }

    await syncWikilinks(db, userId, noteId, content);
    await db.from("notes").update({ status: "pronta", progress: null, error_message: null }).eq("id", noteId);
    return { ok: true as const };
  } catch (e) {
    let message = e instanceof Error ? e.message : "Erro desconhecido.";
    if (e instanceof GatewayError) {
      if (e.httpStatus === 402) message = "Créditos de IA esgotados. Adicione créditos e tente de novo.";
      else if (e.httpStatus === 429) message = "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
      else message = "A IA não conseguiu processar esta nota.";
    }
    console.error("processar-nota", noteId, e);
    await db.from("notes").update({ status: "erro", progress: null, error_message: message }).eq("id", noteId);
    return { ok: false as const, error: message };
  }
}

export { normalizeTitle };
