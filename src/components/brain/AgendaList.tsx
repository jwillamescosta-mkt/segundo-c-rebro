import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ListTodo } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useBrain } from "@/components/brain/app-context";
import { setTaskDone } from "@/lib/brain";
import type { AgendaItem } from "@/lib/tasks-utils";
import { StaggerItem, StaggerList } from "./motion";

export function AgendaList({ items }: { items: AgendaItem[] }) {
  const { byId } = useBrain();
  const qc = useQueryClient();
  return (
    <StaggerList className="divide-y rounded-lg border bg-panel">
      {items.map((i) => (
        <StaggerItem key={i.kind + i.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${i.suggested ? "opacity-60" : ""}`}>
          {i.kind === "tarefa" ? (
            <Checkbox aria-label="Concluir tarefa" checked={!!i.done}onCheckedChange={async (v) => { await setTaskDone(i.id, !!v); qc.invalidateQueries({ queryKey: ["tasks"] }); }} />
          ) : (
            <CalendarDays className="size-4 text-primary" aria-label="Compromisso" />
          )}
          <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{i.time ?? (i.kind === "evento" ? "dia" : "")}</span>
          <span className={`flex-1 ${i.done ? "text-muted-foreground line-through" : ""}`}>
            {i.title}
            {i.suggested && <span className="ml-2 text-xs text-muted-foreground">(sugestão)</span>}
          </span>
          {i.kind === "tarefa" && <ListTodo className="size-3 text-muted-foreground" aria-label="Tarefa" />}
          {i.note_id && byId.get(i.note_id) && (
            <Link to="/nota/$id" params={{ id: i.note_id }} className="max-w-40 truncate text-xs text-primary">{byId.get(i.note_id)!.title}</Link>
          )}
        </StaggerItem>
      ))}
    </StaggerList>
  );
}
