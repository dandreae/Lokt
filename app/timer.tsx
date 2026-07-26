import { useState, useEffect, useRef, useCallback, type ComponentProps } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Easing,
  PanResponder,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, componentHeights, radii, spacing, type } from '../constants/theme';
import { AppHeader } from '../components/AppHeader';
import { IconButton } from '../components/IconButton';
import { CircularStudyTimer } from '../components/CircularStudyTimer';
import { PrimaryButton } from '../components/PrimaryButton';
import { SegmentedControl } from '../components/SegmentedControl';
import { Toggle } from '../components/Toggle';
import { MetricDivider } from '../components/Metric';
import { SubjectIcon } from '../components/SubjectIcon';
import { getTasks, ensureOverallTask } from '../store/tasks';
import { getSessions, getWeekSessions, getTodaySessions } from '../store/sessions';
import { saveSession } from '../store/sessions';
import { updatePresence } from '../store/social';
import { generateId } from '../utils/supabase';
import { formatClock, formatStudyTime } from '../utils/format';
import { getSubjectIcon } from '../utils/subjectIcon';
import type { Task, Session } from '../types';

type Mode = 'stopwatch' | 'timer';

const PRESETS = [
  { label: '15m', mins: 15 },
  { label: '30m', mins: 30 },
  { label: '45m', mins: 45 },
  { label: '1h', mins: 60 },
];

const RING_SIZE = 240;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;

// The blue-to-green gradient used on both the ring and the mode toggle,
// for a more premium feel than a flat single accent.
const PREMIUM_GRADIENT: [string, string] = [colors.focus, colors.accentPrimary];

function getStreakDays(sessions: Session[]): number {
  if (!sessions.length) return 0;
  const days = new Set(sessions.map(s => {
    const d = new Date(s.ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (days.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function FooterStat({ icon, iconColor, value, label }: {
  icon: ComponentProps<typeof Ionicons>['name']; iconColor: string; value: string; label: string;
}) {
  return (
    <View style={styles.footerStatItem}>
      <View style={styles.footerStatTop}>
        <Ionicons name={icon} size={14} color={iconColor} />
        <Text style={[styles.footerStatValue, { color: iconColor }]}>{value}</Text>
      </View>
      <Text style={styles.footerStatLabel}>{label}</Text>
    </View>
  );
}

export default function TimerScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ subjectId?: string; focusMode?: string; mode?: string }>();

  const [mode, setMode] = useState<Mode>(params.mode === 'timer' ? 'timer' : 'stopwatch');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(params.subjectId ?? null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [note, setNote] = useState('');
  const [durationMins, setDurationMins] = useState(25);
  const [customInput, setCustomInput] = useState('');
  const [remaining, setRemaining] = useState(25 * 60);
  const [elapsedSw, setElapsedSw] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [focusMode, setFocusMode] = useState(params.focusMode === '1');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [savingSession, setSavingSession] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs so the beforeRemove listener always reads current values
  const canLeaveRef = useRef(false);
  const runningRef = useRef(false);
  const selectedTaskIdRef = useRef<string | null>(selectedTaskId);
  const noteRef = useRef('');
  const elapsedRef = useRef(0);

  const breatheAnim = useRef(new Animated.Value(1)).current;

  const totalSeconds = durationMins * 60;
  const elapsed = mode === 'timer' ? totalSeconds - remaining : elapsedSw;

  runningRef.current = running;
  selectedTaskIdRef.current = selectedTaskId;
  noteRef.current = note;
  elapsedRef.current = elapsed;

  useEffect(() => {
    getTasks().then((t) => {
      setTasks(t);
      if (!selectedTaskId && t.length > 0) setSelectedTaskId(t[0].id);
    });
  }, []);

  useFocusEffect(useCallback(() => { getSessions().then(setSessions); }, []));

  // Breathing loop while running
  useEffect(() => {
    if (!running) {
      Animated.spring(breatheAnim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 40 }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 1.018, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(breatheAnim, { toValue: 1.0, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [running]);

  function handleModeChange(next: Mode) {
    if (running) return;
    Haptics.selectionAsync();
    setMode(next);
    setDone(false);
  }

  const setDuration = useCallback(
    (mins: number) => {
      if (running) return;
      setDurationMins(mins);
      setRemaining(mins * 60);
      setDone(false);
    },
    [running]
  );

  const handleCustom = useCallback(() => {
    const val = parseInt(customInput, 10);
    if (!isNaN(val) && val > 0 && val <= 300) {
      setDuration(val);
      setCustomInput('');
    }
  }, [customInput, setDuration]);

  const start = useCallback(() => {
    if (running) return;
    if (mode === 'timer' && (done || remaining === 0)) return;
    setRunning(true);
    updatePresence(true, selectedTaskId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    intervalRef.current = setInterval(() => {
      if (mode === 'timer') {
        setRemaining((r) => {
          if (r <= 1) {
            setRunning(false);
            setDone(true);
            updatePresence(false);
            if (intervalRef.current) clearInterval(intervalRef.current);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return 0;
          }
          return r - 1;
        });
      } else {
        setElapsedSw((e) => e + 1);
      }
    }, 1000);
  }, [running, mode, done, remaining, selectedTaskId]);

  const pause = useCallback(() => {
    if (!running) return;
    setRunning(false);
    updatePresence(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [running]);

  const reset = useCallback(() => {
    setRunning(false);
    setDone(false);
    if (mode === 'timer') setRemaining(durationMins * 60);
    else setElapsedSw(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [mode, durationMins]);

  function endTimerNow() {
    if (mode !== 'timer' || (!running && elapsed === 0)) return;
    Alert.alert('End timer?', `Finish now with ${formatClock(elapsed)} logged?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Timer',
        onPress: () => {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setRunning(false);
          setDone(true);
          updatePresence(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  }

  const handleSave = useCallback(async () => {
    let taskId = selectedTaskId;
    if (!taskId) {
      const overall = await ensureOverallTask();
      taskId = overall.id;
    }
    setSavingSession(true);
    const result = await saveSession({
      id: generateId(),
      subjectId: taskId,
      secs: elapsed,
      note: note.trim(),
      ts: Date.now(),
    });
    setSavingSession(false);
    if (!result.success) {
      Alert.alert('Could not save session', result.message);
      return;
    }
    await updatePresence(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    canLeaveRef.current = true;
    router.back();
  }, [elapsed, selectedTaskId, note, router]);

  // Intercept back navigation — warn if there's unsaved progress
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (canLeaveRef.current || elapsedRef.current === 0) {
        if (!canLeaveRef.current) updatePresence(false);
        return;
      }
      e.preventDefault();
      if (runningRef.current) {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        setRunning(false);
        updatePresence(false);
      }
      Alert.alert(
        'Leave session?',
        `You've logged ${formatClock(elapsedRef.current)}. Save before leaving?`,
        [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              await updatePresence(false);
              canLeaveRef.current = true;
              navigation.dispatch(e.data.action);
            },
          },
          {
            text: 'Save & Leave',
            onPress: async () => {
              let taskId = selectedTaskIdRef.current;
              if (!taskId) { const o = await ensureOverallTask(); taskId = o.id; }
              const result = await saveSession({ id: generateId(), subjectId: taskId, secs: elapsedRef.current, note: noteRef.current.trim(), ts: Date.now() });
              if (!result.success) {
                Alert.alert('Could not save session', result.message);
                return;
              }
              await updatePresence(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              canLeaveRef.current = true;
              navigation.dispatch(e.data.action);
            },
          },
          { text: 'Keep Going', style: 'cancel' },
        ]
      );
    });
  }, [navigation]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const canSave = mode === 'timer' ? (done || (!running && elapsed > 0)) : (elapsed > 0 && !running);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const ringColor = selectedTask?.color ?? colors.accentPrimary;
  const progress = mode === 'timer' ? (done ? 1 : (totalSeconds > 0 ? elapsed / totalSeconds : 0)) : Math.min(elapsedSw / 3600, 1);
  const showSetup = mode === 'timer' && !running && !done;
  const showFocusAndNote = !focusMode || !running;

  // Drag-to-set-duration handle — only while the timer hasn't started yet.
  const canDragDuration = mode === 'timer' && !running && !done && elapsed === 0;
  const dotAngle = -Math.PI / 2 + progress * 2 * Math.PI;
  const dotX = RING_SIZE / 2 + RING_RADIUS * Math.cos(dotAngle);
  const dotY = RING_SIZE / 2 + RING_RADIUS * Math.sin(dotAngle);

  const ringPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => canDragDuration,
    onMoveShouldSetPanResponder: () => canDragDuration,
    onPanResponderMove: (evt) => {
      if (!canDragDuration) return;
      const { locationX, locationY } = evt.nativeEvent;
      const dx = locationX - RING_SIZE / 2;
      const dy = locationY - RING_SIZE / 2;
      let angle = Math.atan2(dx, -dy);
      if (angle < 0) angle += Math.PI * 2;
      const frac = angle / (Math.PI * 2);
      const mins = Math.max(1, Math.min(60, Math.round(frac * 60) || 60));
      setDurationMins(mins);
      setRemaining(mins * 60);
    },
    onPanResponderRelease: () => Haptics.selectionAsync(),
  });

  const todaySecs = getTodaySessions(sessions).reduce((a, s) => a + s.secs, 0);
  const weekSecs = getWeekSessions(sessions).reduce((a, s) => a + s.secs, 0);
  const streakDays = getStreakDays(sessions);

  const swParts = { h: Math.floor(elapsedSw / 3600), m: Math.floor((elapsedSw % 3600) / 60), s: elapsedSw % 60 };
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AppHeader
        variant="bar"
        title={mode === 'stopwatch' ? 'Time' : 'Timer'}
        onBack={() => router.back()}
        right={
          <IconButton
            icon="stats-chart-outline"
            onPress={() => router.dismissTo('/(tabs)/profile')}
            size="sm"
            color={colors.accentPrimary}
            filled
            accessibilityLabel="View your stats"
          />
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.body}>

          <SegmentedControl
            options={[
              { value: 'stopwatch', label: 'Stopwatch', icon: 'stopwatch-outline' },
              { value: 'timer', label: 'Timer', icon: 'hourglass-outline' },
            ]}
            value={mode}
            onChange={handleModeChange}
            disabled={running}
            gradientColors={PREMIUM_GRADIENT}
          />

          {tasks.length === 0 ? (
            <TouchableOpacity onPress={() => router.dismissTo('/(tabs)/subjects')} activeOpacity={0.75}>
              <Text style={styles.noTasksLink}>No tasks yet — create one →</Text>
            </TouchableOpacity>
          ) : selectedTask && (
            <TouchableOpacity style={styles.taskDropdown} onPress={() => setShowTaskPicker(true)} activeOpacity={0.75}>
              <View style={[styles.taskDot, { backgroundColor: selectedTask.color }]} />
              <Text style={styles.taskDropdownText} numberOfLines={1}>{selectedTask.label}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          <View style={styles.ringContainer}>
            <Animated.View style={[styles.ringGlow, { transform: [{ scale: breatheAnim }] }]}>
              <CircularStudyTimer
                size={RING_SIZE}
                strokeWidth={RING_STROKE}
                progress={progress}
                color={done ? colors.accentSecondary : ringColor}
                gradientColors={done ? undefined : PREMIUM_GRADIENT}
              >
                <View style={styles.ringContent}>
                  <Ionicons
                    name={mode === 'stopwatch' ? 'stopwatch-outline' : 'hourglass-outline'}
                    size={18}
                    color={done ? colors.accentSecondary : ringColor}
                  />
                  <Text style={[styles.ringEyebrow, { color: done ? colors.accentSecondary : ringColor }]}>
                    {mode === 'stopwatch' ? 'STOPWATCH' : done ? 'COMPLETE' : 'TIME REMAINING'}
                  </Text>

                  {mode === 'stopwatch' ? (
                    <View style={styles.hmsRow}>
                      <View style={styles.hmsSeg}>
                        <Text style={[type.timerMedium, styles.hmsDigits]}>{pad(swParts.h)}</Text>
                        <Text style={styles.hmsLabel}>HR</Text>
                      </View>
                      <Text style={styles.hmsColon}>:</Text>
                      <View style={styles.hmsSeg}>
                        <Text style={[type.timerMedium, styles.hmsDigits]}>{pad(swParts.m)}</Text>
                        <Text style={styles.hmsLabel}>MIN</Text>
                      </View>
                      <Text style={styles.hmsColon}>:</Text>
                      <View style={styles.hmsSeg}>
                        <Text style={[type.timerMedium, styles.hmsDigits]}>{pad(swParts.s)}</Text>
                        <Text style={styles.hmsLabel}>SEC</Text>
                      </View>
                    </View>
                  ) : done ? (
                    <Text style={styles.doneText}>Done!</Text>
                  ) : (
                    <Text style={[type.timerMedium, { color: running ? ringColor : colors.textPrimary }]}>
                      {formatClock(remaining)}
                    </Text>
                  )}

                  {mode === 'timer' ? (
                    <TouchableOpacity style={styles.subPill} onPress={endTimerNow} activeOpacity={0.75}>
                      <Ionicons name="notifications-outline" size={13} color={ringColor} />
                      <Text style={[styles.subPillText, { color: ringColor }]}>End timer</Text>
                      <Ionicons name="chevron-forward" size={12} color={ringColor} />
                    </TouchableOpacity>
                  ) : (
                    // Balances the icon+label above the digits so the stopwatch
                    // face reads as vertically centered without a bottom pill.
                    <View style={styles.subPillSpacer} />
                  )}
                </View>
              </CircularStudyTimer>

              {mode === 'timer' && (
                <View
                  style={styles.dragOverlay}
                  pointerEvents={canDragDuration ? 'auto' : 'none'}
                  {...(canDragDuration ? ringPanResponder.panHandlers : {})}
                >
                  {canDragDuration && (
                    <View style={[styles.dragDot, { left: dotX - 8, top: dotY - 8, borderColor: ringColor }]} />
                  )}
                </View>
              )}
            </Animated.View>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={reset}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Reset"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={styles.circleBtnBg}>
                <Ionicons name="refresh" size={20} color={colors.textSecondary} />
              </View>
              <Text style={styles.circleBtnLabel}>Reset</Text>
            </TouchableOpacity>

            {!(mode === 'timer' && done) && (
              <TouchableOpacity
                style={[styles.primaryCircle, { backgroundColor: ringColor }]}
                onPress={running ? pause : start}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={running ? 'Pause' : elapsed === 0 ? 'Start' : 'Resume'}
              >
                <Ionicons name={running ? 'pause' : 'play'} size={28} color={colors.textOnAccent} style={!running ? { marginLeft: 3 } : undefined} />
              </TouchableOpacity>
            )}
          </View>

          {/* Duration (timer only) */}
          {showSetup && (
            <>
              <Text style={type.sectionTitle}>Duration</Text>
              <View style={styles.presetRow}>
                {PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.mins}
                    style={[styles.presetBtn, durationMins === p.mins && { backgroundColor: ringColor + '33', borderColor: ringColor }]}
                    onPress={() => setDuration(p.mins)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.presetText, durationMins === p.mins && { color: ringColor }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.customRow}>
                <TextInput
                  style={styles.customInput}
                  placeholder="Custom (min)"
                  placeholderTextColor={colors.textMuted}
                  value={customInput}
                  onChangeText={setCustomInput}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleCustom}
                />
                <TouchableOpacity style={styles.customBtn} onPress={handleCustom} activeOpacity={0.75}>
                  <Text style={styles.customBtnText}>Set</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Focus + Note — hidden while running in focus mode */}
          {showFocusAndNote && (
            <>
              <View style={styles.focusRow}>
                <View style={styles.focusLeft}>
                  <Ionicons name="moon-outline" size={15} color={colors.textSecondary} />
                  <Text style={styles.focusLabel}>Focus Mode</Text>
                </View>
                <Toggle
                  value={focusMode}
                  onChange={(v) => { Haptics.selectionAsync(); setFocusMode(v); }}
                />
              </View>

              <Text style={type.sectionTitle}>Note (optional)</Text>
              <View style={styles.noteWrap}>
                <TextInput
                  style={styles.noteInput}
                  placeholder="What are you studying?"
                  placeholderTextColor={colors.textMuted}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  returnKeyType="done"
                />
                <Ionicons name="pencil-outline" size={15} color={colors.textMuted} style={styles.noteIcon} />
              </View>
            </>
          )}

          {canSave && (
            <PrimaryButton
              title="Save Session"
              onPress={handleSave}
              loading={savingSession}
              color={colors.accentSecondary}
              style={styles.saveBtn}
            />
          )}

          {/* Footer stats */}
          <View style={styles.footerStats}>
            <FooterStat icon="time-outline" iconColor={colors.accentPrimary} value={formatStudyTime(todaySecs)} label="Today" />
            <MetricDivider />
            <FooterStat icon="flame" iconColor={colors.warning} value={streakDays > 0 ? `${streakDays}` : '0'} label="Day streak" />
            <MetricDivider />
            <FooterStat icon="trophy" iconColor={colors.rankGold} value={formatStudyTime(weekSecs)} label="This week" />
          </View>
        </View>
      </ScrollView>

      <Modal visible={showTaskPicker} transparent animationType="fade" onRequestClose={() => setShowTaskPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setShowTaskPicker(false)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Select Task</Text>
            <ScrollView style={styles.modalList}>
              {tasks.map((task) => {
                const icon = getSubjectIcon(task.label);
                const selected = task.id === selectedTaskId;
                return (
                  <TouchableOpacity
                    key={task.id}
                    style={styles.modalRow}
                    onPress={() => { setSelectedTaskId(task.id); setShowTaskPicker(false); }}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.taskChipIconTile, { backgroundColor: task.color + '26' }]}>
                      <SubjectIcon icon={icon} size={16} color={task.color} />
                    </View>
                    <Text style={styles.modalRowText} numberOfLines={1}>{task.label}</Text>
                    {selected && <Ionicons name="checkmark" size={18} color={colors.accentPrimary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backgroundPrimary },
  scroll: { flex: 1 },
  content: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.section },
  body: { width: '100%', alignItems: 'center', paddingTop: spacing.lg, gap: spacing.lg },

  taskDropdown: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, height: componentHeights.chip,
    borderRadius: radii.full, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surfaceRaised,
  },
  taskDot: { width: 8, height: 8, borderRadius: 4 },
  taskDropdownText: { fontWeight: '600', fontSize: 14, color: colors.textPrimary },
  noTasksLink: { fontWeight: '500', fontSize: 13, color: colors.accentPrimary },

  ringContainer: { marginTop: spacing.sm },
  ringGlow: {
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 10,
  },
  ringContent: { alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing.lg },
  ringEyebrow: { fontWeight: '700', fontSize: 12, letterSpacing: 1, marginBottom: 2 },
  doneText: { fontWeight: '700', fontSize: 36, color: colors.accentSecondary },

  hmsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  hmsSeg: { alignItems: 'center', width: 46 },
  hmsDigits: { fontSize: 26 },
  hmsColon: { fontFamily: 'DMMono-Medium', fontSize: 20, color: colors.textMuted, marginBottom: 9 },
  hmsLabel: { fontWeight: '600', fontSize: 9, color: colors.textMuted, letterSpacing: 0.5, marginTop: 2 },

  subPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.md, height: 30, borderRadius: radii.full,
    borderWidth: 1, borderColor: colors.divider, marginTop: spacing.sm,
  },
  subPillText: { fontWeight: '600', fontSize: 12 },
  subPillSpacer: { height: 30, marginTop: spacing.sm },

  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxl,
    marginTop: -34, zIndex: 2,
  },
  primaryCircle: {
    width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center',
    elevation: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  circleBtn: { alignItems: 'center', gap: spacing.xs, width: componentHeights.touchTarget + 12, elevation: 12 },
  circleBtnBg: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.divider,
    alignItems: 'center', justifyContent: 'center',
  },
  circleBtnLabel: { fontWeight: '500', fontSize: 11, color: colors.textMuted },

  dragOverlay: { position: 'absolute', top: 0, left: 0, width: RING_SIZE, height: RING_SIZE },
  dragDot: {
    position: 'absolute', width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#fff', borderWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 6,
  },

  presetRow: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  presetBtn: {
    flex: 1, height: 44, borderRadius: radii.md,
    backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.divider,
    alignItems: 'center', justifyContent: 'center',
  },
  presetText: { fontWeight: '500', fontSize: 14, color: colors.textSecondary },

  customRow: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  customInput: {
    flex: 1, backgroundColor: colors.surfaceSunken, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontWeight: '400', fontSize: 14, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.divider, minHeight: componentHeights.touchTarget,
  },
  customBtn: {
    backgroundColor: colors.surfaceSunken, borderRadius: radii.md, paddingHorizontal: spacing.xl,
    justifyContent: 'center', borderWidth: 1, borderColor: colors.divider, minHeight: componentHeights.touchTarget,
  },
  customBtnText: { fontWeight: '600', fontSize: 14, color: colors.textPrimary },

  taskChipIconTile: {
    width: 28, height: 28, borderRadius: radii.sm,
    alignItems: 'center', justifyContent: 'center',
  },

  focusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surfaceRaised,
  },
  focusLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  focusLabel: { fontWeight: '500', fontSize: 13, color: colors.textSecondary },

  noteWrap: { width: '100%' },
  noteInput: {
    backgroundColor: colors.surfaceSunken, borderRadius: radii.lg, padding: spacing.md, paddingRight: spacing.xxl,
    fontWeight: '400', fontSize: 15, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.divider, minHeight: 60, textAlignVertical: 'top', width: '100%',
  },
  noteIcon: { position: 'absolute', right: spacing.md, top: spacing.md },

  saveBtn: { width: '100%' },

  footerStats: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surfaceRaised,
  },
  footerStatItem: { flex: 1, alignItems: 'center', gap: 3 },
  footerStatTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerStatValue: { fontFamily: 'DMMono-Medium', fontSize: 15, fontWeight: '600' },
  footerStatLabel: { fontWeight: '400', fontSize: 10, color: colors.textMuted },

  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surfaceRaised, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
    padding: spacing.xl, paddingBottom: spacing.section, gap: spacing.md,
  },
  modalTitle: { ...type.sectionTitle, marginBottom: spacing.xs },
  modalList: { maxHeight: 360 },
  modalRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  modalRowText: { flex: 1, fontWeight: '600', fontSize: 15, color: colors.textPrimary },
});
