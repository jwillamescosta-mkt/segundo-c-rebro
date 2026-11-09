import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BrainCircuit, CalendarDays, Home, ListTodo, Network, Plus, Search, Share2, FilePlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { createNote, type Note } from "@/lib/brain";
import { safeHeadline } from "@/lib/markdown-utils";
import { useApp, useBrain } from "./app-context";
import { useFullTextSearch, useOpenToday } from "./Sidebar";
import { TypeIcon } from "./type-meta";

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setCaptureOpen } = useApp();
  const { notes } = useBrain();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const openToday = useOpenToday();
  const [q, setQ] = useState("");
  const { hits } = useFullTextSearch(q);

  const go = (fn: () => void) => {
    setPaletteOpen(false);
    setQ("");
    fn();
  };

  async function newNote() {
    const title = q.trim() || "Nova nota";
    try {
      const n = await createNote({ title, content: `# ${title}\n\n`, type: "ideia", status: "pronta" });
      qc.setQueryData<Note[]>(["notes"], (old) => [n, ...(old ?? [])]);
      navigate({ to: "/nota/$id", params: { id: n.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar a nota.");
    }
  }

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Abrir nota, criar, ir para o grafo, buscar…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Ações">
          <CommandItem value={`criar nota ${q}`} onSelect={() => go(newNote)}>
            <FilePlus /> Criar nota{q.trim() ? ` “${q.trim()}”` : ""}
          </CommandItem>
          <CommandItem value="nova captura" onSelect={() => go(() => setCaptureOpen(true))}>
            <Plus /> Nova captura
          </CommandItem>
          <CommandItem value="ir para grafo" onSelect={() => go(() => navigate({ to: "/grafo" }))}>
            <Network /> Ir para o grafo
          </CommandItem>
          <CommandItem value="hoje nota diaria" onSelect={() => go(openToday)}>
            <CalendarDays /> Nota de hoje
          </CommandItem>
          <CommandItem value="inicio" onSelect={() => go(() => navigate({ to: "/inicio" }))}>
            <Home /> Início
          </CommandItem>
          <CommandItem value="perguntar" onSelect={() => go(() => navigate({ to: "/perguntar" }))}>
            <BrainCircuit /> Perguntar ao cérebro
          </CommandItem>
          <CommandItem value="agenda" onSelect={() => go(() => navigate({ to: "/agenda" }))}>
            <CalendarDays /> Agenda
          </CommandItem>
          <CommandItem value="tarefas" onSelect={() => go(() => navigate({ to: "/tarefas" }))}>
            <ListTodo /> Tarefas
          </CommandItem>
          <CommandItem value="compartilhadas" onSelect={() => go(() => navigate({ to: "/compartilhadas" }))}>
            <Share2 /> Compartilhadas
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Notas">
          {notes.slice(0, 300).map((n) => (
            <CommandItem
              key={n.id}
              value={`${n.title} ${n.tags.join(" ")} ${n.id}`}
              onSelect={() => go(() => navigate({ to: "/nota/$id", params: { id: n.id } }))}
            >
              <TypeIcon type={n.type} /> <span className="truncate">{n.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {hits && hits.length > 0 && (
          <CommandGroup heading="Busca no conteúdo">
            {hits.map((h) => (
              <CommandItem
                key={`fts-${h.id}`}
                value={`busca ${q} ${h.title} ${h.id}`}
                onSelect={() => go(() => navigate({ to: "/nota/$id", params: { id: h.id } }))}
              >
                <Search />
                <div className="min-w-0">
                  <div className="truncate">{h.title}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: safeHeadline(h.headline) }} />
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
