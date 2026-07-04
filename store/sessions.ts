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

// created_at is passed explicitly so it reflects when the session happened,
// not when the INSERT runs (the two can differ if the user is offline or slow).
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

// user_id is included in the filter as a safety net alongside RLS.
export async function deleteSession(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase
    .from('sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
}

// Called before deleting a task so orphaned session records are cleaned up.
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
