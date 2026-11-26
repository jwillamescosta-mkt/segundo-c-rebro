import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/entrar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Segundo Cérebro" },
      { name: "description", content: "Entre no seu Segundo Cérebro privado." },
      { property: "og:title", content: "Entrar — Segundo Cérebro" },
      { property: "og:description", content: "Acesse seu segundo cérebro pessoal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function traduzErro(msg: string) {
  if (/invalid login/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg))
    return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (/already registered/i.test(msg)) return "Este e-mail já tem conta. Entre com sua senha.";
  if (/password/i.test(msg) && /6/.test(msg)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/weak|pwned|leaked/i.test(msg)) return "Senha fraca ou vazada. Escolha outra.";
  return msg;
}

export function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"entrar" | "criar" | "recuperar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") nav({ to: "/reset-password" });
      else if (s) nav({ to: "/inicio" });
    });
    supabase.auth.getSession().then(({ data: d }) => d.session && nav({ to: "/inicio" }));
    return () => data.subscription.unsubscribe();
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "recuperar") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent(true);
      } else if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/inicio" },
        });
        if (error) throw error;
        if (!data.session) setSent(true);
      }
    } catch (err) {
      toast.error(traduzErro(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md border bg-panel">
            <Brain className="size-5 text-primary" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Segundo Cérebro</h1>
            <p className="text-xs text-muted-foreground">Capture. Conecte. Reencontre.</p>
          </div>
        </div>

        {sent ? (
          <div className="rounded-lg border bg-panel p-5 text-sm">
            <p className="font-medium">Confira seu e-mail</p>
            <p className="mt-1 text-muted-foreground">
              {mode === "recuperar" ? (
                <>
                  Se existe uma conta com <span className="text-foreground">{email}</span>, você
                  receberá um link para definir uma nova senha. Confira também o spam.
                </>
              ) : (
                <>
                  Enviamos um link de confirmação para{" "}
                  <span className="text-foreground">{email}</span>. Depois de confirmar, você entra
                  direto no seu cérebro.
                </>
              )}
            </p>
            <Button
              variant="ghost"
              className="mt-3 px-0"
              onClick={() => {
                setSent(false);
                setMode("entrar");
              }}
            >
              Voltar para entrar
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-lg border bg-panel p-5">
            {mode === "recuperar" ? (
              <h2 className="font-medium">Recuperar senha</h2>
            ) : (
              <div className="grid grid-cols-2 gap-1 rounded-md bg-background p-1 text-sm">
                {(["entrar", "criar"] as const).map((m) => (
                  <Button
                    type="button"
                    variant="ghost"
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setPassword("");
                    }}
                    disabled={busy}
                    className={`rounded px-2 py-1.5 transition-colors ${mode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {m === "entrar" ? "Entrar" : "Criar conta"}
                  </Button>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mode !== "recuperar" && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "entrar" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "recuperar"
                ? "Enviar link de recuperação"
                : mode === "entrar"
                  ? "Entrar"
                  : "Criar conta"}
            </Button>
            {mode !== "criar" && (
              <Button
                type="button"
                variant="link"
                className="w-full"
                disabled={busy}
                onClick={() => {
                  setMode(mode === "recuperar" ? "entrar" : "recuperar");
                  setPassword("");
                }}
              >
                {mode === "recuperar" ? "Voltar para entrar" : "Esqueci minha senha"}
              </Button>
            )}
          </form>
        )}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Tudo é privado e só você vê suas notas.
        </p>
      </div>
    </div>
  );
}
