import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDraftSync, type Draft } from "@/hooks/use-draft-sync";

/** Salvamento que só termina quando o teste manda (simula a rede lenta). */
function slowSave() {
  const calls: { draft: Draft; resolve: () => void }[] = [];
  const save = vi.fn((draft: Draft) => new Promise<void>((resolve) => calls.push({ draft, resolve })));
  return { save, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("rascunho da nota (digitação rápida)", () => {
  it("digitar enquanto salva NÃO volta para a versão antiga quando o servidor ecoa o que foi salvo", async () => {
    const { save, calls } = slowSave();
    const { result, rerender } = renderHook(({ server }) => useDraftSync(server, save), { initialProps: { server: { title: "T", content: "" } } });

    act(() => result.current.edit({ content: "Olá" }));
    await act(async () => vi.advanceTimersByTime(900)); // começa a salvar "Olá"
    expect(calls[0]!.draft.content).toBe("Olá");

    act(() => result.current.edit({ content: "Olá mun" })); // continua digitando
    await act(async () => calls[0]!.resolve()); // salvamento de "Olá" termina
    rerender({ server: { title: "T", content: "Olá" } }); // eco do servidor/cache com a versão antiga
    expect(result.current.draft.content).toBe("Olá mun");

    await act(async () => vi.advanceTimersByTime(900)); // salva a versão mais nova
    expect(calls[1]!.draft.content).toBe("Olá mun");
  });

  it("espera parar de digitar: várias letras seguidas geram um único salvamento", async () => {
    const { save, calls } = slowSave();
    const { result } = renderHook(() => useDraftSync({ title: "T", content: "" }, save));
    for (const c of ["a", "ab", "abc", "abcd"]) {
      act(() => result.current.edit({ content: c }));
      await act(async () => vi.advanceTimersByTime(200));
    }
    await act(async () => vi.advanceTimersByTime(900));
    expect(calls.map((c) => c.draft.content)).toEqual(["abcd"]);
  });

  it("sem edição pendente, adota mudanças do servidor (ex.: a IA transcreveu o áudio)", async () => {
    const { save } = slowSave();
    const { result, rerender } = renderHook(({ server }) => useDraftSync(server, save), { initialProps: { server: { title: "Processando…", content: "" } } });
    rerender({ server: { title: "Reunião", content: "## Transcrição\n\ntexto" } });
    expect(result.current.draft).toEqual({ title: "Reunião", content: "## Transcrição\n\ntexto" });
    expect(save).not.toHaveBeenCalled();
  });

  it("depois de salvar a última versão, volta a acompanhar o servidor", async () => {
    const { save, calls } = slowSave();
    const { result, rerender } = renderHook(({ server }) => useDraftSync(server, save), { initialProps: { server: { title: "T", content: "" } } });
    act(() => result.current.edit({ content: "fim" }));
    await act(async () => vi.advanceTimersByTime(900));
    await act(async () => calls[0]!.resolve());
    rerender({ server: { title: "T", content: "fim [[ligada]]" } }); // outra aba ou a IA alterou depois
    expect(result.current.draft.content).toBe("fim [[ligada]]");
  });

  it("se o salvamento falhar, a edição continua pendente e não é sobrescrita", async () => {
    const save = vi.fn(async () => {
      throw new Error("sem rede");
    });
    const { result, rerender } = renderHook(({ server }) => useDraftSync(server, save), { initialProps: { server: { title: "T", content: "" } } });
    act(() => result.current.edit({ content: "importante" }));
    await act(async () => vi.advanceTimersByTime(900));
    rerender({ server: { title: "T", content: "" } });
    rerender({ server: { title: "T", content: "x" } });
    expect(result.current.draft.content).toBe("importante");
  });
});
