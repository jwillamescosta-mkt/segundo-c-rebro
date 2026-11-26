// Palavras comuns em perguntas que não ajudam a achar notas.
const STOP = new Set(
  "como quais qual quando onde porque sobre para pelo pela pelos pelas isso isto esse essa este esta esses essas aquele aquela minha minhas meus meu tenho tem temos fazer faço fiz posso pode podem devo deve seria sobre coisa coisas algum alguma alguns algumas muito muita mais menos ainda agora hoje ontem amanhã semana então também tudo nada você vocês dele dela deles delas entre depois antes sempre nunca outro outra outros outras mesmo mesma quero queria preciso saber resuma resumo explique liste mostre diga".split(
    " ",
  ),
);

/** Termos de busca de uma pergunta, prontos para "a or b or c" no websearch_to_tsquery. */
export function askTerms(text: string, max = 10) {
  const out: string[] = [];
  for (const raw of text.toLocaleLowerCase("pt-BR").split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 4 || STOP.has(raw) || raw === "or" || /^\d+$/.test(raw)) continue;
    if (!out.includes(raw)) out.push(raw);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Busca em grafo: às notas encontradas na busca de texto, soma as vizinhas ligadas (ligações aceitas),
 * na ordem dos resultados. Assim uma pergunta sobre "PROLAV" também traz o playbook e as pessoas ligadas,
 * mesmo quando elas não repetem a palavra.
 */
export function expandWithNeighbors(
  ids: string[],
  links: { source_note_id: string; target_note_id: string; status: string }[],
  max: number,
) {
  const out = [...ids].slice(0, max);
  for (const id of ids) {
    if (out.length >= max) break;
    for (const l of links) {
      if (out.length >= max) break;
      if (l.status !== "aceita") continue;
      const other = l.source_note_id === id ? l.target_note_id : l.target_note_id === id ? l.source_note_id : null;
      if (other && !out.includes(other)) out.push(other);
    }
  }
  return out;
}
