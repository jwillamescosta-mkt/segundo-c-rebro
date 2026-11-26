/**
 * "Expressar" (o E do método CODE): transformar notas em algo pronto para usar.
 * Cada formato diz à IA o que entregar; a voz vem da nota "Mapa de comunicação e copy", se existir.
 */
export const EXPRESS_FORMATS = [
  {
    value: "video",
    label: "Roteiro de vídeo (YouTube)",
    tag: "roteiro",
    spec:
      "Roteiro de vídeo falado para o YouTube, de 6 a 10 minutos, para gravar sem teleprompter. Seções (###): 'Título e thumbnail' (3 opções de título com até 60 caracteres e 1 ideia de thumbnail), " +
      "'Gancho (0–30s)' (frase de abertura que prende), 'Roteiro' (blocos em tópicos curtos para falar com as próprias palavras, cada um com um exemplo real tirado das notas), " +
      "'Chamada para ação' e 'Descrição e tags' (descrição curta e 8 tags).",
  },
  {
    value: "carrossel",
    label: "Carrossel do Instagram",
    tag: "carrossel",
    spec:
      "Carrossel de 8 a 10 cards para o Instagram. Card 1 é um gancho de até 12 palavras; os do meio entregam uma ideia por card, em frases curtas; o último traz a chamada para ação. " +
      "Depois dos cards, uma seção '### Legenda' com legenda envolvente e 10 hashtags.",
  },
  {
    value: "reels",
    label: "Reels curto",
    tag: "reels",
    spec: "Roteiro de Reels de 30 a 60 segundos: '### Gancho' (até 3 segundos), '### Falas' (takes numerados, frases curtas), '### Texto na tela', '### Legenda' (curta, com chamada para ação).",
  },
  {
    value: "mensagem",
    label: "Mensagem para cliente",
    tag: "mensagem",
    spec:
      "Mensagem de WhatsApp ou e-mail para um cliente ou lead, em tom consultivo e humano: contexto, o que eu percebi, o que proponho e um próximo passo com pergunta fechada. " +
      "Entregue duas versões (###): 'Curta (WhatsApp)' e 'Completa (e-mail, com assunto)'.",
  },
  {
    value: "plano",
    label: "Plano de ação",
    tag: "plano",
    spec:
      "Plano de ação prático. Seções (###): 'Objetivo' (uma frase mensurável), 'Passos' (lista numerada com verbos de ação, do primeiro passo de 15 minutos ao último), " +
      "'Riscos e como evitar', 'Como saber que deu certo'. Termine com tarefas no formato '- [ ] tarefa — prazo sugerido'.",
  },
  {
    value: "post",
    label: "Post para LinkedIn",
    tag: "post",
    spec: "Post para o LinkedIn de 150 a 250 palavras, em primeira pessoa, com uma história ou aprendizado real tirado das notas, uma lição clara e uma pergunta no final para gerar comentários. Sem hashtags em excesso (no máximo 3).",
  },
] as const;

export type ExpressFormat = (typeof EXPRESS_FORMATS)[number]["value"];
export const EXPRESS_VALUES = EXPRESS_FORMATS.map((f) => f.value) as ExpressFormat[];

export function expressFormat(v: string) {
  return EXPRESS_FORMATS.find((f) => f.value === v) ?? null;
}

/** Título da nota gerada: "Roteiro de vídeo (YouTube): <nota>", curto o bastante para a lista. */
export function expressTitle(format: ExpressFormat, source: string) {
  const f = expressFormat(format)!;
  const label = f.label.replace(/\s*\(.*\)$/, "");
  const t = `${label}: ${source}`;
  return t.length > 110 ? `${t.slice(0, 107).trimEnd()}…` : t;
}

/** Nota que o usuário usa como guia de voz (tom, posicionamento, CTAs). */
export const VOICE_TITLES = [
  "Mapa de comunicação e copy",
  "Proposta de valor",
  "Mapa de comunicação",
];
