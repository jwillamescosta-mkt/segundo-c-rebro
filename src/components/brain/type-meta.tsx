import {
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckSquare,
  FileText,
  GraduationCap,
  Lightbulb,
  Clapperboard,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const TYPE_ICON: Record<string, LucideIcon> = {
  ideia: Lightbulb,
  tarefa: CheckSquare,
  cliente: Briefcase,
  projeto: FileText,
  conteudo: Clapperboard,
  pessoa: User,
  referencia: BookOpen,
  diario: CalendarDays,
  aprendizado: GraduationCap,
};

export const TYPE_DOT: Record<string, string> = {
  ideia: "bg-type-ideia",
  tarefa: "bg-type-tarefa",
  cliente: "bg-type-cliente",
  projeto: "bg-type-projeto",
  conteudo: "bg-type-conteudo",
  pessoa: "bg-type-pessoa",
  referencia: "bg-type-referencia",
  diario: "bg-type-diario",
  aprendizado: "bg-type-aprendizado",
};

export const TYPE_TEXT: Record<string, string> = {
  ideia: "text-type-ideia",
  tarefa: "text-type-tarefa",
  cliente: "text-type-cliente",
  projeto: "text-type-projeto",
  conteudo: "text-type-conteudo",
  pessoa: "text-type-pessoa",
  referencia: "text-type-referencia",
  diario: "text-type-diario",
  aprendizado: "text-type-aprendizado",
};

export function TypeDot({ type, className }: { type: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", TYPE_DOT[type] ?? "bg-muted-foreground", className)} />;
}

export function TypeIcon({ type, className }: { type: string; className?: string }) {
  const I = TYPE_ICON[type] ?? FileText;
  return <I className={cn("size-3.5 shrink-0", TYPE_TEXT[type], className)} strokeWidth={1.75} />;
}

/** Read a CSS custom property's computed value (for canvas drawing). */
export function cssVar(name: string) {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}
