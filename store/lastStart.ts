import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lokt_last_start';

export type LastStart = {
  mode: 'stopwatch' | 'timer';
  taskId: string | null;
};

const DEFAULTS: LastStart = { mode: 'stopwatch', taskId: null };

export async function getLastStart(): Promise<LastStart> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export async function saveLastStart(config: LastStart): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}
