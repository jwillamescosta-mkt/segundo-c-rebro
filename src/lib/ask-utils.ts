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
