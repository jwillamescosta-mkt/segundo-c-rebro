import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateCardsFn } from "@/lib/study.functions";

/** Pede à IA flashcards de uma nota. */
export function GenerateCardsButton({ noteId, label = "Gerar flashcards", className }: { noteId: string; label?: string; className?: string }) {
  const gen = useServerFn(generateCardsFn);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      className={className ?? "h-6 gap-1 px-2 text-xs"}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await gen({ data: { noteId } });
          if (r.ok) toast.success(`${r.count} flashcards prontos para estudar.`);
          else toast.error(r.error);
          qc.invalidateQueries({ queryKey: ["cards"] });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao gerar flashcards.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : <GraduationCap className="size-3" />} {busy ? "Criando perguntas…" : label}
    </Button>
  );
}
