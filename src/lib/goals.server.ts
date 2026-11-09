import { GatewayError } from "@lovable.dev/ai-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatTool, todayContext } from "./pipeline.server";
import { askTerms } from "./ask-utils";
import { goalProgress } from "./goals-utils";

type DB = SupabaseClient<Database>;

export interface ActionSuggestion {
  text: string;
  due_date: string | null;
  why: string;
}

const schema = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "Ação concreta, começando com verbo, que dá para fazer em até 2 horas." },
          due_date: { type: ["string", "null"], description: "Data sugerida YYYY-MM-DD a partir de hoje, ou null." },
          why: { type: "string", description: "Por que esta ação aproxima da meta (até 100 caracteres)." },
        },
        required: ["text", "due_date", "why"],
      },
    },
  },
  required: ["actions"],
};

/** Texto curto com as metas ativas e o progresso, para dar contexto à IA (briefing e Perguntar). */
export async function goalsContext(db: DB) {
  const { data: goals } = await db.from("goals").select("id,title,area,target_date").eq("status", "ativa").limit(20);
  if (!goals?.length) return "(nenhuma meta ativa)";
  const ids = goals.map((g) => g.id);
  const [{ data: krs }, { data: tasks }] = await Promise.all([
    db.from("key_results").select("goal_id,title,current,target,unit").in("goal_id", ids),
    db.from("tasks").select("goal_id,done").in("goal_id", ids),
  ]);
  return goals
    .map((g) => {
      const k = (krs ?? []).filter((x) => x.goal_id === g.id);
      const pct = Math.round(goalProgress(k, (tasks ?? []).filter((t) => t.goal_id === g.id)) * 100);
      const lines = k.map((x) => `  - ${x.title}: ${x.current}/${x.target} ${x.unit ?? ""}`);
      return [`- ${g.title} (${g.area}; ${pct}%${g.target_date ? `; prazo ${g.target_date}` : ""})`, ...lines].join("\n");
    })
    .join("\n");
}

/** Sugere próximas ações para uma meta. Nada é gravado: o usuário escolhe o que vira tarefa. */
export async function suggestActions(db: DB, goalId: string) {
  try {
    const { data: goal } = await db.from("goals").select("*").eq("id", goalId).maybeSingle();
    if (!goal) return { ok: false as const, error: "Meta não encontrada." };
    const [{ data: krs }, { data: tasks }] = await Promise.all([
      db.from("key_results").select("title,current,target,unit").eq("goal_id", goalId),
      db.from("tasks").select("text,done,due_date").eq("goal_id", goalId).limit(50),
    ]);
    const terms = askTerms(`${goal.title} ${goal.why ?? ""}`);
    const { data: hits } = terms.length ? await db.rpc("search_notes", { q: terms.join(" or ") }) : { data: [] };
    const ids = (hits ?? []).slice(0, 8).map((h) => h.id);
    const { data: notes } = ids.length ? await db.from("notes").select("title,summary").in("id", ids) : { data: [] };

    const today = todayContext();
    const progress = Math.round(goalProgress(krs ?? [], tasks ?? []) * 100);
    const r = await chatTool<{ actions: ActionSuggestion[] }>(
      `Você é um coach de produtividade e carreira. Hoje é ${today.human} (${today.iso}). ` +
        "Sugira de 3 a 6 próximas ações concretas, pequenas e com prazo, que façam a meta avançar mais. " +
        "Priorize os resultados-chave mais atrasados e aproveite o que o usuário já sabe nas notas. Não repita tarefas existentes. Português do Brasil.",
      [
        `META: ${goal.title} (área: ${goal.area}; prazo: ${goal.target_date ?? "sem prazo"}; progresso: ${progress}%)`,
        `POR QUÊ: ${goal.why ?? "(não informado)"}`,
        `RESULTADOS-CHAVE:\n${(krs ?? []).map((k) => `- ${k.title}: ${k.current}/${k.target} ${k.unit ?? ""}`).join("\n") || "(nenhum)"}`,
        `TAREFAS JÁ LIGADAS:\n${(tasks ?? []).map((t) => `- [${t.done ? "x" : " "}] ${t.text}`).join("\n") || "(nenhuma)"}`,
        `NOTAS RELACIONADAS:\n${(notes ?? []).map((n) => `- ${n.title}: ${n.summary ?? ""}`).join("\n") || "(nenhuma)"}`,
      ].join("\n\n"),
      "sugerir_acoes",
      schema,
    );
    const actions = (r.actions ?? [])
      .filter((a) => a.text?.trim())
      .slice(0, 6)
      .map((a) => ({ text: a.text.trim().slice(0, 300), why: (a.why ?? "").slice(0, 200), due_date: a.due_date && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date) && a.due_date >= today.iso ? a.due_date : null }));
    return { ok: true as const, actions };
  } catch (e) {
    console.error("plano-meta", goalId, e);
    let error = "Não foi possível sugerir ações agora.";
    if (e instanceof GatewayError) {
      if (e.httpStatus === 402) error = "Créditos de IA esgotados. Adicione créditos e tente de novo.";
      else if (e.httpStatus === 429) error = "Muitas solicitações à IA agora. Aguarde um pouco e tente de novo.";
    }
    return { ok: false as const, error };
  }
}
