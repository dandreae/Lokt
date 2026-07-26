import { useState, useEffect, useCallback, type ComponentProps } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../components/AppHeader';
import { SettingsSection, SettingsRow } from '../components/SettingsRow';
import { Toggle } from '../components/Toggle';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { colors, spacing, radii, componentHeights, type } from '../constants/theme';
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
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  helper: string;
};

const NOTIF_ITEMS: NotifItem[] = [
  {
    key: 'friendPassedYou',
    icon: 'trending-up-outline',
    label: 'Friend overtakes you',
    helper: 'When someone moves ahead on the leaderboard',
  },
  {
    key: 'streakAtRisk',
    icon: 'flame-outline',
    label: 'Streak at risk',
    helper: "Reminder at 8 pm if you haven't studied today",
  },
  {
    key: 'friendStartedStudying',
    icon: 'people-outline',
    label: 'Friend started studying',
    helper: 'When someone in your group opens their books',
  },
  {
    key: 'closeToGoal',
    icon: 'flag-outline',
    label: 'Close to weekly goal',
    helper: "When you're within 30–60 minutes of hitting it",
  },
];

// ─── PermissionBanner ──────────────────────────────────────────────────────────

function PermissionBanner({ onRequest }: { onRequest: () => void }) {
  return (
    <View style={styles.permBanner}>
      <View style={styles.permIconWrap}>
        <Ionicons name="notifications-off-outline" size={20} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.permTitle}>Notifications are off</Text>
        <Text style={styles.permSub}>Enable to receive social alerts from your study group.</Text>
      </View>
      <PrimaryButton title="Enable" onPress={onRequest} compact style={styles.permBtn} />
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.backgroundPrimary }} edges={['top']}>
      <AppHeader variant="bar" title="Settings" onBack={() => router.back()} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>

        {/* ── Weekly Goal ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Study Goal</Text>
          <View style={styles.goalCard}>
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
                placeholderTextColor={colors.textMuted}
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
        </View>

        {/* ── Notifications ── */}
        {permStatus !== 'granted' && (
          <PermissionBanner onRequest={handleRequestPermission} />
        )}

        <SettingsSection title="Notifications">
          {NOTIF_ITEMS.map((item) => (
            <SettingsRow
              key={item.key}
              icon={item.icon}
              label={item.label}
              helper={item.helper}
              right={<Toggle value={notifPrefs[item.key]} onChange={(v) => handleToggle(item.key, v)} />}
            />
          ))}
        </SettingsSection>

        {/* ── About ── */}
        <SettingsSection title="About">
          <SettingsRow label="App" right={<Text style={styles.aboutValue}>Lokt</Text>} />
          <SettingsRow label="Version" right={<Text style={styles.aboutValue}>1.0.0</Text>} />
        </SettingsSection>

        {/* ── Log Out ── */}
        <SecondaryButton
          title="Log Out"
          destructive
          style={styles.logoutBtn}
          onPress={() => {
            Alert.alert('Log Out', 'Are you sure you want to log out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
            ]);
          }}
        />

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.section },

  section: { marginBottom: spacing.xxl },
  sectionTitle: { ...type.sectionTitle, marginBottom: spacing.sm, marginLeft: spacing.xs },

  goalCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },

  currentGoal: {
    ...type.display,
    fontSize: 26,
    color: colors.accentPrimary,
  },

  presetRow: { flexDirection: 'row', gap: spacing.sm },
  presetBtn: {
    flex: 1,
    height: componentHeights.chip,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
  presetText: { ...type.bodyMedium, fontSize: 13, color: colors.textSecondary },
  presetTextActive: { color: colors.textOnAccent },

  customRow: { flexDirection: 'row', gap: spacing.sm },
  customInput: {
    flex: 1,
    height: componentHeights.buttonCompact,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    ...type.body,
    fontSize: 14,
  },
  customSetBtn: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    height: componentHeights.buttonCompact,
  },
  customSetText: { ...type.bodyMedium, fontSize: 13 },

  // permission banner
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  permIconWrap: {
    width: componentHeights.chip,
    height: componentHeights.chip,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permTitle: { ...type.bodyMedium, marginBottom: 2 },
  permSub: { ...type.meta, lineHeight: 15 },
  permBtn: { alignSelf: 'center' },

  // about
  aboutValue: { ...type.body, fontSize: 14, color: colors.textSecondary },

  logoutBtn: { marginTop: spacing.sm },
});
