import { supabase, getUserId } from '../utils/supabase';
import type { Session } from '../types';

// Converts a raw Supabase row into the Session shape the rest of the app uses.
// The main differences:
//   - task_id (Supabase) → subjectId (app)
//   - created_at string  → ts number (milliseconds since epoch)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSession(row: any): Session {
  return {
    id: row.id,
    subjectId: row.task_id ?? '',
    secs: row.secs,
    note: row.note ?? '',
    ts: new Date(row.created_at).getTime(),
  };
}

// Fetch all sessions for the logged-in user, newest first.
export async function getSessions(): Promise<Session[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map(rowToSession);
}

// Save a new session to the database.
// We pass created_at explicitly so it reflects when the session actually
// happened (not when the INSERT runs, which could be slightly later).
export async function saveSession(session: Session): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase.from('sessions').insert({
    id: session.id,
    user_id: userId,
    task_id: session.subjectId || null,
    secs: session.secs,
    note: session.note,
    created_at: new Date(session.ts).toISOString(),
  });
}

// Delete a single session by its ID.
// We always filter by user_id too — extra safety so users can't
// delete each other's data even if something goes wrong.
export async function deleteSession(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase
    .from('sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
}

// Delete all sessions belonging to a specific task.
// Called when the user deletes a task (with the warning dialog).
export async function deleteSessionsByTaskId(taskId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase
    .from('sessions')
    .delete()
    .eq('task_id', taskId)
    .eq('user_id', userId);
}

// These two filter an already-loaded list of sessions in memory.
// No database call needed — we just slice the data we already have.
export function getWeekSessions(sessions: Session[]): Session[] {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => s.ts >= weekAgo);
}

export function getTodaySessions(sessions: Session[]): Session[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return sessions.filter((s) => s.ts >= start.getTime());
}
