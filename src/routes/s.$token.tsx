import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Brain, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlainMarkdown } from "@/components/brain/Markdown";

export const Route = createFileRoute("/s/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nota compartilhada — Segundo Cérebro" },
      { name: "description", content: "Uma nota compartilhada do Segundo Cérebro." },
      { property: "og:title", content: "Nota compartilhada" },
      { property: "og:description", content: "Leitura pública de uma nota do Segundo Cérebro." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedNote,
});

function SharedNote() {
  const { token } = Route.useParams();
  const q = useQuery({
    queryKey: ["shared", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_shared_note", { _token: token });
      if (error) throw error;
      const n = data?.[0];
      if (!n) return null;
      let url: string | null = null;
      if (n.attachment_path) url = (await supabase.storage.from("anexos").createSignedUrl(n.attachment_path, 3600)).data?.signedUrl ?? null;
      return { ...n, url };
    },
  });
  if (q.isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="size-5 animate-spin" /></div>;
  const n = q.data;
  if (!n) return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Esta nota não está mais compartilhada.</div>;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"><Brain className="size-4 text-primary" /> Segundo Cérebro · somente leitura</p>
      <h1 className="mb-4 text-3xl font-semibold">{n.title}</h1>
      {n.url && n.source_kind === "imagem" && <img src={n.url} alt="" className="mb-4 rounded-lg border" />}
      {n.url && n.source_kind === "audio" && <audio controls src={n.url} className="mb-4 w-full" />}
      {n.url && n.source_kind === "arquivo" && <a href={n.url} className="mb-4 inline-block text-sm text-primary">Baixar anexo</a>}
      <PlainMarkdown content={n.content} />
    </div>
  );
}
