/**
 * Caixa de saída das capturas (IndexedDB do aparelho; aceita arquivos).
 * Regra da blindagem: TODA captura é gravada aqui ANTES de qualquer envio e só é apagada depois que o
 * servidor confirma a nota. Se a rede cair, o envio travar, a sessão expirar ou o app fechar, ela continua
 * aqui e é reenviada sozinha. O id do item é o id da nota: reenviar nunca duplica.
 */

export interface QueuedCapture {
  id: string;
  text: string;
  file: Blob | null;
  fileName: string | null;
  fileType: string | null;
  createdAt: number;
  tries?: number;
  lastError?: string | null;
}

const DB = "segundo-cerebro";
const STORE = "fila-capturas";
const REC = "gravacao-em-andamento";
export const OUTBOX_EVENT = "sc-caixa-de-saida";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(REC)) db.createObjectStore(REC, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    // Só vale depois que a transação fecha (dado realmente no disco).
    t.oncomplete = () => resolve(req.result);
    t.onerror = t.onabort = () => reject(t.error ?? req.error);
  });
}

const changed = () => typeof window !== "undefined" && window.dispatchEvent(new Event(OUTBOX_EVENT));

/** Guarda a captura no aparelho. Devolve o id (que será o id da nota). */
export async function enqueue(text: string, file: File | null) {
  const item: QueuedCapture = { id: crypto.randomUUID(), text, file, fileName: file?.name ?? null, fileType: file?.type ?? null, createdAt: Date.now() };
  await tx(STORE, "readwrite", (s) => s.put(item));
  changed();
  return item.id;
}

export async function listQueued() {
  if (typeof indexedDB === "undefined") return [];
  const items = await tx<QueuedCapture[]>(STORE, "readonly", (s) => s.getAll() as IDBRequest<QueuedCapture[]>);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeQueued(id: string) {
  await tx(STORE, "readwrite", (s) => s.delete(id));
  changed();
}

async function markFailed(item: QueuedCapture, error: string) {
  await tx(STORE, "readwrite", (s) => s.put({ ...item, tries: (item.tries ?? 0) + 1, lastError: error }));
  changed();
}

export const queuedFile = (it: QueuedCapture) => (it.file ? new File([it.file], it.fileName ?? "captura", { type: it.fileType ?? "" }) : null);

/**
 * Envia os itens em ordem. Um item com problema não bloqueia os outros; só sai da caixa quem foi confirmado.
 * Separado do IndexedDB para ser testável.
 */
export async function runFlush(
  items: QueuedCapture[],
  send: (item: QueuedCapture) => Promise<void>,
  remove: (id: string) => Promise<unknown>,
  fail: (item: QueuedCapture, error: string) => Promise<unknown>,
) {
  let sent = 0;
  for (const it of items) {
    try {
      await send(it);
    } catch (e) {
      await fail(it, e instanceof Error ? e.message : "Falha ao enviar.").catch(() => {});
      continue;
    }
    await remove(it.id);
    sent++;
  }
  return { sent, left: items.length - sent };
}

let flushing: Promise<{ sent: number; left: number }> | null = null;

/** Tenta enviar tudo o que está na caixa. Chamadas simultâneas compartilham a mesma execução. */
export function flushQueue(send: (item: QueuedCapture) => Promise<void>) {
  if (typeof indexedDB === "undefined") return Promise.resolve({ sent: 0, left: 0 });
  flushing ??= listQueued()
    .then((items) => runFlush(items, send, removeQueued, markFailed))
    .catch(() => ({ sent: 0, left: 0 }))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

// --- Gravação em andamento: cada pedaço do áudio vai para o disco enquanto grava. ---
// Se o app fechar no meio (ligação, tela bloqueada, iOS encerrando o app), o que foi gravado é recuperado.

export function recAppend(chunk: Blob) {
  return tx(REC, "readwrite", (s) => s.add(chunk)).catch(() => {});
}

export function recClear() {
  return tx(REC, "readwrite", (s) => s.clear()).catch(() => {});
}

/** Áudio que sobrou de uma gravação interrompida (ou null). Não apaga: chame recClear depois de guardar. */
export async function recRecover() {
  if (typeof indexedDB === "undefined") return null;
  const chunks = await tx<Blob[]>(REC, "readonly", (s) => s.getAll() as IDBRequest<Blob[]>).catch(() => []);
  if (!chunks.length) return null;
  const type = chunks[0]!.type || "audio/mp4";
  return new File(chunks, `gravacao-recuperada-${Date.now()}.${type.includes("webm") ? "webm" : "m4a"}`, { type });
}
