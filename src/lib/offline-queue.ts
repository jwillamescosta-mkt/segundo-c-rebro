/** Fila de capturas feitas sem internet, guardada no IndexedDB do aparelho (aceita arquivos). */

export interface QueuedCapture {
  id: string;
  text: string;
  file: Blob | null;
  fileName: string | null;
  fileType: string | null;
  createdAt: number;
}

const DB = "segundo-cerebro";
const STORE = "fila-capturas";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function enqueue(text: string, file: File | null) {
  const item: QueuedCapture = {
    id: crypto.randomUUID(),
    text,
    file,
    fileName: file?.name ?? null,
    fileType: file?.type ?? null,
    createdAt: Date.now(),
  };
  return tx("readwrite", (s) => s.put(item));
}

export function listQueued() {
  return tx<QueuedCapture[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedCapture[]>);
}

export function removeQueued(id: string) {
  return tx("readwrite", (s) => s.delete(id));
}

let flushing = false;

/** Envia o que estiver na fila, em ordem. Para no primeiro erro (provavelmente ainda sem sinal). */
export async function flushQueue(send: (text: string, file: File | null) => Promise<void>) {
  if (flushing || typeof indexedDB === "undefined") return 0;
  flushing = true;
  let sent = 0;
  try {
    const items = (await listQueued()).sort((a, b) => a.createdAt - b.createdAt);
    for (const it of items) {
      const file = it.file ? new File([it.file], it.fileName ?? "captura", { type: it.fileType ?? "" }) : null;
      await send(it.text, file);
      await removeQueued(it.id);
      sent++;
    }
  } catch {
    /* tenta de novo no próximo "online" ou abertura do app */
  } finally {
    flushing = false;
  }
  return sent;
}
