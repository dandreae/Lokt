import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../constants/colors';
import { getSettings, saveSettings } from '../store/settings';
import { supabase } from '../utils/supabase';
import { getNotifPrefs, saveNotifPrefs, type NotifPrefs } from '../store/notificationSettings';
import {
  requestNotificationPermission,
  getNotificationPermission,
} from '../utils/notifications';
import { formatDuration } from '../utils/format';

const GOAL_PRESETS = [
  { label: '4h', secs: 4 * 3600 },
  { label: '6h', secs: 6 * 3600 },
  { label: '8h', secs: 8 * 3600 },
  { label: '10h', secs: 10 * 3600 },
  { label: '12h', secs: 12 * 3600 },
];

type NotifItem = {
  key: keyof NotifPrefs;
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
};

const NOTIF_ITEMS: NotifItem[] = [
  {
    key: 'friendPassedYou',
    icon: 'trending-up-outline',
    iconColor: C.red,
    title: 'Friend overtakes you',
    subtitle: 'When someone moves ahead on the leaderboard',
  },
  {
    key: 'streakAtRisk',
    icon: 'flame-outline',
    iconColor: '#f7a76c',
    title: 'Streak at risk',
    subtitle: "Reminder at 8 pm if you haven't studied today",
  },
  {
    key: 'friendStartedStudying',
    icon: 'people-outline',
    iconColor: C.accent,
    title: 'Friend started studying',
    subtitle: 'When someone in your group opens their books',
  },
  {
    key: 'closeToGoal',
    icon: 'flag-outline',
    iconColor: C.accent2,
    title: 'Close to weekly goal',
    subtitle: "When you're within 30–60 minutes of hitting it",
  },
];

// ─── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      tension: 70,
      friction: 11,
    }).start();
  }, [value]);

  const trackBg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.surface3, C.accent],
  });
  const thumbX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 20],
  });

  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      activeOpacity={0.85}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View style={[styles.toggleTrack, { backgroundColor: trackBg }]}>
        <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: thumbX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── PermissionBanner ──────────────────────────────────────────────────────────

function PermissionBanner({ onRequest }: { onRequest: () => void }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 900,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.permBanner}>
      <View style={styles.permIconWrap}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Ionicons name="notifications-off-outline" size={20} color={C.text3} />
        </Animated.View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.permTitle}>Notifications are off</Text>
        <Text style={styles.permSub}>Enable to receive social alerts from your study group.</Text>
      </View>
      <TouchableOpacity style={styles.permBtn} onPress={onRequest} activeOpacity={0.75}>
        <Text style={styles.permBtnText}>Enable</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const [weeklyGoalSecs, setWeeklyGoalSecs] = useState(8 * 3600);
  const [customGoalInput, setCustomGoalInput] = useState('');
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    friendPassedYou: true,
    streakAtRisk: true,
    friendStartedStudying: false,
    closeToGoal: true,
  });
  const [permStatus, setPermStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  useEffect(() => {
    getSettings().then((s) => setWeeklyGoalSecs(s.weeklyGoalSecs));
    getNotifPrefs().then(setNotifPrefs);
    getNotificationPermission().then(setPermStatus);
  }, []);

  function applyGoal(secs: number) {
    setWeeklyGoalSecs(secs);
    saveSettings({ weeklyGoalSecs: secs });
    setCustomGoalInput('');
  }

  function applyCustomGoal() {
    const h = parseFloat(customGoalInput);
    if (!isNaN(h) && h > 0) applyGoal(Math.round(h * 3600));
  }

  const handleToggle = useCallback((key: keyof NotifPrefs, value: boolean) => {
    const next = { ...notifPrefs, [key]: value };
    setNotifPrefs(next);
    saveNotifPrefs({ [key]: value });
  }, [notifPrefs]);

  const handleRequestPermission = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setPermStatus(granted ? 'granted' : 'denied');
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.customHeader}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={C.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* ── Weekly Goal ── */}
        <Text style={styles.sectionLabel}>Weekly Study Goal</Text>
        <View style={styles.card}>
          <Text style={styles.currentGoal}>{formatDuration(weeklyGoalSecs)} / week</Text>
          <View style={styles.presetRow}>
            {GOAL_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.secs}
                style={[styles.presetBtn, weeklyGoalSecs === p.secs && styles.presetBtnActive]}
                onPress={() => applyGoal(p.secs)}
                activeOpacity={0.75}
              >
                <Text style={[styles.presetText, weeklyGoalSecs === p.secs && styles.presetTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              placeholder="Custom (hours)"
              placeholderTextColor={C.text3}
              value={customGoalInput}
              onChangeText={setCustomGoalInput}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={applyCustomGoal}
            />
            <TouchableOpacity style={styles.customSetBtn} onPress={applyCustomGoal} activeOpacity={0.75}>
              <Text style={styles.customSetText}>Set</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Notifications ── */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <Text style={styles.sectionSub}>
          Alerts are social and time-sensitive — not generic reminders.
        </Text>

        {permStatus !== 'granted' && (
          <PermissionBanner onRequest={handleRequestPermission} />
        )}

        <View style={styles.notifCard}>
          {NOTIF_ITEMS.map((item, i) => (
            <View key={item.key}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.notifRow}>
                <View style={[styles.notifIconWrap, { backgroundColor: item.iconColor + '22' }]}>
                  <Ionicons name={item.icon as never} size={18} color={item.iconColor} />
                </View>
                <View style={styles.notifText}>
                  <Text style={styles.notifTitle}>{item.title}</Text>
                  <Text style={styles.notifSub}>{item.subtitle}</Text>
                </View>
                <Toggle
                  value={notifPrefs[item.key]}
                  onChange={(v) => handleToggle(item.key, v)}
                />
              </View>
            </View>
          ))}
        </View>

        {/* ── About ── */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App</Text>
            <Text style={styles.aboutValue}>Lokt</Text>
          </View>
          <View style={[styles.aboutRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
        </View>

        {/* ── Log Out ── */}
        <TouchableOpacity
          style={styles.logoutBtn}
          activeOpacity={0.75}
          onPress={() => {
            Alert.alert('Log Out', 'Are you sure you want to log out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
            ]);
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={C.red} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surface1,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { fontFamily: 'Nunito-Bold', fontSize: 18, color: C.text1 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },

  sectionLabel: {
    fontFamily: 'Nunito-Bold',
    fontSize: 12,
    color: C.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 8,
  },
  sectionSub: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: C.text3,
    marginBottom: 14,
    lineHeight: 17,
  },

  card: {
    backgroundColor: C.surface1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 28,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  currentGoal: {
    fontFamily: 'Nunito-Black',
    fontSize: 22,
    color: C.accent,
  },

  presetRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: { backgroundColor: C.accent + '33', borderColor: C.accent },
  presetText: { fontFamily: 'Nunito-SemiBold', fontSize: 13, color: C.text2 },
  presetTextActive: { color: C.accent },

  customRow: { flexDirection: 'row', gap: 8 },
  customInput: {
    flex: 1,
    height: 40,
    backgroundColor: C.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    fontFamily: 'Nunito-Regular',
    fontSize: 14,
    color: C.text1,
  },
  customSetBtn: {
    backgroundColor: C.surface2,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    height: 40,
  },
  customSetText: { fontFamily: 'Nunito-Bold', fontSize: 13, color: C.text1 },

  // permission banner
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  permIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permTitle: { fontFamily: 'Nunito-Bold', fontSize: 13, color: C.text1, marginBottom: 2 },
  permSub: { fontFamily: 'Nunito-Regular', fontSize: 11, color: C.text3, lineHeight: 15 },
  permBtn: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  permBtnText: { fontFamily: 'Nunito-Bold', fontSize: 13, color: '#fff' },

  // notification rows
  notifCard: {
    backgroundColor: C.surface1,
    borderRadius: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 64,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  notifIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifText: { flex: 1 },
  notifTitle: { fontFamily: 'Nunito-SemiBold', fontSize: 14, color: C.text1, marginBottom: 2 },
  notifSub: { fontFamily: 'Nunito-Regular', fontSize: 11, color: C.text3, lineHeight: 15 },

  // toggle
  toggleTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  toggleThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    top: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },

  // about
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  aboutLabel: { fontFamily: 'Nunito-Regular', fontSize: 14, color: C.text2 },
  aboutValue: { fontFamily: 'Nunito-SemiBold', fontSize: 14, color: C.text1 },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  logoutText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: C.red,
  },
});
