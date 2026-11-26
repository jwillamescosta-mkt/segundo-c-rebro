import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildBrainMap } from "./brain-map";
import { coreContext } from "./core-context.server";
import type { Reader } from "./mcp-utils";
import { addDaysISO, formatDateBR, localDate, localTime } from "./tasks-utils";

/**
 * Leitura do conector MCP (token com escopo "leitura"). Usa o cliente admin, que ignora RLS:
 * TODA consulta aqui filtra pelo dono do token. Devolve só resumos, para gastar pouco contexto.
 */
export function mcpReader(uid: string): Reader {
  const notes = () =>
    supabaseAdmin.from("notes").select("id,title,type,tags,summary").eq("user_id", uid);
  return {
    async contexto() {
      return (
        (await coreContext(supabaseAdmin, uid)) ||
        'O núcleo ainda está vazio. Peça ao usuário para usar "Montar meu cérebro" no app.'
      );
    },
    async mapa() {
      const [{ data: n }, { data: l }] = await Promise.all([
        notes().limit(5000),
        supabaseAdmin
          .from("links")
          .select("source_note_id,target_note_id,status")
          .eq("user_id", uid)
          .eq("status", "aceita")
          .limit(20000),
      ]);
      return buildBrainMap(n ?? [], l ?? []);
    },
    async buscar(q) {
      // search_notes usa auth.uid(), que não existe no cliente admin: busca por título, resumo e tags.
      // Tira os caracteres que têm significado no filtro do PostgREST e no LIKE.
      const term = q
        .replace(/[%_,()\\"{}]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
      if (!term) return "Informe o que buscar.";
      const tag = term.toLocaleLowerCase("pt-BR").replace(/\s+/g, "-");
      const { data } = await notes()
        .or(`title.ilike."%${term}%",summary.ilike."%${term}%",tags.cs.{${tag}}`)
        .order("updated_at", { ascending: false })
        .limit(15);
      if (!data?.length) return `Nada encontrado para "${term}".`;
      return data
        .map(
          (n) =>
            `- ${n.title} (id ${n.id}; ${n.type}${n.tags.length ? `; #${n.tags.join(" #")}` : ""}): ${n.summary ?? ""}`,
        )
        .join("\n");
    },
    async ler(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data } = await supabaseAdmin
        .from("notes")
        .select("title,type,tags,summary,content,source_url,updated_at")
        .eq("user_id", uid)
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return [
        `# ${data.title}`,
        `Tipo: ${data.type} · Tags: ${data.tags.join(", ") || "-"} · Atualizada em ${formatDateBR(data.updated_at)}`,
        data.source_url ? `Fonte: ${data.source_url}` : null,
        data.summary ? `Resumo: ${data.summary}` : null,
        "",
        data.content.slice(0, 12000),
      ]
        .filter((l) => l !== null)
        .join("\n");
    },
    async agenda(dias) {
      const today = localDate(new Date().toISOString()); // data de Brasília (o servidor roda em UTC)
      const until = addDaysISO(today, Math.min(Math.max(dias, 1), 30));
      const [{ data: tasks }, { data: events }] = await Promise.all([
        supabaseAdmin
          .from("tasks")
          .select("text,due_date,due_time")
          .eq("user_id", uid)
          .eq("done", false)
          .lte("due_date", until)
          .order("due_date")
          .limit(80),
        supabaseAdmin
          .from("events")
          .select("title,starts_at,all_day")
          .eq("user_id", uid)
          .eq("status", "confirmado")
          .gte("starts_at", `${today}T00:00:00-03:00`)
          .lte("starts_at", `${until}T23:59:59-03:00`)
          .order("starts_at")
          .limit(80),
      ]);
      const lines = [
        ...(tasks ?? []).map(
          (t) =>
            `- Tarefa${t.due_date! < today ? " (ATRASADA)" : ""}: ${t.text} — ${formatDateBR(t.due_date!)}${t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""}`,
        ),
        ...(events ?? []).map(
          (e) =>
            `- Compromisso: ${e.title} — ${formatDateBR(localDate(e.starts_at))}${e.all_day ? "" : ` ${localTime(e.starts_at)}`}`,
        ),
      ];
      return lines.length ? lines.join("\n") : "Nada marcado nesse período.";
    },
  };
}
