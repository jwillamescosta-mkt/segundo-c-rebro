import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
import { AuthPage } from "@/routes/entrar";
import { ResetPasswordPage } from "@/routes/reset-password";

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/reset-password");
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.getUser.mockResolvedValue({ data: { user: { id: "test-user" } }, error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("Recuperação de senha", () => {
  it("solicita recuperação com retorno à tela pública, sem exigir senha antiga", async () => {
    render(<AuthPage />);
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "teste@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("teste@example.org", {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("salva a nova senha na sessão validada sem current_password", async () => {
    render(<ResetPasswordPage />);
    await screen.findByLabelText("Nova senha");
    fireEvent.change(screen.getByLabelText("Nova senha"), {
      target: { value: "SenhaDeTeste123!" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
      target: { value: "SenhaDeTeste123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    await waitFor(() =>
      expect(auth.updateUser).toHaveBeenCalledWith({ password: "SenhaDeTeste123!" }),
    );
  });
  it("não altera senha quando a confirmação diverge", async () => {
    render(<ResetPasswordPage />);
    await screen.findByLabelText("Nova senha");
    fireEvent.change(screen.getByLabelText("Nova senha"), {
      target: { value: "SenhaDeTeste123!" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
      target: { value: "OutraSenha123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("não habilita atualização sem sessão autenticada", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    render(<ResetPasswordPage />);
    await waitFor(() => expect(auth.getUser).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText("Nova senha")).toBeNull());
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("recusa erro de recuperação mesmo havendo outra sessão", async () => {
    window.history.replaceState(null, "", "/reset-password#error=access_denied&type=recovery");
    render(<ResetPasswordPage />);
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("aceita link com token_hash: troca pelo token antes de liberar o formulário", async () => {
    window.history.replaceState(null, "", "/reset-password?token_hash=abc&type=recovery");
    render(<ResetPasswordPage />);
    await screen.findByLabelText("Nova senha");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "recovery" });
    expect(window.location.search).toBe("");
  });
  it("aceita link com code (PKCE)", async () => {
    window.history.replaceState(null, "", "/reset-password?code=xyz");
    render(<ResetPasswordPage />);
    await screen.findByLabelText("Nova senha");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("xyz");
  });
  it("token_hash vencido mostra link inválido", async () => {
    window.history.replaceState(null, "", "/reset-password?token_hash=velho&type=recovery");
    auth.verifyOtp.mockResolvedValue({ error: new Error("Token has expired") });
    render(<ResetPasswordPage />);
    await screen.findByText("Link inválido ou expirado");
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});
