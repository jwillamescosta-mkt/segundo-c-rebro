import JSZip from "jszip";
import type { Link, Note } from "./brain";
import { noteToMarkdown, sanitizeFilename } from "./markdown-utils";

export async function exportVault(notes: Note[], links: Link[]) {
  const zip = new JSZip();
  const folder = zip.folder("Segundo Cérebro")!;
  const byId = new Map(notes.map((n) => [n.id, n]));
  const used = new Map<string, number>();
  const fileName = new Map<string, string>();
  for (const n of notes) {
    const base = sanitizeFilename(n.title);
    const c = used.get(base.toLowerCase()) ?? 0;
    used.set(base.toLowerCase(), c + 1);
    fileName.set(n.id, c ? `${base} (${c + 1})` : base);
  }
  for (const n of notes) {
    const linked = links
      .filter((l) => l.status === "aceita" && (l.source_note_id === n.id || l.target_note_id === n.id))
      .map((l) => byId.get(l.source_note_id === n.id ? l.target_note_id : l.source_note_id))
      .filter((x): x is Note => !!x)
      .map((x) => fileName.get(x.id)!);
    folder.file(`${fileName.get(n.id)}.md`, noteToMarkdown(n, [...new Set(linked)]));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `segundo-cerebro-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
