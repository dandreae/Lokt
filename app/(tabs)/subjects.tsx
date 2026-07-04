import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '../../constants/colors';
import { getTasks, createTask, deleteTask, TASK_COLORS } from '../../store/tasks';
import { generateId } from '../../utils/supabase';
import { getSessions, getWeekSessions, deleteSessionsByTaskId } from '../../store/sessions';
import { darkCardBg } from '../../utils/color';
import { formatDuration } from '../../utils/format';
import { useFadeIn } from '../../utils/useFadeIn';
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

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, sessions, weekSessions, onPress, onDelete }: {
  task: Task;
  sessions: Session[];
  weekSessions: Session[];
  onPress: () => void;
  onDelete: () => void;
}) {
  const taskSessions = sessions.filter((s) => s.subjectId === task.id);
  const totalSecs = taskSessions.reduce((a, s) => a + s.secs, 0);
  const weekTaskSecs = weekSessions.filter((s) => s.subjectId === task.id).reduce((a, s) => a + s.secs, 0);
  const hours = isNaN(totalSecs) ? '0.0' : (totalSecs / 3600).toFixed(1);

  const isActive = weekTaskSecs > 0;
  const cardBg = darkCardBg(task.color, isActive);

  const hasGoal = task.weeklyGoalSecs != null && task.weeklyGoalSecs > 0;
  const goalPct = hasGoal ? Math.min(Math.round((weekTaskSecs / task.weeklyGoalSecs!) * 100), 100) : 0;
  const goalNote = hasGoal ? getGoalNote(goalPct, weekTaskSecs, task.weeklyGoalSecs!) : '';

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasGoal || goalPct <= 0) return;
    const anim = Animated.timing(barAnim, {
      toValue: goalPct,
      duration: 700,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    });
    anim.start();
    return () => anim.stop();
  }, [goalPct, hasGoal]);

  return (
    <Animated.View style={[styles.cardWrapper, { shadowColor: task.color, transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: cardBg, borderColor: task.color + '28' }]}
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
        }
        onPressOut={() =>
          Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start()
        }
        activeOpacity={1}
      >
        {/* Depth gradient — light at top, dark at bottom */}
        <LinearGradient
          colors={['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.22)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* Left color accent bar */}
        <View style={[styles.accentBar, { backgroundColor: task.color }]} />

        <View style={styles.cardInner}>
          <View style={styles.cardTop}>
            <View style={styles.cardLeft}>
              <Text style={styles.label}>{task.label}</Text>
              <Text style={styles.meta}>
                {taskSessions.length} session{taskSessions.length !== 1 ? 's' : ''} · {hours}h total
              </Text>
            </View>
            <TouchableOpacity
              onPress={onDelete}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          </View>

          {hasGoal ? (
            <View style={styles.goalSection}>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, {
                  width: barAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                  backgroundColor: task.color,
                }]} />
              </View>
              <View style={styles.goalFooter}>
                <Text style={styles.goalNote}>{goalNote}</Text>
                <Text style={[styles.goalPct, { color: task.color }]}>
                  {formatDuration(weekTaskSecs)} / {formatDuration(task.weeklyGoalSecs!)} · {goalPct}%
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.noGoalRow}>
              {weekTaskSecs > 0 && (
                <Text style={styles.noGoalTime}>
                  {formatDuration(weekTaskSecs)} this week
                </Text>
              )}
              <View style={[styles.setGoalChip, { borderColor: task.color + '40' }]}>
                <Text style={[styles.setGoalText, { color: task.color }]}>+ Set goal</Text>
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
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

  const fadeAnim = useFadeIn();

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

  function handleDelete(task: Task) {
    const count = sessions.filter((s) => s.subjectId === task.id).length;
    const message = count > 0
      ? `"${task.label}" and its ${count} session log${count !== 1 ? 's' : ''} will be permanently deleted.`
      : `"${task.label}" will be permanently deleted.`;
    Alert.alert('Delete Task', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
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
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Tasks</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setShowForm((v) => !v)}
              activeOpacity={0.75}
            >
              <Ionicons name={showForm ? 'close' : 'add'} size={22} color={C.text1} />
            </TouchableOpacity>
          </View>

          {showForm && (
            <View style={styles.form}>
              <TextInput
                style={styles.labelInput}
                placeholder="Task name…"
                placeholderTextColor={C.text3}
                value={newLabel}
                onChangeText={setNewLabel}
                returnKeyType="done"
                autoFocus
              />
              <Text style={styles.formSectionLabel}>Color</Text>
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
              <Text style={styles.formSectionLabel}>Weekly Goal (optional)</Text>
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
              {newGoalSecs !== undefined && (
                <Text style={styles.goalConfirm}>Goal: {formatDuration(newGoalSecs)} / week</Text>
              )}
              <TouchableOpacity
                style={[styles.createBtn, !newLabel.trim() && styles.createBtnDisabled]}
                onPress={handleCreate}
                activeOpacity={0.75}
                disabled={!newLabel.trim()}
              >
                <Text style={styles.createBtnText}>Create Task</Text>
              </TouchableOpacity>
            </View>
          )}

          {tasks.length === 0 && !showForm ? (
            <View style={styles.emptyCard}>
              <Ionicons name="albums-outline" size={36} color={C.text3} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No tasks yet</Text>
              <Text style={styles.emptyText}>Tap + to create your first task</Text>
            </View>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                sessions={sessions}
                weekSessions={weekSessions}
                onPress={() => router.push({ pathname: '/task-detail', params: { taskId: task.id } })}
                onDelete={() => handleDelete(task)}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontFamily: 'Nunito-Black', fontSize: 32, color: C.text1 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  form: {
    backgroundColor: C.surface1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  labelInput: {
    height: 52,
    backgroundColor: C.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    fontFamily: 'Nunito-Regular',
    fontSize: 15,
    color: C.text1,
  },
  formSectionLabel: {
    fontFamily: 'Nunito-Bold',
    fontSize: 12,
    color: C.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch: { width: 30, height: 30, borderRadius: 8 },
  swatchSelected: { borderWidth: 2.5, borderColor: C.text1 },

  goalPresetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  goalPresetBtn: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalPresetBtnActive: { backgroundColor: C.accent + '33', borderColor: C.accent },
  goalPresetText: { fontFamily: 'Nunito-SemiBold', fontSize: 13, color: C.text2 },
  goalPresetTextActive: { color: C.accent },

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
  goalConfirm: { fontFamily: 'Nunito-SemiBold', fontSize: 12, color: C.accent },

  createBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { fontFamily: 'Nunito-Bold', fontSize: 15, color: '#fff' },

  emptyCard: {
    backgroundColor: C.surface1,
    borderRadius: 16,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  emptyTitle: { fontFamily: 'Nunito-Bold', fontSize: 16, color: C.text1, marginBottom: 4 },
  emptyText: { fontFamily: 'Nunito-Regular', fontSize: 13, color: C.text3 },

  // Card wrapper — colored shadow at low opacity
  cardWrapper: {
    borderRadius: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 12,
    elevation: 4,
  },
  // Card body — dark tinted bg + subtle border set inline, overflow clips gradient/bar
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    flexDirection: 'row',
  },
  // 3px left accent bar
  accentBar: {
    width: 3,
  },
  // Content sits to the right of the accent bar
  cardInner: {
    flex: 1,
    padding: 16,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardLeft: { flex: 1, paddingRight: 8 },
  label: {
    fontFamily: 'Nunito-Bold',
    fontSize: 17,
    color: C.text1,
    marginBottom: 3,
  },
  meta: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },

  goalSection: { gap: 6 },
  track: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fill: { height: '100%', borderRadius: 3 },
  goalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalNote: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  goalPct: {
    fontFamily: 'DMMono-Medium',
    fontSize: 11,
  },

  noGoalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noGoalTime: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 12,
    flex: 1,
    color: 'rgba(255,255,255,0.5)',
  },
  setGoalChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  setGoalText: { fontFamily: 'Nunito-Bold', fontSize: 11 },
});
