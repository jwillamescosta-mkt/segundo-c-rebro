// Teste de fumaça do servidor gerado pelo build: carrega .output/server como o Cloudflare faria e faz
// duas requisições. Pega erros que só aparecem no servidor (ex.: biblioteca que usa `window` ao carregar),
// que derrubam o site inteiro mesmo com o build "verde". Uso: npm run build && npm run check:ssr
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "smoke";
const { default: app } = await import(pathToFileURL(resolve(".output/server/index.mjs")).href);
const ctx = { waitUntil() {}, passThroughOnException() {} };
const checks = [
  ["/entrar", {}, 200],
  ["/api/capturar", { method: "POST", headers: { "content-type": "application/json" }, body: '{"texto":"x"}' }, 401],
];
let failed = false;
for (const [path, init, want] of checks) {
  const r = await app.fetch(new Request("http://localhost" + path, init), {}, ctx);
  const ok = r.status === want;
  failed ||= !ok;
  console.log(`${ok ? "ok " : "ERRO"} ${path} -> ${r.status} (esperado ${want})`);
}
process.exit(failed ? 1 : 0);
