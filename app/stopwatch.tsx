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

export default function StopwatchScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ subjectId?: string; focusMode?: string }>();
  const isFocusMode = params.focusMode === '1';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    params.subjectId ?? null
  );
  const [note, setNote] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs so the beforeRemove listener always reads current values
  const canLeaveRef = useRef(false);
  const elapsedRef = useRef(0);
  const runningRef = useRef(false);
  const selectedTaskIdRef = useRef<string | null>(selectedTaskId);
  const noteRef = useRef('');
  elapsedRef.current = elapsed;
  runningRef.current = running;
  selectedTaskIdRef.current = selectedTaskId;
  noteRef.current = note;

  const tickAnim = useRef(new Animated.Value(1)).current;
  const breatheAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    getTasks().then((t) => {
      setTasks(t);
      if (!selectedTaskId && t.length > 0) setSelectedTaskId(t[0].id);
    });
  }, []);

  // Subtle number-tick on each elapsed second
  useEffect(() => {
    if (!running || elapsed === 0) return;
    Animated.sequence([
      Animated.timing(tickAnim, { toValue: 0.96, duration: 70, useNativeDriver: true }),
      Animated.timing(tickAnim, { toValue: 1.0, duration: 130, useNativeDriver: true }),
    ]).start();
  }, [elapsed]);

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

  const start = useCallback(() => {
    if (running) return;
    setRunning(true);
    updatePresence(true, selectedTaskId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, [running, selectedTaskId]);

  const pause = useCallback(() => {
    if (!running) return;
    setRunning(false);
    updatePresence(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [running]);

  const reset = useCallback(() => {
    setRunning(false);
    setElapsed(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

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
      if (canLeaveRef.current || elapsedRef.current === 0) {
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
        `You've logged ${formatTime(elapsedRef.current)}. Save before leaving?`,
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
              await saveSession({ id: generateId(), subjectId: taskId, secs: elapsedRef.current, note: noteRef.current.trim(), ts: Date.now() });
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

  const canSave = elapsed > 0 && !running;
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const ringColor = selectedTask?.color ?? C.accent;
  const ringProgress = Math.min(elapsed / 3600, 1);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.customHeader}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={C.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Stopwatch</Text>
        <View style={{ width: 26 }} />
      </View>
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
              progress={ringProgress}
              running={running}
              color={ringColor}
            >
              <View style={styles.ringContent}>
                <Animated.Text
                  style={[
                    styles.timerText,
                    { color: running ? ringColor : C.text1, transform: [{ scale: tickAnim }] },
                  ]}
                >
                  {formatTime(elapsed)}
                </Animated.Text>
                {running && selectedTask && (
                  <Text style={[styles.taskLabel, { color: ringColor + 'bb' }]}>
                    {selectedTask.label}
                  </Text>
                )}
              </View>
            </SessionRing>
          </Animated.View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {!running ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: ringColor }]}
              onPress={start}
              activeOpacity={0.75}
            >
              <Text style={styles.btnText}>{elapsed === 0 ? 'Start' : 'Resume'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, styles.btnPause]}
              onPress={pause}
              activeOpacity={0.75}
            >
              <Text style={styles.btnText}>Pause</Text>
            </TouchableOpacity>
          )}
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
    fontWeight: '600',
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
  taskLabel: {
    fontWeight: '500',
    fontSize: 12,
    marginTop: 5,
    letterSpacing: 0.3,
  },

  controls: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
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
    fontWeight: '600',
    fontSize: 16,
    color: '#fff',
  },
  btnTextSecondary: { color: C.text2 },

  sectionLabel: {
    fontWeight: '600',
    fontSize: 14,
    color: C.text2,
    marginBottom: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
    width: '100%',
  },

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
    fontWeight: '400',
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
    fontWeight: '500',
    fontSize: 13,
    color: C.text2,
  },

  noteInput: {
    backgroundColor: C.surface2,
    borderRadius: 14,
    padding: 14,
    fontWeight: '400',
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
    fontWeight: '600',
    fontSize: 16,
    color: '#0a2a20',
  },
});
