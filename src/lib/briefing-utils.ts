export const BRIEFING_HEADING = "## ☀️ Briefing do dia";

/** Coloca (ou troca) a seção de briefing no diário, sem mexer no resto do texto. */
export function upsertBriefing(content: string, briefing: string) {
  return upsertSection(content, BRIEFING_HEADING, briefing);
}

export const END_OF_DAY_HEADING = "## 🌙 Fim do dia";

/** Coloca (ou troca) uma seção de nível 2 no texto, sem mexer no resto. */
export function upsertSection(content: string, heading: string, body: string) {
  const section = `${heading}\n\n${body.trim()}\n`;
  const start = content.indexOf(heading);
  if (start === -1) return `${content.trimEnd()}\n\n${section}`;
  const after = content.slice(start + heading.length);
  const next = after.search(/\n## /); // fim da seção: próximo título de nível 2
  const rest = next === -1 ? "" : after.slice(next);
  return `${content.slice(0, start)}${section}${rest}`;
}

/** Títulos de seção do briefing viram nível 3 para não quebrar o upsert. */
export function demoteHeadings(md: string) {
  return md.replace(/^#{1,2} /gm, "### ");
}
