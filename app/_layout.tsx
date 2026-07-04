import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';
import { C } from '../constants/colors';

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

  const router = useRouter();
  const segments = useSegments();

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

    const inAuth = segments[0] === 'auth';

    if (!session && !inAuth) {
      router.replace('/auth');
    } else if (session && inAuth) {
      router.replace('/(tabs)');
    }
  }, [session, authChecked, fontsLoaded, fontError, segments]);

  if ((!fontsLoaded && !fontError) || !authChecked) return null;

  return (
    <>
      <StatusBar style="light" backgroundColor={C.bg} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.surface1 },
          headerTintColor: C.text1,
          headerTitleStyle: { fontFamily: 'Nunito-Bold', fontSize: 18 },
          contentStyle: { backgroundColor: C.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="task-detail" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="stopwatch" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="timer" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'card' }} />
      </Stack>
    </>
  );
}
