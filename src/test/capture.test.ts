import { describe, expect, it } from "vitest";
import { CAPTURE_OK, extFromMime, firstUrl, kindFromMime, newToken, parseBearer, sha256Hex } from "@/lib/capture-utils";

describe("captura por Atalho", () => {
  it("token novo tem prefixo, 43 caracteres aleatórios e é aceito pelo parser", () => {
    const t = newToken();
    expect(t).toMatch(/^scb_[A-Za-z0-9_-]{43}$/);
    expect(parseBearer(`Bearer ${t}`)).toBe(t);
    expect(newToken()).not.toBe(t);
  });
  it("recusa cabeçalhos sem Bearer, sem prefixo ou curtos", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("scb_" + "a".repeat(43))).toBeNull();
    expect(parseBearer("Bearer abc")).toBeNull();
    expect(parseBearer("Bearer xyz_" + "a".repeat(43))).toBeNull();
  });
  it("hash SHA-256 em hex com 64 caracteres (é o que fica no banco)", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("reconhece áudio do iPhone, imagens HEIC e documentos; recusa o resto", () => {
    expect(kindFromMime("audio/x-m4a")).toBe("audio");
    expect(kindFromMime("video/quicktime")).toBe("audio");
    expect(kindFromMime("image/heic")).toBe("imagem");
    expect(kindFromMime("application/pdf")).toBe("arquivo");
    expect(kindFromMime("application/x-msdownload")).toBeNull();
    expect(extFromMime("audio/x-m4a", "bin")).toBe("m4a");
    expect(extFromMime("application/zip", "bin")).toBe("bin");
  });
  it("a resposta de sucesso contém \"Capturado\" (o Atalho do iPhone confere essa palavra)", () => {
    expect(CAPTURE_OK).toContain("Capturado");
  });
  it("acha o primeiro link do texto compartilhado", () => {
    expect(firstUrl("veja isso https://exemplo.com/a?b=1 depois")).toBe("https://exemplo.com/a?b=1");
    expect(firstUrl("sem link")).toBeNull();
  });
});
