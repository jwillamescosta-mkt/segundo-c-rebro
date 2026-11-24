import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { expressFn } from "@/lib/express.functions";
import { EXPRESS_FORMATS, type ExpressFormat } from "@/lib/express-utils";

/** "Expressar": transforma a nota em roteiro, carrossel, mensagem ou plano, numa nota nova. */
export function ExpressButton({ noteId }: { noteId: string }) {
  const run = useServerFn(expressFn);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<ExpressFormat | null>(null);

  async function go(format: ExpressFormat) {
    setBusy(format);
    try {
      const r = await run({ data: { noteId, format } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.sources > 1
          ? `Pronto. Usei esta nota e mais ${r.sources - 1} ligada${r.sources > 2 ? "s" : ""}.`
          : "Pronto.",
      );
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["links"] });
      navigate({ to: "/nota/$id", params: { id: r.noteId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar o conteúdo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" disabled={!!busy} className="h-6 gap-1 px-2 text-xs">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}{" "}
          {busy ? "Escrevendo…" : "Expressar"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Transformar esta nota e as ligadas a ela em…
        </DropdownMenuLabel>
        {EXPRESS_FORMATS.map((f) => (
          <DropdownMenuItem key={f.value} onSelect={() => void go(f.value)}>
            {f.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
