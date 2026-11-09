import { createFileRoute, redirect } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Segundo Cérebro — capture, conecte, reencontre" },
      { name: "description", content: "Um segundo cérebro pessoal e privado, inspirado no Obsidian, com captura por voz, imagem, arquivos e links." },
      { property: "og:title", content: "Segundo Cérebro" },
      { property: "og:description", content: "Capture ideias por texto, voz, imagem e links. A IA organiza e conecta tudo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/inicio" : "/entrar" });
  },
  component: () => (
    <div className="flex h-screen items-center justify-center bg-background">
      <Brain className="size-6 animate-pulse-soft text-primary" />
    </div>
  ),
});
