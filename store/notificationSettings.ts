import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lokt_notif_prefs';

export type NotifPrefs = {
  friendPassedYou: boolean;
  streakAtRisk: boolean;
  friendStartedStudying: boolean;
  closeToGoal: boolean;
};

const DEFAULTS: NotifPrefs = {
  friendPassedYou: true,
  streakAtRisk: true,
  friendStartedStudying: false, // off by default — can be noisy
  closeToGoal: true,
};

export async function getNotifPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveNotifPrefs(patch: Partial<NotifPrefs>): Promise<void> {
  const current = await getNotifPrefs();
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }));
}
