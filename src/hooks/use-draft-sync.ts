import { useEffect, useRef, useState } from "react";

export interface Draft {
  title: string;
  content: string;
}

/**
 * Rascunho de uma nota com salvamento automático (debounce) que não briga com quem está digitando.
 * - Só marca "salvo" se o texto não mudou enquanto o salvamento estava em andamento.
 * - Versões que chegam do servidor (cache, tempo real, IA) só substituem o rascunho quando não há
 *   nada pendente; o eco do próprio salvamento é ignorado. Assim o cursor não pula nem some letra.
 */
export function useDraftSync(server: Draft, save: (d: Draft) => Promise<void>, delay = 900) {
  const [draft, setDraft] = useState<Draft>(server);
  const latest = useRef(draft);
  latest.current = draft;
  const dirty = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  // Adota a versão do servidor só quando o usuário não tem alterações pendentes.
  useEffect(() => {
    if (dirty.current) return;
    const cur = latest.current;
    if (cur.title !== server.title || cur.content !== server.content) setDraft(server);
  }, [server.title, server.content]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty.current) return;
    const sent = draft;
    const t = setTimeout(async () => {
      try {
        await saveRef.current(sent);
        const now = latest.current;
        if (now.title === sent.title && now.content === sent.content) dirty.current = false;
      } catch {
        /* quem chama mostra o erro; continua pendente para a próxima tentativa */
      }
    }, delay);
    return () => clearTimeout(t);
  }, [draft, delay]);

  const edit = (patch: Partial<Draft>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  return { draft, edit };
}
