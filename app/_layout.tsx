import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';
import { colors } from '../constants/theme';
import { checkNeedsOnboarding } from '../store/onboarding';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Nunito-Regular':   require('../assets/fonts/Nunito-Regular.ttf'),
    'Nunito-SemiBold':  require('../assets/fonts/Nunito-SemiBold.ttf'),
    'Nunito-Bold':      require('../assets/fonts/Nunito-Bold.ttf'),
    'Nunito-ExtraBold': require('../assets/fonts/Nunito-ExtraBold.ttf'),
    'Nunito-Black':     require('../assets/fonts/Nunito-Black.ttf'),
    'DMMono-Regular':   require('../assets/fonts/DMMono-Regular.ttf'),
    'DMMono-Medium':    require('../assets/fonts/DMMono-Medium.ttf'),
  });

  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  const router = useRouter();
  const segments = useSegments();
  const prevTopSegmentRef = useRef<string | undefined>(undefined);

  // Check auth state on mount and listen for changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-check whenever the session changes, or right after leaving the
  // onboarding route (so the just-set "complete" flag gets picked up
  // promptly instead of staying stale from before the wizard finished).
  useEffect(() => {
    if (!session) { setNeedsOnboarding(null); return; }
    checkNeedsOnboarding().then(setNeedsOnboarding);
  }, [session?.user?.id, segments[0]]);

  // Hide splash screen once fonts AND auth check are both ready
  useEffect(() => {
    if ((fontsLoaded || fontError) && authChecked) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, authChecked]);

  // Redirect based on auth state
  useEffect(() => {
    if (!authChecked) return;
    if (!(fontsLoaded || fontError)) return;

    const topSegment = segments[0];
    // onboarding.tsx is the authoritative source for "I'm done" — the
    // moment it explicitly navigates away from itself (finishing the
    // wizard), trust that instead of the cached `needsOnboarding` value,
    // which was computed before the profile/password steps completed and
    // won't have been re-checked yet on this exact transition.
    const justLeftOnboarding = prevTopSegmentRef.current === 'onboarding' && topSegment !== 'onboarding';
    prevTopSegmentRef.current = topSegment;

    // "onboarding" covers its own routing once a session exists mid-flow
    // (email gets verified partway through) — don't yank the user into
    // tabs until the wizard itself finishes and navigates there.
    const inAuthFlow = topSegment === 'auth' || topSegment === 'onboarding';

    if (!session && !inAuthFlow) {
      router.replace('/onboarding');
      return;
    }
    if (session) {
      if (topSegment === 'auth') { router.replace('/(tabs)'); return; }
      // needsOnboarding starts null (still checking) — only act once it
      // resolves true, and never redirect away from onboarding itself.
      if (!justLeftOnboarding && needsOnboarding === true && topSegment !== 'onboarding') {
        router.replace('/onboarding');
      }
    }
  }, [session, authChecked, fontsLoaded, fontError, segments, needsOnboarding]);

  if ((!fontsLoaded && !fontError) || !authChecked) return null;

  return (
    <>
      <StatusBar style="light" backgroundColor={colors.backgroundPrimary} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.backgroundSecondary },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: '700', fontSize: 18 },
          contentStyle: { backgroundColor: colors.backgroundPrimary },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="task-detail" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="timer" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="groups" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
