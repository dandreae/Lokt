import { supabase, getUserId } from '../utils/supabase';
import type { Task } from '../types';
import { PREVIEW, PREVIEW_TASKS } from '../utils/previewData';

// Converts a raw Supabase row into the Task shape the rest of the app uses.
// Main difference: weekly_goal_secs (snake_case DB) → weeklyGoalSecs (camelCase app)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTask(row: any): Task {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    weeklyGoalSecs: row.weekly_goal_secs ?? undefined,
  };
}

export async function getTasks(): Promise<Task[]> {
  if (PREVIEW) return [...PREVIEW_TASKS];
  const userId = await getUserId();
  if (!userId) {
    console.warn('getTasks: no user session');
    return [];
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('getTasks error:', error.message);
    return [];
  }
  return (data ?? []).map(rowToTask);
}

// Insert a new task. The ID must be a valid UUID — use generateId() from
// utils/supabase.ts when calling this, not Date.now().toString().
export async function createTask(task: Task): Promise<void> {
  const userId = await getUserId();
  if (!userId) {
    console.warn('createTask: no user session');
    return;
  }

  const { error } = await supabase.from('tasks').insert({
    id: task.id,
    user_id: userId,
    label: task.label,
    color: task.color,
    weekly_goal_secs: task.weeklyGoalSecs ?? null,
  });

  if (error) {
    console.error('createTask error:', error.message, error.details, error.hint);
  }
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.weeklyGoalSecs !== undefined) update.weekly_goal_secs = patch.weeklyGoalSecs;

  await supabase
    .from('tasks')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId);
}

export async function deleteTask(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
}

// Returns a fallback if the task was deleted, so the UI never crashes on stale session data.
export function lookupTask(tasks: Task[], id: string): Task {
  return tasks.find((t) => t.id === id) ?? { id, label: 'Unknown', color: '#9898b8' };
}

// Ensures a default "Overall" task exists for the user.
// Used as a fallback when starting a session with no specific task selected.
export async function ensureOverallTask(): Promise<Task> {
  const userId = await getUserId();
  if (!userId) return { id: '', label: 'Overall', color: '#9898b8' };

  const { data: existing } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('label', 'Overall')
    .maybeSingle();

  if (existing) return rowToTask(existing);

  const { data: created } = await supabase
    .from('tasks')
    .insert({ user_id: userId, label: 'Overall', color: '#9898b8' })
    .select()
    .single();

  return created ? rowToTask(created) : { id: '', label: 'Overall', color: '#9898b8' };
}

export const TASK_COLORS = [
  '#3FAF72', '#6cb4f7', '#7c6ff7', '#f7a76c',
  '#f7d96c', '#f76cbf', '#f76c6c', '#5ee8e8', '#9898b8',
];
