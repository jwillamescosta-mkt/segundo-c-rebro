import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isRoutine, type Routine } from "./routine-utils";

/** Roda uma rotina agora, com o login do próprio usuário (mesmo código do agendamento). */
export const runRoutineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routine: string }) => {
    if (typeof d?.routine !== "string" || !isRoutine(d.routine))
      throw new Error("Rotina desconhecida.");
    return { routine: d.routine as Routine };
  })
  .handler(async ({ data, context }) => {
    const { runRoutine } = await import("./routines.server");
    try {
      const r = await runRoutine(context.supabase, context.userId, data.routine);
      return r.ok
        ? { ok: true as const, noteId: r.noteId }
        : { ok: false as const, error: r.error };
    } catch (e) {
      console.error("rotina manual", data.routine, e);
      return { ok: false as const, error: "Não consegui rodar a rotina agora. Tente de novo." };
    }
  });
