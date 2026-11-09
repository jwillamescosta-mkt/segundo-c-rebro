import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useState } from "react";
import { Check, Copy, KeyRound, MessageSquare, Mic, Share, Smartphone, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/brain/motion";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/brain";
import { newToken, sha256Hex } from "@/lib/capture-utils";
import { formatDateBR } from "@/lib/tasks-utils";

export const Route = createFileRoute("/_app/atalhos")({
  head: () => ({ meta: [{ title: "Atalhos do iPhone — Segundo Cérebro" }, { name: "description", content: "Capture pelo Botão de Ação, pela Siri e pelo menu Compartilhar." }] }),
  component: ShortcutsPage,
});

const tokensQuery = {
  queryKey: ["capture_tokens"],
  queryFn: async () => {
    const { data, error } = await supabase.from("capture_tokens").select("id,name,created_at,last_used_at,revoked_at").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copiado."), () => toast.error("Não foi possível copiar."));
}

function ShortcutsPage() {
  const qc = useQueryClient();
  const tokens = useQuery(tokensQuery).data ?? [];
  const [name, setName] = useState("iPhone");
  const [fresh, setFresh] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const endpoint = `${origin}/api/capturar`;

  async function create() {
    try {
      const token = newToken();
      const { error } = await supabase.from("capture_tokens").insert({ user_id: await currentUserId(), name: name.trim() || "iPhone", token_hash: await sha256Hex(token) });
      if (error) throw error;
      setFresh(token);
      qc.invalidateQueries({ queryKey: ["capture_tokens"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o token.");
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revogar este token? Os Atalhos que usam ele param de funcionar.")) return;
    const { error } = await supabase.from("capture_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error("Não foi possível revogar.");
    qc.invalidateQueries({ queryKey: ["capture_tokens"] });
  }

  const active = tokens.filter((t) => !t.revoked_at);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div className="flex items-center gap-2">
        <Smartphone className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">Atalhos do iPhone</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Capture sem abrir o app: pelo Botão de Ação, pela Siri ou pelo menu Compartilhar de qualquer app. As capturas entram na fila e a IA organiza quando você abrir o Segundo Cérebro.
      </p>

      <Reveal className="space-y-3 rounded-xl border bg-panel p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-primary" /> 1. Crie seu token</h2>
        <p className="text-xs text-muted-foreground">O token só permite criar notas na sua conta, nunca ler. Ele aparece uma única vez; guarde-o dentro do Atalho. Se perder o iPhone, revogue aqui.</p>
        {fresh ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 rounded-lg border border-primary/50 bg-primary/5 p-3">
            <p className="text-xs font-medium">Seu token (copie agora, ele não será mostrado de novo):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs">{fresh}</code>
              <Button size="sm" variant="outline" onClick={() => copy(fresh)} className="gap-1"><Copy className="size-3.5" /> Copiar</Button>
            </div>
            <p className="pt-1 text-xs font-medium">Endereço do conector do Claude (já leva o token):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs">{`${origin}/api/mcp/${fresh}`}</code>
              <Button size="sm" variant="outline" onClick={() => copy(`${origin}/api/mcp/${fresh}`)} className="gap-1"><Copy className="size-3.5" /> Copiar</Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setFresh(null)} className="gap-1"><Check className="size-3.5" /> Já guardei</Button>
          </motion.div>
        ) : (
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Nome do token" placeholder="Nome (ex.: iPhone)" className="h-8 flex-1 rounded border bg-background px-2 text-sm outline-none focus:border-primary" />
            <Button size="sm" onClick={create}>Criar token</Button>
          </div>
        )}
        {active.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {active.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.last_used_at ? `usado em ${formatDateBR(t.last_used_at)}` : `criado em ${formatDateBR(t.created_at)}`}</span>
                <Button size="icon" variant="ghost" className="size-7 hover:text-destructive" aria-label={`Revogar ${t.name}`} onClick={() => revoke(t.id)}><Trash2 className="size-3.5" /></Button>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      <Reveal delay={0.05} className="space-y-2 rounded-xl border bg-panel p-4">
        <h2 className="text-sm font-semibold">2. Endereço de captura</h2>
        <div className="flex items-center gap-2">
          <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs">{endpoint}</code>
          <Button size="sm" variant="outline" onClick={() => copy(endpoint)} className="gap-1"><Copy className="size-3.5" /> Copiar</Button>
        </div>
      </Reveal>

      <Reveal delay={0.1} className="space-y-4">
        <h2 className="text-sm font-semibold">3. Monte os Atalhos (app Atalhos → +)</h2>
        <Guide
          icon={Mic}
          title="Botão de Ação: gravar no cérebro"
          steps={[
            "Ação “Gravar Áudio” (desmarque “Mostrar ao executar” se quiser começar direto).",
            "Cópia de segurança: ação “Salvar Arquivo” com o Áudio Gravado; desligue “Perguntar Onde Salvar” e escolha iCloud Drive › Segundo Cérebro. Assim nenhum áudio se perde, mesmo sem internet ou com o app fora do ar.",
            "Ação “Obter Conteúdo do URL”: URL = o endereço acima; Método = POST.",
            "Cabeçalhos: Authorization = Bearer SEU_TOKEN.",
            "Corpo da Solicitação = Formulário; campo “arquivo” do tipo Arquivo = Áudio Gravado.",
            "Confirmação: ação “Se” › Conteúdo do URL › contém › Capturado. Dentro do Se: “Mostrar Notificação” = Salvo no cérebro ✓. Em “Senão”: “Mostrar Alerta” = Não foi salvo. O áudio está em Arquivos › Segundo Cérebro; reenvie depois.",
            "Ajustes → Botão de Ação → Atalho → escolha este atalho.",
            "Para reenviar um áudio guardado: abra-o em Arquivos › Segundo Cérebro › Compartilhar › seu atalho “Compartilhar” (ou anexe no app).",
          ]}
        />
        <Guide
          icon={Wand2}
          title="Siri: “anota no cérebro”"
          steps={[
            "Ação “Ditar Texto” (idioma Português).",
            "“Obter Conteúdo do URL” com POST, o mesmo cabeçalho Authorization e Corpo = JSON: texto = Texto Ditado.",
            "Dê ao atalho o nome “Anota no cérebro”. Depois é só dizer: “E aí Siri, anota no cérebro”.",
          ]}
        />
        <Guide
          icon={Share}
          title="Compartilhar: mandar para o cérebro"
          steps={[
            "Nos detalhes do atalho, ative “Mostrar na Planilha de Compartilhamento” e aceite URLs, Textos e Imagens.",
            "“Obter Conteúdo do URL” com POST e o cabeçalho Authorization.",
            "Corpo = Formulário: campo “texto” = Entrada do Atalho (para links e textos) ou campo “arquivo” = Entrada do Atalho (para imagens e PDFs).",
            "Pronto: em qualquer app, Compartilhar → nome do atalho.",
          ]}
        />
      </Reveal>

      <Reveal delay={0.15} className="space-y-4">
        <h2 className="text-sm font-semibold">4. Conector do Claude (chat como porta de entrada)</h2>
        <Guide
          icon={MessageSquare}
          title="Anotar pelo chat do Claude"
          steps={[
            "Crie um token novo (passo 1) só para o Claude e copie o “Endereço do conector do Claude”.",
            "No Claude (site ou app): Configurações → Conectores → Adicionar conector personalizado.",
            "Nome: Segundo Cérebro. URL: cole o endereço do conector. Salve, sem preencher login (OAuth).",
            "Num chat, ative o conector e peça: “anota no meu segundo cérebro que…”. O Claude usa a ferramenta capturar_nota.",
            "O conector só cria notas: ele não lê nada do seu cérebro. Se o endereço vazar, revogue o token aqui.",
          ]}
        />
      </Reveal>
    </div>
  );
}

function Guide({ icon: Icon, title, steps }: { icon: typeof Mic; title: string; steps: string[] }) {
  return (
    <details className="group rounded-xl border bg-panel p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
        <span className="rounded-md bg-primary/10 p-1.5 text-primary"><Icon className="size-4" /></span>
        {title}
        <span className="ml-auto text-xs text-muted-foreground group-open:hidden">ver passos</span>
      </summary>
      <ol className="mt-3 list-decimal space-y-1.5 pl-6 text-sm text-muted-foreground">
        {steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
    </details>
  );
}
