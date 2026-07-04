// Notification scheduling and copy.
// Requires: npx expo install expo-notifications
// Falls back silently if the package is not yet installed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getN(): Promise<any | null> {
  try {
    // Dynamic require so the module compiles even before expo-notifications is installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch {
    return null;
  }
}

async function send(title: string, body: string, trigger: unknown = null): Promise<void> {
  const N = await getN();
  if (!N) return;
  try {
    await N.scheduleNotificationAsync({ content: { title, body, sound: true }, trigger });
  } catch {
    // Permission denied or scheduling failed
  }
}

// ─── Permission ────────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const N = await getN();
  if (!N) return false;
  try {
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function getNotificationPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  const N = await getN();
  if (!N) return 'undetermined';
  try {
    const { status } = await N.getPermissionsAsync();
    return status;
  } catch {
    return 'undetermined';
  }
}

// ─── Notification copy ─────────────────────────────────────────────────────────

/**
 * A friend just moved ahead on the leaderboard.
 * minsAhead: how many minutes of study time they lead by.
 */
export async function notifyFriendPassed(friendName: string, minsAhead: number): Promise<void> {
  const gap = minsAhead < 60
    ? `${minsAhead}m`
    : `${Math.floor(minsAhead / 60)}h ${minsAhead % 60}m`.replace(' 0m', '');
  const body = minsAhead <= 90
    ? `${friendName} moved ahead by ${gap}. You can still catch up.`
    : `${friendName} just overtook you. Time to respond.`;
  await send('You just got passed 👀', body);
}

/**
 * User has not studied today and their streak is at risk.
 * Fires at 8 pm if no session logged that day.
 */
export async function scheduleStreakRisk(streakDays: number): Promise<void> {
  let body: string;
  if (streakDays >= 14) {
    body = `${streakDays} days straight. Don't let tonight be the one that breaks it.`;
  } else if (streakDays >= 7) {
    body = `Your ${streakDays}-day streak ends at midnight. 10 minutes is enough to keep it.`;
  } else if (streakDays > 1) {
    body = `Your ${streakDays}-day streak ends tonight. Don't let it slip — 10 minutes counts.`;
  } else {
    body = `Start your streak today. Even a short session counts.`;
  }
  await send('Streak at risk ⚡', body, { hour: 20, minute: 0, repeats: false });
}

/**
 * A friend just started a study session.
 */
export async function notifyFriendStartedStudying(friendName: string): Promise<void> {
  await send(
    `${friendName} just opened their books`,
    `They're getting ahead right now. Want to join them?`
  );
}

/**
 * User is close to hitting their weekly study goal.
 * minsRemaining: minutes left to reach the goal.
 */
export async function notifyCloseToGoal(minsRemaining: number): Promise<void> {
  const remaining = minsRemaining <= 10
    ? `Less than 10 minutes from your weekly goal. Finish it.`
    : minsRemaining <= 30
    ? `${minsRemaining} minutes from your weekly goal. One short session does it.`
    : `${minsRemaining} minutes from your weekly goal. Make it count this week.`;
  await send(`Almost there`, remaining);
}

/**
 * Cancel all pending local notifications (call on app close or settings change).
 */
export async function cancelAllNotifications(): Promise<void> {
  const N = await getN();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
  } catch {
    // Ignore
  }
}
