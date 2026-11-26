import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nova senha — Segundo Cérebro" },
      { name: "description", content: "Defina uma nova senha para acessar suas notas privadas." },
      { property: "og:title", content: "Nova senha — Segundo Cérebro" },
      {
        property: "og:description",
        content: "Recupere o acesso ao seu Segundo Cérebro com segurança.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

export function ResetPasswordPage() {
  const [state, setState] = useState<"verificando" | "valida" | "invalida" | "concluida">(
    "verificando",
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const invalid = hash.has("error") || query.has("error");
    const recovery = hash.get("type") === "recovery";
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) setState("valida");
      if (active && event === "SIGNED_OUT") setState("invalida");
    });
    // O e-mail pode trazer o link em três formatos: #access_token (implícito, o cliente consome sozinho),
    // ?token_hash=&type=recovery (modelo de e-mail com token) ou ?code= (PKCE). Os dois últimos precisam ser trocados aqui.
    const tokenHash = query.get("token_hash") ?? query.get("token");
    const code = query.get("code");
    const exchange = tokenHash
      ? supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).then((r) => r.error)
      : code
        ? supabase.auth.exchangeCodeForSession(code).then((r) => r.error)
        : Promise.resolve(null);
    if (invalid) setState("invalida");
    else {
      // The auth client consumes recovery tokens before clearing the URL hash.
      // Revalidate the resulting session; never trust URL tokens on their own.
      void exchange
        .then((exchangeError) =>
          exchangeError ? Promise.reject(exchangeError) : supabase.auth.getUser(),
        )
        .then(({ data: userData, error: authError }) => {
          if (!active) return;
          setState(userData.user && !authError ? "valida" : "invalida");
          if (recovery || tokenHash || code)
            window.history.replaceState(null, "", window.location.pathname);
        })
        .catch(() => {
          if (active) setState("invalida");
        });
    }
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || state !== "valida") return;
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        if (/session|expired|jwt|current.password/i.test(updateError.message)) {
          setState("invalida");
        } else if (/same.password/i.test(updateError.message))
          setError("Escolha uma senha diferente da anterior.");
        else if (/weak|pwned|leaked/i.test(updateError.message))
          setError("Escolha uma senha mais forte que não tenha sido vazada.");
        else setError("Não foi possível salvar a senha. Tente novamente.");
        return;
      }
      setPassword("");
      setConfirmation("");
      setState("concluida");
    } catch {
      setError("Não foi possível conectar. Verifique sua internet e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <Brain className="size-6 text-primary" />
          <h1 className="text-lg font-semibold">Segundo Cérebro</h1>
        </div>
        <div className="rounded-lg border bg-panel p-5">
          {state === "verificando" && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Verificando seu link…
            </p>
          )}
          {state === "invalida" && (
            <>
              <h2 className="font-medium">Link inválido ou expirado</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Solicite um novo link em “Esqueci minha senha” na tela de acesso.
              </p>
              <Button asChild className="mt-4 w-full">
                <Link to="/entrar">Voltar para entrar</Link>
              </Button>
            </>
          )}
          {state === "concluida" && (
            <>
              <h2 className="font-medium">Senha atualizada</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Sua nova senha foi salva. Suas notas continuam intactas.
              </p>
              <Button asChild className="mt-4 w-full">
                <Link to="/inicio">Acessar minhas notas</Link>
              </Button>
            </>
          )}
          {state === "valida" && (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="font-medium">Definir nova senha</h2>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button className="w-full" disabled={busy} type="submit">
                {busy && <Loader2 className="size-4 animate-spin" />}Salvar nova senha
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
