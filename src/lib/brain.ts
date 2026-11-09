import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { extractHashtags, mergeTags } from "./markdown-utils";
import { syncWikilinks } from "./wikilink-sync";
import { todayISO, formatDateBR } from "./tasks-utils";

export type Note = Omit<Tables<"notes">, "search_vector" | "user_id">;
export type Link = Tables<"links">;
export type Task = Tables<"tasks">;
export type CalendarEvent = Tables<"events">;

const NOTE_COLS =
  "id,title,content,summary,type,tags,source_kind,attachment_path,source_url,og_image,status,progress,error_message,entities,is_shared,share_token,pinned,daily_date,created_at,updated_at";

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const notesQuery = queryOptions({
  queryKey: ["notes"],
  queryFn: () =>
    fetchAll<Note>((a, b) =>
      supabase.from("notes").select(NOTE_COLS).order("updated_at", { ascending: false }).range(a, b) as never,
    ),
});

export const linksQuery = queryOptions({
  queryKey: ["links"],
  queryFn: () => fetchAll<Link>((a, b) => supabase.from("links").select("*").range(a, b) as never),
});

export const tasksQuery = queryOptions({
  queryKey: ["tasks"],
  queryFn: () =>
    fetchAll<Task>((a, b) => supabase.from("tasks").select("*").order("due_date", { ascending: true }).range(a, b) as never),
});

export const eventsQuery = queryOptions({
  queryKey: ["events"],
  queryFn: () =>
    fetchAll<CalendarEvent>((a, b) => supabase.from("events").select("*").order("starts_at", { ascending: true }).range(a, b) as never),
});

export async function confirmEvent(id: string) {
  const { error } = await supabase.from("events").update({ status: "confirmado" }).eq("id", id);
  if (error) throw error;
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada. Entre novamente.");
  return data.user.id;
}

export function invalidateBrain(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["notes"] });
  qc.invalidateQueries({ queryKey: ["links"] });
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: ["events"] });
}

export async function createNote(input: Partial<Note> & { title: string }) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("notes")
    .insert({ ...input, user_id, entities: input.entities ?? {} })
    .select(NOTE_COLS)
    .single();
  if (error) throw error;
  return data as Note;
}

export async function saveNoteContent(note: Pick<Note, "id" | "tags">, patch: { title?: string; content?: string }) {
  const user_id = await currentUserId();
  const update: Partial<Note> = { ...patch };
  if (patch.content !== undefined) update.tags = mergeTags(note.tags, extractHashtags(patch.content));
  const { error } = await supabase.from("notes").update(update).eq("id", note.id);
  if (error) throw error;
  if (patch.content !== undefined) await syncWikilinks(supabase, user_id, note.id, patch.content);
}

export async function updateNote(id: string, patch: Partial<Note>) {
  const { error } = await supabase.from("notes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteNote(note: Note) {
  if (note.attachment_path) await supabase.storage.from("anexos").remove([note.attachment_path]);
  const { error } = await supabase.from("notes").delete().eq("id", note.id);
  if (error) throw error;
}

export async function setLinkStatus(id: string, status: "aceita" | "rejeitada") {
  const { error } = await supabase.from("links").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function createManualLink(source: string, target: string, reason?: string) {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from("links")
    .upsert(
      { user_id, source_note_id: source, target_note_id: target, kind: "manual", status: "aceita", confidence: 1, reason },
      { onConflict: "source_note_id,target_note_id" },
    );
  if (error) throw error;
}

export async function setTaskDone(id: string, done: boolean) {
  const { error } = await supabase.from("tasks").update({ done }).eq("id", id);
  if (error) throw error;
}

export async function getOrCreateDaily(notes: Note[]) {
  const today = todayISO();
  const found = notes.find((n) => n.daily_date === today);
  if (found) return found;
  const { data } = await supabase.from("notes").select(NOTE_COLS).eq("daily_date", today).maybeSingle();
  if (data) return data as Note;
  return createNote({
    title: `Diário ${formatDateBR(today)}`,
    type: "diario",
    daily_date: today,
    tags: ["diario"],
    content: `# Diário ${formatDateBR(today)}\n\n`,
    status: "pronta",
  });
}

export async function setSharing(note: Note, on: boolean) {
  const token = on ? (note.share_token ?? crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().slice(0, 8)) : note.share_token;
  await updateNote(note.id, { is_shared: on, share_token: on ? token : null });
  return token;
}

export async function signedUrl(path: string, seconds = 3600) {
  const { data, error } = await supabase.storage.from("anexos").createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export const LIMITS = {
  audio: 25 * 1024 * 1024,
  arquivo: 20 * 1024 * 1024,
  imagem: 10 * 1024 * 1024,
};
