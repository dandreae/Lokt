import { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../constants/colors';
import { getTasks, ensureOverallTask } from '../store/tasks';
import { saveSession } from '../store/sessions';
import { updatePresence } from '../store/social';
import { generateId } from '../utils/supabase';
import { SessionRing } from '../utils/SessionRing';
import type { Task } from '../types';

const PRESETS = [
  { label: '15m', mins: 15 },
  { label: '30m', mins: 30 },
  { label: '45m', mins: 45 },
  { label: '1h', mins: 60 },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function TimerScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ subjectId?: string; focusMode?: string }>();
  const isFocusMode = params.focusMode === '1';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    params.subjectId ?? null
  );
  const [note, setNote] = useState('');
  const [durationMins, setDurationMins] = useState(25);
  const [customInput, setCustomInput] = useState('');
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs so the beforeRemove listener always reads current values
  const canLeaveRef = useRef(false);
  const runningRef = useRef(false);
  const selectedTaskIdRef = useRef<string | null>(selectedTaskId);
  const noteRef = useRef('');
  runningRef.current = running;
  selectedTaskIdRef.current = selectedTaskId;
  noteRef.current = note;

  const flashAnim = useRef(new Animated.Value(0)).current;
  const tickAnim = useRef(new Animated.Value(1)).current;
  const breatheAnim = useRef(new Animated.Value(1)).current;

  const totalSeconds = durationMins * 60;
  const elapsed = totalSeconds - remaining;
  const progress = totalSeconds > 0 ? elapsed / totalSeconds : 0;

  useEffect(() => {
    getTasks().then((t) => {
      setTasks(t);
      if (!selectedTaskId && t.length > 0) setSelectedTaskId(t[0].id);
    });
  }, []);

  // Subtle number-tick on each second
  useEffect(() => {
    if (!running) return;
    Animated.sequence([
      Animated.timing(tickAnim, { toValue: 0.96, duration: 70, useNativeDriver: true }),
      Animated.timing(tickAnim, { toValue: 1.0, duration: 130, useNativeDriver: true }),
    ]).start();
  }, [remaining]);

  // Breathing loop while running
  useEffect(() => {
    if (!running) {
      Animated.spring(breatheAnim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 40 }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1.018,
          duration: 2200,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(breatheAnim, {
          toValue: 1.0,
          duration: 2200,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [running]);

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

  const flashDone = useCallback(() => {
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [flashAnim]);

  const start = useCallback(() => {
    if (running || done || remaining === 0) return;
    setRunning(true);
    updatePresence(true, selectedTaskId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          setDone(true);
          updatePresence(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          flashDone();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }, [running, done, remaining, flashDone, selectedTaskId]);

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
    setRemaining(durationMins * 60);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [durationMins]);

  const handleSave = useCallback(async () => {
    let taskId = selectedTaskId;
    if (!taskId) {
      const overall = await ensureOverallTask();
      taskId = overall.id;
    }
    await saveSession({
      id: generateId(),
      subjectId: taskId,
      secs: elapsed,
      note: note.trim(),
      ts: Date.now(),
    });
    await updatePresence(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    canLeaveRef.current = true;
    router.back();
  }, [elapsed, selectedTaskId, note, router]);

  // Intercept back navigation — warn if there's unsaved progress
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      const elapsedNow = totalSeconds - remaining;
      if (canLeaveRef.current || elapsedNow === 0) {
        if (!canLeaveRef.current) updatePresence(false);
        return;
      }
      e.preventDefault();
      // Auto-pause so the clock stops while the alert is visible
      if (runningRef.current) {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        setRunning(false);
        updatePresence(false);
      }
      Alert.alert(
        'Leave session?',
        `You've logged ${formatTime(elapsedNow)}. Save before leaving?`,
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
              await saveSession({ id: generateId(), subjectId: taskId, secs: elapsedNow, note: noteRef.current.trim(), ts: Date.now() });
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
  }, [navigation, remaining, totalSeconds]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const flashBg = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.bg, C.accent2 + '44'],
  });

  const canSave = done || (!running && elapsed > 0);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const ringColor = selectedTask?.color ?? C.accent;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.customHeader}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={C.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Timer</Text>
        <View style={{ width: 26 }} />
      </View>
      <Animated.View style={[{ flex: 1 }, { backgroundColor: flashBg }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Animated ring */}
          <View style={styles.ringContainer}>
            <Animated.View style={{ transform: [{ scale: breatheAnim }] }}>
              <SessionRing
                size={220}
                progress={done ? 1 : progress}
                running={running}
                color={done ? C.accent2 : ringColor}
              >
                <View style={styles.ringContent}>
                  {done ? (
                    <Text style={styles.doneText}>Done!</Text>
                  ) : (
                    <Animated.Text
                      style={[
                        styles.timerText,
                        { color: running ? ringColor : C.text1, transform: [{ scale: tickAnim }] },
                      ]}
                    >
                      {formatTime(remaining)}
                    </Animated.Text>
                  )}
                  {running && selectedTask && (
                    <Text style={[styles.taskLabel, { color: ringColor + 'bb' }]}>
                      {selectedTask.label}
                    </Text>
                  )}
                  {!done && !running && elapsed > 0 && (
                    <Text style={styles.pctLabel}>{Math.round(progress * 100)}%</Text>
                  )}
                </View>
              </SessionRing>
            </Animated.View>
          </View>

          {/* Presets */}
          <Text style={styles.sectionLabel}>Duration</Text>
          <View style={styles.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.mins}
                style={[
                  styles.presetBtn,
                  durationMins === p.mins && { backgroundColor: ringColor + '33', borderColor: ringColor },
                ]}
                onPress={() => setDuration(p.mins)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.presetText,
                    durationMins === p.mins && { color: ringColor },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Duration */}
          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              placeholder="Custom (min)"
              placeholderTextColor={C.text3}
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

          {/* Controls */}
          <View style={styles.controls}>
            {!running && !done ? (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: ringColor }]}
                onPress={start}
                activeOpacity={0.75}
              >
                <Text style={styles.btnText}>{elapsed === 0 ? 'Start' : 'Resume'}</Text>
              </TouchableOpacity>
            ) : running ? (
              <TouchableOpacity
                style={[styles.btn, styles.btnPause]}
                onPress={pause}
                activeOpacity={0.75}
              >
                <Text style={styles.btnText}>Pause</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.btn, styles.btnReset]}
              onPress={reset}
              activeOpacity={0.75}
            >
              <Text style={[styles.btnText, styles.btnTextSecondary]}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* Task Picker + Note — hidden while running in focus mode */}
          {(!isFocusMode || !running) && (
            <>
              <Text style={styles.sectionLabel}>Task</Text>
              {tasks.length === 0 ? (
                <TouchableOpacity
                  style={styles.emptyTasks}
                  onPress={() => router.push('/(tabs)/subjects')}
                  activeOpacity={0.75}
                >
                  <Ionicons name="albums-outline" size={20} color={C.text3} />
                  <Text style={styles.emptyTasksText}>No tasks yet — create one first</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.pillWrap}>
                  {tasks.map((task) => {
                    const selected = task.id === selectedTaskId;
                    return (
                      <TouchableOpacity
                        key={task.id}
                        style={[styles.pill, selected && { borderColor: task.color }]}
                        onPress={() => setSelectedTaskId(task.id)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.pillDot, { backgroundColor: task.color }]} />
                        <Text style={[styles.pillText, selected && { color: C.text1 }]}>
                          {task.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={styles.sectionLabel}>Note</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="What are you studying?"
                placeholderTextColor={C.text3}
                value={note}
                onChangeText={setNote}
                multiline
                returnKeyType="done"
              />
            </>
          )}

          {canSave && (
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>Save Session</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

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
  headerTitle: {
    fontFamily: 'Nunito-Bold',
    fontSize: 18,
    color: C.text1,
  },
  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 48, alignItems: 'center' },

  ringContainer: {
    marginTop: 16,
    marginBottom: 32,
  },
  ringContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontFamily: 'DMMono-Medium',
    fontSize: 40,
    letterSpacing: -1,
  },
  doneText: {
    fontFamily: 'Nunito-Black',
    fontSize: 36,
    color: C.accent2,
    letterSpacing: 0,
  },
  taskLabel: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 12,
    marginTop: 5,
    letterSpacing: 0.3,
  },
  pctLabel: {
    fontFamily: 'DMMono-Medium',
    fontSize: 13,
    color: C.text3,
    marginTop: 4,
  },

  sectionLabel: {
    fontFamily: 'Nunito-Bold',
    fontSize: 14,
    color: C.text2,
    marginBottom: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
    width: '100%',
  },

  presetRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    width: '100%',
  },
  presetBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
    color: C.text2,
  },

  customRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
    width: '100%',
  },
  customInput: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'Nunito-Regular',
    fontSize: 14,
    color: C.text1,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 44,
  },
  customBtn: {
    backgroundColor: C.surface2,
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 44,
  },
  customBtnText: {
    fontFamily: 'Nunito-Bold',
    fontSize: 14,
    color: C.text1,
  },

  controls: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
    width: '100%',
  },
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPause: { backgroundColor: C.accent3 },
  btnReset: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  btnText: {
    fontFamily: 'Nunito-Bold',
    fontSize: 16,
    color: '#fff',
  },
  btnTextSecondary: { color: C.text2 },

  emptyTasks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface2,
    borderRadius: 12,
    padding: 14,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: C.border,
    width: '100%',
  },
  emptyTasksText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 13,
    color: C.text3,
  },

  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 28,
    width: '100%',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 44,
  },
  pillDot: { width: 12, height: 12, borderRadius: 3 },
  pillText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 13,
    color: C.text2,
  },

  noteInput: {
    backgroundColor: C.surface2,
    borderRadius: 14,
    padding: 14,
    fontFamily: 'Nunito-Regular',
    fontSize: 15,
    color: C.text1,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 24,
    width: '100%',
  },

  saveBtn: {
    backgroundColor: C.accent2,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  saveBtnText: {
    fontFamily: 'Nunito-Bold',
    fontSize: 16,
    color: '#0a2a20',
  },
});
