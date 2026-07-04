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
import { C } from '../constants/colors';
import { getTasks, lookupTask, updateTask } from '../store/tasks';
import { getSessions, deleteSession, getWeekSessions } from '../store/sessions';
import { contrastText } from '../utils/color';
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
  const fg = task ? contrastText(task.color) : C.text1;
  const overlayBg = fg === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
  const hasGoal = task?.weeklyGoalSecs != null && task.weeklyGoalSecs > 0;
  const goalPct = hasGoal
    ? Math.min(Math.round((weekSecs / task!.weeklyGoalSecs!) * 100), 100)
    : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Colored header */}
      <View style={[styles.header, { backgroundColor: task?.color ?? C.surface1 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={fg} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: fg }]}>{task?.label ?? '…'}</Text>
          <Text style={[styles.headerSub, { color: fg, opacity: 0.75 }]}>
            {formatDuration(totalSecs)} · {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.startBtn, { backgroundColor: overlayBg }]}
          onPress={() => setShowStartOptions((v) => !v)}
          activeOpacity={0.75}
        >
          <Ionicons name={showStartOptions ? 'close' : 'play'} size={14} color={fg} />
          <Text style={[styles.startBtnText, { color: fg }]}>
            {showStartOptions ? 'Cancel' : 'Start'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Start options */}
      {showStartOptions && (
        <View style={styles.startOptions}>
          <TouchableOpacity
            style={styles.optionBtn}
            onPress={() => {
              setShowStartOptions(false);
              router.push({ pathname: '/stopwatch', params: { subjectId: taskId } });
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="stopwatch-outline" size={22} color={C.accent} />
            <View>
              <Text style={styles.optionLabel}>Stopwatch</Text>
              <Text style={styles.optionSub}>Free-form, stop when done</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.optionDivider} />
          <TouchableOpacity
            style={styles.optionBtn}
            onPress={() => {
              setShowStartOptions(false);
              router.push({ pathname: '/timer', params: { subjectId: taskId } });
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="timer-outline" size={22} color={C.accent2} />
            <View>
              <Text style={styles.optionLabel}>Timer</Text>
              <Text style={styles.optionSub}>Count down from a set time</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>

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
              <Text style={styles.goalValue}>
                {formatDuration(weekSecs)}
                <Text style={styles.goalValueDim}> / {formatDuration(task!.weeklyGoalSecs!)} this week</Text>
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${goalPct}%` }]} />
              </View>
              <View style={styles.goalFooter}>
                <Text style={styles.goalNote}>
                  {getGoalNote(goalPct, weekSecs, task!.weeklyGoalSecs!)}
                </Text>
                <Text style={styles.goalPct}>{goalPct}%</Text>
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
              {hasGoal && (
                <TouchableOpacity onPress={handleRemoveGoal} activeOpacity={0.7}>
                  <Text style={styles.removeGoalText}>Remove goal</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Sessions */}
        <Text style={styles.sectionTitle}>Sessions</Text>
        {sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="time-outline" size={32} color={C.text3} style={{ marginBottom: 10 }} />
            <Text style={styles.emptyText}>No sessions yet. Hit Start to begin.</Text>
          </View>
        ) : (
          sessions.map((s) => (
            <View key={s.id} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowDate}>{formatDateTime(s.ts)}</Text>
                {s.note ? (
                  <Text style={styles.rowNote}>{s.note}</Text>
                ) : null}
              </View>
              <Text style={styles.duration}>{formatDuration(s.secs)}</Text>
              <TouchableOpacity
                onPress={() => handleDeleteSession(s.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={15} color={C.text3} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  headerCenter: { flex: 1 },
  headerTitle: { fontFamily: 'Nunito-Bold', fontSize: 18 },
  headerSub: { fontFamily: 'Nunito-Regular', fontSize: 12, marginTop: 2 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  startBtnText: { fontFamily: 'Nunito-Bold', fontSize: 13 },

  startOptions: {
    backgroundColor: C.surface1,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  optionLabel: { fontFamily: 'Nunito-Bold', fontSize: 15, color: C.text1 },
  optionSub: { fontFamily: 'Nunito-Regular', fontSize: 12, color: C.text2, marginTop: 1 },
  optionDivider: { height: 1, backgroundColor: C.border },

  content: { padding: 20, paddingBottom: 40 },

  goalCard: {
    backgroundColor: C.surface1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 10,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalCardTitle: { fontFamily: 'Nunito-Bold', fontSize: 14, color: C.text1 },
  goalEditLink: { fontFamily: 'Nunito-SemiBold', fontSize: 13, color: C.accent },

  goalValue: { fontFamily: 'Nunito-Black', fontSize: 22, color: C.text1 },
  goalValueDim: { fontFamily: 'Nunito-Regular', fontSize: 14, color: C.text2 },

  progressTrack: { height: 6, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.accent, borderRadius: 3 },

  goalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalNote: { fontFamily: 'Nunito-Regular', fontSize: 12, color: C.text3 },
  goalPct: { fontFamily: 'DMMono-Medium', fontSize: 12, color: C.accent },

  noGoalText: { fontFamily: 'Nunito-Regular', fontSize: 13, color: C.text3 },

  goalEditor: { gap: 10 },
  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  presetBtn: {
    paddingHorizontal: 14,
    height: 34,
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
  removeGoalText: { fontFamily: 'Nunito-SemiBold', fontSize: 12, color: C.red, textAlign: 'center' },

  sectionTitle: { fontFamily: 'Nunito-Bold', fontSize: 15, color: C.text1, marginBottom: 10 },

  emptyCard: {
    backgroundColor: C.surface1,
    borderRadius: 16,
    padding: 36,
    alignItems: 'center',
  },
  emptyText: { fontFamily: 'Nunito-Regular', fontSize: 14, color: C.text3 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  rowMain: { flex: 1 },
  rowDate: { fontFamily: 'Nunito-Bold', fontSize: 14, color: C.text1 },
  rowNote: { fontFamily: 'Nunito-Regular', fontSize: 12, color: C.text2, marginTop: 3 },
  duration: { fontFamily: 'DMMono-Medium', fontSize: 14, color: C.accent },
  deleteBtn: { marginLeft: 12 },
});
