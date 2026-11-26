import { PROFILE_TITLE, profileForPrompt } from "./split-utils";

/** Tag das notas-núcleo: os poucos documentos que a IA lê antes de qualquer tarefa. */
export const CORE_TAG = "nucleo";
/** Teto do contexto essencial (caracteres), para não encarecer cada chamada de IA. */
export const CORE_MAX = 8000;
const PER_NOTE = 1800;

export interface CoreTopic {
  key: string;
  title: string;
  questions: string[];
}

/** Roteiro da entrevista "Montar meu cérebro": cada tema vira uma nota-núcleo. */
export const CORE_TOPICS: CoreTopic[] = [
  {
    key: "perfil",
    title: PROFILE_TITLE,
    questions: [
      "Quem é você? Nome, idade, cidade, o que faz da vida.",
      "Quem é a sua família e como você chama cada um no dia a dia (ex.: 'ela', 'o pequeno')?",
      "Como é uma semana normal sua: horários, compromissos fixos, onde você trabalha?",
    ],
  },
  {
    key: "estrategia",
    title: "Estratégia",
    questions: [
      "Quais são os seus trabalhos e negócios hoje, e quanto do seu tempo vai para cada um?",
      "Onde você quer estar daqui a 12 meses? E daqui a 3 anos?",
      "Quais são as 3 prioridades deste trimestre e o que você decidiu NÃO fazer?",
    ],
  },
  {
    key: "cliente-ideal",
    title: "Cliente ideal",
    questions: [
      "Quem é o seu cliente ideal: segmento, porte, cargo de quem decide, região?",
      "Quais dores ele tem e o que faz ele comprar de você?",
      "Que tipo de cliente você quer evitar, e por quê?",
    ],
  },
  {
    key: "oferta",
    title: "Oferta",
    questions: [
      "O que você vende? Descreva cada serviço ou produto em uma frase.",
      "Como você cobra (faixas, modelo, percentual)? Não precisa dizer valores de contratos específicos.",
      "Qual é o seu diferencial em relação aos concorrentes?",
    ],
  },
  {
    key: "tom-de-voz",
    title: "Tom de voz",
    questions: [
      "Como você gosta de escrever e falar: formal, direto, bem-humorado, técnico?",
      "Que palavras e expressões você usa muito, e quais você odeia?",
      "Cite um texto, post ou vídeo seu que você acha que ficou a sua cara.",
    ],
  },
  {
    key: "equipe",
    title: "Equipe e parceiros",
    questions: [
      "Com quem você trabalha: sócios, chefes, equipe, freelancers, parceiros?",
      "O que cada um faz e como vocês se comunicam (WhatsApp, reuniões, e-mail)?",
    ],
  },
  {
    key: "rotina",
    title: "Rotina e ferramentas",
    questions: [
      "Quais ferramentas você usa todo dia (agenda, e-mail, CRM, Meta Ads, Notion…) e para quê?",
      "Quais tarefas se repetem toda semana e quais você mais gostaria de automatizar?",
      "Em que horário você rende mais e quando costuma travar?",
    ],
  },
  {
    key: "pessoal",
    title: "Vida pessoal",
    questions: [
      "Quais são os seus objetivos pessoais: saúde, estudos, finanças, família, fé, hobbies?",
      "Que hábitos você quer criar ou abandonar?",
    ],
  },
];

export const topicByKey = (key: string) => CORE_TOPICS.find((t) => t.key === key);

/** Nota-núcleo: tem a tag ou é o perfil "Quem sou eu" (que já existia antes do núcleo). */
export const isCoreNote = (n: { title: string; tags: string[] }) =>
  n.tags.includes(CORE_TAG) || n.title === PROFILE_TITLE;

/** Monta o "contexto essencial" que todos os prompts recebem: perfil primeiro, depois as demais notas-núcleo. */
export function formatCoreContext(
  notes: { title: string; content: string | null; summary?: string | null }[],
) {
  const sorted = [...notes].sort(
    (a, b) =>
      Number(b.title === PROFILE_TITLE) - Number(a.title === PROFILE_TITLE) ||
      a.title.localeCompare(b.title, "pt-BR"),
  );
  let out = "";
  for (const n of sorted) {
    const body = profileForPrompt(n.content ?? "").slice(0, PER_NOTE) || (n.summary ?? "").trim();
    if (!body) continue;
    const block = `## ${n.title}\n${body}\n\n`;
    if (out.length + block.length > CORE_MAX) break;
    out += block;
  }
  return out.trim();
}
