import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radii, componentHeights, fonts, shadows, type } from '../../constants/theme';
import { AppHeader } from '../../components/AppHeader';
import { IconButton } from '../../components/IconButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { ProgressBar } from '../../components/ProgressBar';
import { ScalePressable } from '../../utils/ScalePressable';
import { getSubjectIcon } from '../../utils/subjectIcon';
import { SubjectIcon } from '../../components/SubjectIcon';
import { getTasks, createTask, deleteTask, TASK_COLORS } from '../../store/tasks';
import { generateId } from '../../utils/supabase';
import { getSessions, getWeekSessions, deleteSessionsByTaskId } from '../../store/sessions';
import { formatDuration } from '../../utils/format';
import type { Task, Session } from '../../types';

const GOAL_PRESETS = [
  { label: '30m', secs: 30 * 60 },
  { label: '1h', secs: 3600 },
  { label: '2h', secs: 2 * 3600 },
  { label: '3h', secs: 3 * 3600 },
  { label: '5h', secs: 5 * 3600 },
];

function getGoalNote(pct: number, weekSecs: number, goalSecs: number): string {
  if (weekSecs === 0) return 'No sessions this week';
  if (pct >= 100) return 'Goal hit this week!';
  if (pct >= 75) return `${formatDuration(goalSecs - weekSecs)} to go`;
  if (pct >= 50) return 'More than halfway';
  if (pct >= 25) return 'Building momentum';
  return 'Keep going';
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Consecutive-day streak scoped to one task's own sessions — pure
// presentational derivation from existing session data, same technique
// used for the profile's overall streak.
function computeTaskStreak(taskSessions: Session[]): number {
  if (!taskSessions.length) return 0;
  const days = new Set(taskSessions.map((s) => dateKey(new Date(s.ts))));
  const today = new Date();
  const offset = days.has(dateKey(today)) ? 0 : 1;
  let n = 0;
  for (let i = offset; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (days.has(dateKey(d))) n++;
    else break;
  }
  return n;
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, sessions, weekSessions, onPress, onOptions }: {
  task: Task;
  sessions: Session[];
  weekSessions: Session[];
  onPress: () => void;
  onOptions: () => void;
}) {
  const taskSessions = sessions.filter((s) => s.subjectId === task.id);
  const totalSecs = taskSessions.reduce((a, s) => a + s.secs, 0);
  const weekTaskSecs = weekSessions.filter((s) => s.subjectId === task.id).reduce((a, s) => a + s.secs, 0);
  const hours = isNaN(totalSecs) ? '0.0' : (totalSecs / 3600).toFixed(1);
  const streak = computeTaskStreak(taskSessions);
  const icon = getSubjectIcon(task.label);

  const hasGoal = task.weeklyGoalSecs != null && task.weeklyGoalSecs > 0;
  const goalPct = hasGoal ? Math.min(Math.round((weekTaskSecs / task.weeklyGoalSecs!) * 100), 100) : 0;
  const goalNote = hasGoal ? getGoalNote(goalPct, weekTaskSecs, task.weeklyGoalSecs!) : '';

  return (
    <ScalePressable onPress={onPress} scaleTo={0.98} style={[styles.cardWrapper, shadows.tinted(task.color)]}>
      <View style={[styles.card, { borderColor: task.color + '2A' }]}>
        <View style={[StyleSheet.absoluteFill, styles.cardTint, { backgroundColor: task.color }]} pointerEvents="none" />

        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconTile, { backgroundColor: task.color + '24', borderColor: task.color + '40' }]}>
              <SubjectIcon icon={icon} size={20} color={task.color} />
            </View>

            <View style={styles.cardTitleCol}>
              <Text style={styles.label} numberOfLines={1}>{task.label}</Text>
              <Text style={styles.meta}>
                {taskSessions.length} session{taskSessions.length !== 1 ? 's' : ''} · {hours}h total
              </Text>
            </View>

            <View style={styles.cardTopRight}>
              {streak > 0 && (
                <View style={[styles.streakChip, { backgroundColor: colors.warning + '1c', borderColor: colors.warning + '33' }]}>
                  <Ionicons name="flame" size={11} color={colors.warning} />
                  <Text style={[styles.streakText, { color: colors.warning }]}>{streak}d</Text>
                </View>
              )}
              <IconButton
                icon="ellipsis-horizontal"
                onPress={onOptions}
                size="sm"
                color={colors.textMuted}
                accessibilityLabel="Task options"
              />
            </View>
          </View>

          {hasGoal ? (
            <View style={styles.goalSection}>
              <ProgressBar progress={goalPct / 100} color={task.color} height={8} gradient glow />
              <View style={styles.goalFooter}>
                <Text style={styles.goalNote}>{goalNote}</Text>
                <Text style={[styles.goalPct, { color: task.color }]}>{goalPct}%</Text>
              </View>
            </View>
          ) : (
            <View style={styles.noGoalRow}>
              <View style={styles.ghostChip}>
                <Ionicons name="flag-outline" size={12} color={colors.textMuted} />
                <Text style={styles.ghostChipText} numberOfLines={1}>
                  {weekTaskSecs > 0 ? `${formatDuration(weekTaskSecs)} this week` : 'No weekly goal set'}
                </Text>
              </View>
              <View style={[styles.setGoalChip, { backgroundColor: task.color + '22', borderColor: task.color + '55' }]}>
                <Text style={[styles.setGoalText, { color: task.color }]}>+ Set goal</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </ScalePressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function TasksScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(TASK_COLORS[0]);
  const [newGoalSecs, setNewGoalSecs] = useState<number | undefined>(undefined);
  const [customGoalInput, setCustomGoalInput] = useState('');

  const reload = useCallback(() => {
    getTasks().then(setTasks);
    getSessions().then(setSessions);
  }, []);

  useFocusEffect(reload);

  function handleCreate() {
    const label = newLabel.trim();
    if (!label) return;
    createTask({
      id: generateId(),
      label,
      color: newColor,
      weeklyGoalSecs: newGoalSecs,
    }).then(() => {
      setNewLabel('');
      setNewColor(TASK_COLORS[0]);
      setNewGoalSecs(undefined);
      setCustomGoalInput('');
      setShowForm(false);
      reload();
    }).catch((e) => {
      console.error('handleCreate failed:', e);
    });
  }

  function applyCustomGoal() {
    const h = parseFloat(customGoalInput);
    if (!isNaN(h) && h > 0) {
      setNewGoalSecs(Math.round(h * 3600));
      setCustomGoalInput('');
    }
  }

  function handleTaskOptions(task: Task) {
    const count = sessions.filter((s) => s.subjectId === task.id).length;
    const message = count > 0
      ? `"${task.label}" and its ${count} session log${count !== 1 ? 's' : ''} will be permanently deleted.`
      : `"${task.label}" will be permanently deleted.`;
    Alert.alert(task.label, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Task',
        style: 'destructive',
        onPress: () =>
          deleteSessionsByTaskId(task.id)
            .then(() => deleteTask(task.id))
            .then(reload),
      },
    ]);
  }

  const weekSessions = getWeekSessions(sessions);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LinearGradient
        colors={[colors.backgroundSecondary, colors.backgroundPrimary]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <AppHeader variant="large" title="Tasks" />
            <Text style={styles.subtitle}>Track your progress. Build momentum.</Text>
          </View>
          <ScalePressable onPress={() => setShowForm((v) => !v)} scaleTo={0.9} style={[styles.fab, shadows.tinted(colors.accentPrimary)]}>
            <Ionicons name={showForm ? 'close' : 'add'} size={26} color={colors.textOnAccent} />
          </ScalePressable>
        </View>

        {showForm && (
          <View style={styles.form}>
            <TextInput
              style={styles.labelInput}
              placeholder="Task name…"
              placeholderTextColor={colors.textMuted}
              value={newLabel}
              onChangeText={setNewLabel}
              returnKeyType="done"
              autoFocus
            />
            <Text style={type.sectionTitle}>Color</Text>
            <View style={styles.colorRow}>
              {TASK_COLORS.map((col) => (
                <TouchableOpacity
                  key={col}
                  style={[styles.swatch, { backgroundColor: col }, newColor === col && styles.swatchSelected]}
                  onPress={() => setNewColor(col)}
                  activeOpacity={0.8}
                />
              ))}
            </View>
            <Text style={type.sectionTitle}>Weekly Goal (optional)</Text>
            <View style={styles.goalPresetRow}>
              {GOAL_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.secs}
                  style={[styles.goalPresetBtn, newGoalSecs === p.secs && styles.goalPresetBtnActive]}
                  onPress={() => setNewGoalSecs(newGoalSecs === p.secs ? undefined : p.secs)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.goalPresetText, newGoalSecs === p.secs && styles.goalPresetTextActive]}>
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
            {newGoalSecs !== undefined && (
              <Text style={styles.goalConfirm}>Goal: {formatDuration(newGoalSecs)} / week</Text>
            )}
            <PrimaryButton title="Create Task" onPress={handleCreate} disabled={!newLabel.trim()} />
          </View>
        )}

        {tasks.length === 0 && !showForm ? (
          <EmptyState
            icon="albums-outline"
            title="No tasks yet"
            subtitle="Create a task to start tracking your study time."
          />
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              sessions={sessions}
              weekSessions={weekSessions}
              onPress={() => router.push({ pathname: '/task-detail', params: { taskId: task.id } })}
              onOptions={() => handleTaskOptions(task)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backgroundPrimary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.section + spacing.lg },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.xl },
  subtitle: { ...type.meta, marginTop: -spacing.sm, marginBottom: spacing.xs },
  fab: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  form: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  labelInput: {
    height: componentHeights.input,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontWeight: '400',
    fontSize: 15,
    color: colors.textPrimary,
  },
  colorRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  swatch: { width: 28, height: 28, borderRadius: radii.full },
  swatchSelected: { borderWidth: 2.5, borderColor: colors.textPrimary },

  goalPresetRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  goalPresetBtn: {
    paddingHorizontal: spacing.lg,
    height: componentHeights.chip,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalPresetBtnActive: { backgroundColor: colors.accentPrimary + '33', borderColor: colors.accentPrimary },
  goalPresetText: { fontWeight: '500', fontSize: 13, color: colors.textSecondary },
  goalPresetTextActive: { color: colors.accentPrimary },

  customRow: { flexDirection: 'row', gap: spacing.sm },
  customInput: {
    flex: 1,
    height: componentHeights.buttonCompact,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
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
  goalConfirm: { fontWeight: '500', fontSize: 12, color: colors.accentPrimary },

  cardWrapper: {
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardTint: { opacity: 0.07 },
  cardContent: { padding: spacing.lg },

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleCol: { flex: 1, gap: 3 },
  label: { fontWeight: '700', fontSize: 18, color: colors.textPrimary },
  meta: { ...type.meta },

  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  streakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm, height: 24, borderRadius: radii.full, borderWidth: 1,
  },
  streakText: { fontFamily: fonts.mono, fontSize: 11 },

  goalSection: { gap: spacing.sm },
  goalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalNote: {
    fontWeight: '500',
    fontSize: 12,
    color: colors.textSecondary,
  },
  goalPct: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '600',
  },

  noGoalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ghostChip: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, height: componentHeights.chip,
    borderRadius: radii.full,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.divider,
  },
  ghostChipText: { fontWeight: '500', fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  setGoalChip: {
    paddingHorizontal: spacing.md,
    height: componentHeights.chip,
    justifyContent: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
  },
  setGoalText: { fontWeight: '700', fontSize: 12 },
});
