import { supabase, getUserId } from '../utils/supabase';
import { PREVIEW, PREVIEW_SETTINGS } from '../utils/previewData';

export type Settings = {
  weeklyGoalSecs: number;
};

const DEFAULTS: Settings = { weeklyGoalSecs: 8 * 3600 };

// Load the user's settings from Supabase.
// If they haven't saved any yet (new user), return the defaults.
export async function getSettings(): Promise<Settings> {
  if (PREVIEW) return { ...PREVIEW_SETTINGS };
  const userId = await getUserId();
  if (!userId) return { ...DEFAULTS };

  const { data } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return { ...DEFAULTS };

  return {
    weeklyGoalSecs: data.weekly_goal_secs ?? DEFAULTS.weeklyGoalSecs,
  };
}

// Save settings to Supabase using UPSERT.
// Upsert = "insert if no row exists for this user, update if one does."
// This means the first time a user saves settings it creates the row,
// every time after that it just updates it. No need to check first.
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const current = await getSettings();
  const merged = { ...current, ...patch };

  await supabase.from('settings').upsert({
    user_id: userId,
    weekly_goal_secs: merged.weeklyGoalSecs,
  });
}
