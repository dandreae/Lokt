import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getUserId } from '../utils/supabase';

const KEY = 'lokt_onboarding_complete';

// Local, device-scoped flag — there's no `onboarded` column on the server,
// so this is what keeps a returning user from being sent through the
// onboarding wizard again after they've already set up their profile.
export async function getOnboardingComplete(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // ignore
  }
}

// The local flag alone isn't enough: it was never set for accounts created
// before onboarding existed, which would otherwise force every existing
// user back through the wizard on their first launch after this update.
// Fall back to checking whether a username is already set — if so, this
// account clearly already finished the old signup flow (or a previous
// onboarding pass), so backfill the flag and let them straight in.
//
// This deliberately selects ONLY `username` (a column that has existed
// since day one) rather than reusing getMyProfile()'s full select, so it
// keeps working correctly even before the avatar_color/phone migration
// has been applied. It also fails OPEN: any unexpected error here should
// never trap an already-working, already-signed-in user in a redirect
// loop back to onboarding.
export async function checkNeedsOnboarding(): Promise<boolean> {
  try {
    if (await getOnboardingComplete()) return false;

    const userId = await getUserId();
    if (!userId) return false;

    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle();

    if (error) { console.error('checkNeedsOnboarding error:', error.message); return false; }

    if (data?.username) {
      await setOnboardingComplete();
      return false;
    }
    return true;
  } catch (e) {
    console.error('checkNeedsOnboarding failed:', e);
    return false;
  }
}
