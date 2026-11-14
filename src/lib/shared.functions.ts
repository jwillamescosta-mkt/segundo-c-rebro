import { createServerFn } from "@tanstack/react-start";

/** Leitura pública de uma nota compartilhada: o token válido é a única autorização, e o anexo é assinado no servidor. */
export const getSharedNoteFn = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => {
    const token = typeof d?.token === "string" ? d.token.trim() : "";
    if (!token || token.length > 200) throw new Error("Link inválido.");
    return { token };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("get_shared_note", { _token: data.token });
    if (error) throw new Error("Não foi possível abrir a nota.");
    const n = rows?.[0];
    if (!n) return null;
    let url: string | null = null;
    if (n.attachment_path) {
      url = (await supabaseAdmin.storage.from("anexos").createSignedUrl(n.attachment_path, 3600)).data?.signedUrl ?? null;
    }
    return { ...n, url };
  });
