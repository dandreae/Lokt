import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, componentHeights, fonts, type } from '../constants/theme';
import { AppHeader } from '../components/AppHeader';
import { IconButton } from '../components/IconButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { EmptyState } from '../components/EmptyState';
import { ProgressBar } from '../components/ProgressBar';
import { ListDivider } from '../components/ListDivider';
import { getTasks, lookupTask, updateTask } from '../store/tasks';
import { getSessions, deleteSession, getWeekSessions } from '../store/sessions';
import { formatDuration } from '../utils/format';
import type { Task, Session } from '../types';

const GOAL_PRESETS = [
  { label: '30m', secs: 30 * 60 },
  { label: '1h', secs: 3600 },
  { label: '2h', secs: 2 * 3600 },
  { label: '3h', secs: 3 * 3600 },
  { label: '5h', secs: 5 * 3600 },
];

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

function getGoalNote(pct: number, weekSecs: number, goalSecs: number): string {
  if (weekSecs === 0) return 'No sessions logged this week';
  if (pct >= 100) return 'Goal hit this week!';
  if (pct >= 75) return `${formatDuration(goalSecs - weekSecs)} to go — almost there!`;
  if (pct >= 50) return 'More than halfway. Keep going.';
  if (pct >= 25) return 'Building momentum.';
  return 'Every session counts.';
}

export default function TaskDetailScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [showStartOptions, setShowStartOptions] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [customGoalInput, setCustomGoalInput] = useState('');

  function handleDeleteSession(id: string) {
    Alert.alert('Delete Session', 'Remove this session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteSession(id).then(() =>
            setSessions((prev) => prev.filter((s) => s.id !== id))
          ),
      },
    ]);
  }

  async function handleSetGoal(secs: number) {
    if (!taskId) return;
    await updateTask(taskId, { weeklyGoalSecs: secs });
    setTask((t) => t ? { ...t, weeklyGoalSecs: secs } : t);
    setEditingGoal(false);
    setCustomGoalInput('');
  }

  async function handleRemoveGoal() {
    if (!taskId) return;
    await updateTask(taskId, { weeklyGoalSecs: undefined });
    setTask((t) => t ? { ...t, weeklyGoalSecs: undefined } : t);
    setEditingGoal(false);
  }

  function applyCustomGoal() {
    const h = parseFloat(customGoalInput);
    if (!isNaN(h) && h > 0) handleSetGoal(Math.round(h * 3600));
  }

  useFocusEffect(
    useCallback(() => {
      getTasks().then((tasks) => setTask(lookupTask(tasks, taskId ?? '')));
      getSessions().then((all) => {
        setAllSessions(all);
        setSessions(all.filter((s) => s.subjectId === taskId));
      });
      setShowStartOptions(false);
    }, [taskId])
  );

  const weekSessions = getWeekSessions(allSessions).filter((s) => s.subjectId === taskId);
  const weekSecs = weekSessions.reduce((a, s) => a + s.secs, 0);
  const totalSecs = sessions.reduce((a, s) => a + s.secs, 0);
  const hasGoal = task?.weeklyGoalSecs != null && task.weeklyGoalSecs > 0;
  const goalPct = hasGoal
    ? Math.min(Math.round((weekSecs / task!.weeklyGoalSecs!) * 100), 100)
    : 0;
  const accentColor = task?.color ?? colors.accentPrimary;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.backgroundPrimary }} edges={['top', 'bottom']}>
      <AppHeader
        variant="bar"
        title={task?.label ?? '…'}
        subtitle={`${formatDuration(totalSecs)} · ${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
        onBack={() => router.back()}
        right={
          <IconButton
            icon={showStartOptions ? 'close' : 'play'}
            onPress={() => setShowStartOptions((v) => !v)}
            color={accentColor}
            accessibilityLabel={showStartOptions ? 'Cancel' : 'Start'}
          />
        }
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>

        {/* Start options */}
        {showStartOptions && (
          <View style={styles.startOptions}>
            <TouchableOpacity
              style={styles.optionBtn}
              onPress={() => {
                setShowStartOptions(false);
                router.push({ pathname: '/timer', params: { subjectId: taskId, mode: 'stopwatch' } });
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="stopwatch-outline" size={22} color={colors.accentPrimary} />
              <View>
                <Text style={styles.optionLabel}>Stopwatch</Text>
                <Text style={styles.optionSub}>Free-form, stop when done</Text>
              </View>
            </TouchableOpacity>
            <ListDivider />
            <TouchableOpacity
              style={styles.optionBtn}
              onPress={() => {
                setShowStartOptions(false);
                router.push({ pathname: '/timer', params: { subjectId: taskId, mode: 'timer' } });
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="timer-outline" size={22} color={colors.accentSecondary} />
              <View>
                <Text style={styles.optionLabel}>Timer</Text>
                <Text style={styles.optionSub}>Count down from a set time</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Weekly Goal Section */}
        <View style={styles.goalCard}>
          <View style={styles.goalCardHeader}>
            <Text style={styles.goalCardTitle}>Weekly Goal</Text>
            <TouchableOpacity
              onPress={() => setEditingGoal((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.goalEditLink}>
                {editingGoal ? 'Cancel' : hasGoal ? 'Edit' : 'Set goal'}
              </Text>
            </TouchableOpacity>
          </View>

          {!editingGoal && hasGoal && (
            <>
              <View style={styles.goalValueRow}>
                <Text style={styles.goalValue}>{formatDuration(weekSecs)}</Text>
                <Text style={styles.goalValueDim}> / {formatDuration(task!.weeklyGoalSecs!)} this week</Text>
              </View>
              <ProgressBar progress={goalPct / 100} color={accentColor} height={6} />
              <View style={styles.goalFooter}>
                <Text style={styles.goalNote}>
                  {getGoalNote(goalPct, weekSecs, task!.weeklyGoalSecs!)}
                </Text>
                <Text style={[styles.goalPct, { color: accentColor }]}>{goalPct}%</Text>
              </View>
            </>
          )}

          {!editingGoal && !hasGoal && (
            <Text style={styles.noGoalText}>
              No weekly goal set. Tap "Set goal" to track progress.
            </Text>
          )}

          {editingGoal && (
            <View style={styles.goalEditor}>
              <View style={styles.presetRow}>
                {GOAL_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.secs}
                    style={[
                      styles.presetBtn,
                      task?.weeklyGoalSecs === p.secs && styles.presetBtnActive,
                    ]}
                    onPress={() => handleSetGoal(p.secs)}
                    activeOpacity={0.75}
                  >
                    <Text style={[
                      styles.presetText,
                      task?.weeklyGoalSecs === p.secs && styles.presetTextActive,
                    ]}>
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
              {hasGoal && (
                <SecondaryButton title="Remove goal" onPress={handleRemoveGoal} destructive compact />
              )}
            </View>
          )}
        </View>

        {/* Sessions */}
        <Text style={styles.sectionTitle}>Sessions</Text>
        {sessions.length === 0 ? (
          <EmptyState icon="time-outline" title="No sessions yet" subtitle="Hit Start to begin." />
        ) : (
          <View style={styles.sessionList}>
            {sessions.map((s, i) => (
              <View key={s.id}>
                {i > 0 && <ListDivider />}
                <View style={styles.row}>
                  <View style={[styles.rowAccent, { backgroundColor: accentColor }]} />
                  <View style={styles.rowMain}>
                    <Text style={styles.rowDate}>{formatDateTime(s.ts)}</Text>
                    {s.note ? (
                      <Text style={styles.rowNote}>{s.note}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.duration, { color: accentColor }]}>{formatDuration(s.secs)}</Text>
                  <IconButton
                    icon="trash-outline"
                    onPress={() => handleDeleteSession(s.id)}
                    size="sm"
                    color={colors.textMuted}
                    accessibilityLabel="Delete session"
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.section },

  startOptions: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  optionLabel: { fontWeight: '600', fontSize: 15, color: colors.textPrimary },
  optionSub: { ...type.meta, marginTop: 1 },

  goalCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
    gap: spacing.md,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalCardTitle: { fontWeight: '600', fontSize: 14, color: colors.textPrimary },
  goalEditLink: { fontWeight: '500', fontSize: 13, color: colors.accentPrimary },

  goalValueRow: { flexDirection: 'row', alignItems: 'flex-end' },
  goalValue: { fontFamily: fonts.mono, fontSize: 22, color: colors.textPrimary },
  goalValueDim: { fontWeight: '400', fontSize: 14, color: colors.textSecondary },

  goalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalNote: { ...type.meta },
  goalPct: { fontFamily: fonts.mono, fontSize: 12 },

  noGoalText: { fontWeight: '400', fontSize: 13, color: colors.textMuted },

  goalEditor: { gap: spacing.md },
  presetRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  presetBtn: {
    paddingHorizontal: spacing.lg,
    height: componentHeights.chip,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: { backgroundColor: colors.accentPrimary + '33', borderColor: colors.accentPrimary },
  presetText: { fontWeight: '500', fontSize: 13, color: colors.textSecondary },
  presetTextActive: { color: colors.accentPrimary },
  customRow: { flexDirection: 'row', gap: spacing.sm },
  customInput: {
    flex: 1,
    height: componentHeights.buttonCompact,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontWeight: '400',
    fontSize: 14,
    color: colors.textPrimary,
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
  customSetText: { fontWeight: '600', fontSize: 13, color: colors.textPrimary },

  sectionTitle: { ...type.sectionTitle, marginBottom: spacing.md },

  sessionList: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowAccent: { width: 3, height: 28, borderRadius: 1.5, marginRight: spacing.md },
  rowMain: { flex: 1 },
  rowDate: { fontWeight: '600', fontSize: 14, color: colors.textPrimary },
  rowNote: { ...type.meta, marginTop: 3 },
  duration: { fontFamily: fonts.mono, fontSize: 14, marginRight: spacing.xs },
});
