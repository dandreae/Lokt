import { useCallback, useState, useMemo } from 'react';
import {
  Alert, Animated, View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Dimensions, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../constants/colors';
import { useFadeIn } from '../../utils/useFadeIn';
import { getSessions } from '../../store/sessions';
import { getTasks, lookupTask } from '../../store/tasks';
import { getMyProfile, updateDisplayName, updateUsername } from '../../store/social';
import { formatDuration } from '../../utils/format';
import type { Session, Task } from '../../types';

// --- grid layout constants ---
const NUM_WEEKS = 14;
const CELL_GAP = 3;
const SCREEN_W = Dimensions.get('window').width;
const CONTENT_PAD = 20;
const CARD_PAD = 14;
const DAY_COL_W = 14;
const DAY_COL_GAP = 6;
const CELL_SIZE = Math.max(
  Math.floor(
    (SCREEN_W - CONTENT_PAD * 2 - CARD_PAD * 2 - DAY_COL_W - DAY_COL_GAP - (NUM_WEEKS - 1) * CELL_GAP) / NUM_WEEKS
  ),
  8
);

// --- helpers ---

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type HeatCell = { mins: number; isToday: boolean; isFuture: boolean };

function buildHeatmapGrid(sessions: Session[]): HeatCell[][] {
  const dayMap = new Map<string, number>();
  for (const s of sessions) {
    const d = new Date(s.ts);
    const k = dateKey(d);
    dayMap.set(k, (dayMap.get(k) ?? 0) + Math.floor(s.secs / 60));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const start = new Date(thisMonday);
  start.setDate(thisMonday.getDate() - (NUM_WEEKS - 1) * 7);
  const todayKey = dateKey(today);

  return Array.from({ length: NUM_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      return {
        mins: dayMap.get(dateKey(date)) ?? 0,
        isToday: dateKey(date) === todayKey,
        isFuture: date > today,
      };
    })
  );
}

function cellBg(mins: number, isToday: boolean, isFuture: boolean): string {
  if (isFuture) return 'transparent';
  if (mins === 0) return isToday ? C.surface3 : 'rgba(255,255,255,0.05)';
  if (mins < 30) return C.accent + '55';
  if (mins < 60) return C.accent + '99';
  return C.accent;
}

function computeCurrentStreak(sessions: Session[]): number {
  const set = new Set(sessions.map(s => dateKey(new Date(s.ts))));
  const today = new Date();
  const offset = set.has(dateKey(today)) ? 0 : 1;
  let n = 0;
  for (let i = offset; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (set.has(dateKey(d))) n++;
    else break;
  }
  return n;
}

function computeBestStreak(sessions: Session[]): number {
  const set = new Set(sessions.map(s => dateKey(new Date(s.ts))));
  let best = 0, cur = 0;
  const today = new Date();
  for (let i = 730; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (set.has(dateKey(d))) { cur++; if (cur > best) best = cur; }
    else cur = 0;
  }
  return best;
}

type DayGroup = { key: string; label: string; sessions: Session[]; totalSecs: number };

function groupByDay(sessions: Session[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const s of sessions) {
    const d = new Date(s.ts);
    const key = dateKey(d);
    const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (!map.has(key)) map.set(key, { key, label, sessions: [], totalSecs: 0 });
    const g = map.get(key)!;
    g.sessions.push(s);
    g.totalSecs += s.secs;
  }
  return Array.from(map.values());
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ProfileScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const fadeAnim = useFadeIn();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    getSessions().then(setSessions);
    getTasks().then(setTasks);
    getMyProfile().then((p) => {
      if (p) {
        setDisplayName(p.display_name ?? '');
        setUsername(p.username ?? '');
      }
    });
  }, []));

  function startEdit() {
    setEditName(displayName);
    setEditUsername(username);
    setEditing(true);
  }

  async function handleSave() {
    if (!editName.trim()) { Alert.alert('Name cannot be empty.'); return; }
    setSaving(true);

    const nameResult = await updateDisplayName(editName);
    if (!nameResult.success) {
      setSaving(false);
      Alert.alert('Could not save name', nameResult.message);
      return;
    }

    if (editUsername.trim() && editUsername.trim() !== username) {
      const usernameResult = await updateUsername(editUsername);
      if (!usernameResult.success) {
        setSaving(false);
        Alert.alert('Could not save username', usernameResult.message);
        return;
      }
      setUsername(editUsername.trim());
    }

    setSaving(false);
    setDisplayName(editName.trim());
    setEditing(false);
  }


  const totalSecs  = useMemo(() => sessions.reduce((a, s) => a + s.secs, 0), [sessions]);
  const streak     = useMemo(() => computeCurrentStreak(sessions), [sessions]);
  const bestStreak = useMemo(() => computeBestStreak(sessions), [sessions]);
  const studyDays  = useMemo(() => new Set(sessions.map(s => dateKey(new Date(s.ts)))).size, [sessions]);
  const longestSecs = useMemo(() => sessions.reduce((m, s) => Math.max(m, s.secs), 0), [sessions]);
  const heatmap    = useMemo(() => buildHeatmapGrid(sessions), [sessions]);
  const groups     = useMemo(() => groupByDay(sessions), [sessions]);

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Profile</Text>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => router.push('/settings')}
              activeOpacity={0.75}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="settings-outline" size={22} color={C.text2} />
            </TouchableOpacity>
          </View>

          {/* Profile card */}
          <View style={styles.profileCard}>
            {/* Avatar */}
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitials}>
                {displayName
                  ? displayName.trim().split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
                  : '?'}
              </Text>
            </View>

            {editing ? (
              <View style={styles.profileEditFields}>
                <TextInput
                  style={styles.profileEditInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Display name"
                  placeholderTextColor={C.text3}
                  autoFocus
                  returnKeyType="next"
                />
                <TextInput
                  style={styles.profileEditInput}
                  value={editUsername}
                  onChangeText={(t) => setEditUsername(t.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                  placeholder="username"
                  placeholderTextColor={C.text3}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
                <View style={styles.profileEditBtns}>
                  <TouchableOpacity
                    style={styles.profileCancelBtn}
                    onPress={() => setEditing(false)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.profileCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.profileSaveBtn}
                    onPress={handleSave}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    {saving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.profileSaveText}>Save</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{displayName || 'Set your name'}</Text>
                <Text style={styles.profileUsername}>
                  {username ? `@${username}` : `@${displayName} · tap to set username`}
                </Text>
              </View>
            )}

            {!editing && (
              <TouchableOpacity
                style={styles.profileEditBtn}
                onPress={startEdit}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil-outline" size={16} color={C.text3} />
              </TouchableOpacity>
            )}
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{(totalSecs / 3600).toFixed(1)}h</Text>
              <Text style={styles.statLabel}>Total Time</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{sessions.length}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={[styles.statCard, streak > 0 && styles.statCardFire]}>
              <Text style={[styles.statValue, streak > 0 && { color: C.accent3 }]}>
                {streak > 0 ? `${streak}d` : '—'}
              </Text>
              <Text style={styles.statLabel}>{streak > 0 ? 'Streak 🔥' : 'Streak'}</Text>
            </View>
          </View>

          {/* Activity heatmap */}
          <Text style={styles.sectionLabel}>Activity</Text>
          <View style={styles.card}>
            <View style={styles.heatmapRow}>
              {/* Day labels: M / W / F only to avoid crowding */}
              <View style={{ width: DAY_COL_W, marginRight: DAY_COL_GAP, gap: CELL_GAP }}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
                  <View key={i} style={{ height: CELL_SIZE, justifyContent: 'center' }}>
                    <Text style={styles.dayLabelText}>{i % 2 === 0 ? l : ''}</Text>
                  </View>
                ))}
              </View>
              {/* Cells */}
              <View style={{ flexDirection: 'row', gap: CELL_GAP }}>
                {heatmap.map((week, wi) => (
                  <View key={wi} style={{ gap: CELL_GAP }}>
                    {week.map((cell, di) => (
                      <View
                        key={di}
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          borderRadius: 3,
                          backgroundColor: cellBg(cell.mins, cell.isToday, cell.isFuture),
                          ...(cell.isToday && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }),
                        }}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>
            {/* Legend */}
            <View style={styles.legendRow}>
              <Text style={styles.legendText}>Less</Text>
              {(['rgba(255,255,255,0.05)', C.accent + '55', C.accent + '99', C.accent] as string[]).map((bg, i) => (
                <View key={i} style={[styles.legendCell, { backgroundColor: bg }]} />
              ))}
              <Text style={styles.legendText}>More</Text>
            </View>
          </View>

          {/* Milestones */}
          <Text style={styles.sectionLabel}>Milestones</Text>
          <View style={[styles.card, styles.milestonesInner]}>
            <View style={styles.milestone}>
              <Ionicons name="timer-outline" size={18} color={C.accent} />
              <Text style={[styles.milestoneVal, { color: C.accent }]}>
                {longestSecs > 0 ? formatDuration(longestSecs) : '—'}
              </Text>
              <Text style={styles.milestoneLabel}>Longest{'\n'}Session</Text>
            </View>
            <View style={styles.milestoneDiv} />
            <View style={styles.milestone}>
              <Ionicons name="flame-outline" size={18} color={C.accent3} />
              <Text style={[styles.milestoneVal, { color: C.accent3 }]}>
                {bestStreak > 0 ? `${bestStreak}d` : '—'}
              </Text>
              <Text style={styles.milestoneLabel}>Best{'\n'}Streak</Text>
            </View>
            <View style={styles.milestoneDiv} />
            <View style={styles.milestone}>
              <Ionicons name="calendar-outline" size={18} color={C.accent2} />
              <Text style={[styles.milestoneVal, { color: C.accent2 }]}>
                {studyDays > 0 ? String(studyDays) : '—'}
              </Text>
              <Text style={styles.milestoneLabel}>Study{'\n'}Days</Text>
            </View>
          </View>

          {/* Session Log */}
          <Text style={styles.sectionLabel}>Session Log</Text>

          {groups.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="time-outline" size={32} color={C.text3} style={{ marginBottom: 10 }} />
              <Text style={styles.emptyText}>No sessions yet. Start studying!</Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayLabel}>{group.label}</Text>
                  <Text style={styles.dayTotal}>{formatDuration(group.totalSecs)}</Text>
                </View>
                {group.sessions.map((s) => {
                  const task = lookupTask(tasks, s.subjectId);
                  return (
                    <View key={s.id} style={styles.sessionRow}>
                      <View style={[styles.colorBar, { backgroundColor: task.color }]} />
                      <View style={styles.rowMain}>
                        <View style={styles.rowTop}>
                          <Text style={styles.taskName}>{task.label}</Text>
                          <Text style={styles.duration}>{formatDuration(s.secs)}</Text>
                        </View>
                        <Text style={styles.time}>{fmtTime(s.ts)}</Text>
                        {s.note ? (
                          <Text style={styles.note} numberOfLines={2}>{s.note}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
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
  content: { padding: CONTENT_PAD, paddingBottom: 40 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  title: { fontWeight: '700', fontSize: 32, color: C.text1 },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.accent + '33',
    borderWidth: 2,
    borderColor: C.accent + '66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitials: {
    fontWeight: '600',
    fontSize: 18,
    color: C.accent,
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontWeight: '600',
    fontSize: 17,
    color: C.text1,
    marginBottom: 2,
  },
  profileUsername: {
    fontWeight: '400',
    fontSize: 13,
    color: C.text3,
  },
  profileEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEditFields: { flex: 1, gap: 8 },
  profileEditInput: {
    backgroundColor: C.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontWeight: '400',
    fontSize: 14,
    color: C.text1,
    borderWidth: 1,
    borderColor: C.border,
  },
  profileEditBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  profileCancelBtn: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  profileCancelText: {
    fontWeight: '500',
    fontSize: 13,
    color: C.text3,
  },
  profileSaveBtn: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  profileSaveText: {
    fontWeight: '600',
    fontSize: 13,
    color: '#fff',
  },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statCard: {
    flex: 1,
    backgroundColor: C.surface1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  statCardFire: { borderColor: 'rgba(247,167,108,0.28)' },
  statValue: { fontWeight: '700', fontSize: 20, color: C.text1 },
  statLabel: {
    fontWeight: '500', fontSize: 10,
    color: C.text3, marginTop: 3, textAlign: 'center',
  },

  sectionLabel: {
    fontWeight: '600', fontSize: 11, color: C.text3,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 12,
  },

  card: {
    backgroundColor: C.surface1,
    borderRadius: 16,
    padding: CARD_PAD,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: C.border,
  },

  // heatmap
  heatmapRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  dayLabelText: {
    fontFamily: 'DMMono-Medium', fontSize: 9, color: C.text3, textAlign: 'right',
  },
  legendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
  },
  legendText: { fontWeight: '400', fontSize: 9, color: C.text3 },
  legendCell: { width: 10, height: 10, borderRadius: 2 },

  // milestones
  milestonesInner: { flexDirection: 'row', alignItems: 'stretch' },
  milestone: { flex: 1, alignItems: 'center', gap: 5 },
  milestoneDiv: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignSelf: 'stretch',
    marginHorizontal: 4,
  },
  milestoneVal: { fontFamily: 'DMMono-Medium', fontSize: 16, color: C.text1 },
  milestoneLabel: {
    fontWeight: '400', fontSize: 10, color: C.text3,
    textAlign: 'center', lineHeight: 14,
  },

  // empty state
  emptyCard: {
    backgroundColor: C.surface1, borderRadius: 16, padding: 36, alignItems: 'center',
  },
  emptyText: { fontWeight: '400', fontSize: 14, color: C.text3 },

  // session log
  group: { marginBottom: 24 },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8, paddingHorizontal: 2,
  },
  dayLabel: {
    fontWeight: '500', fontSize: 11, color: C.text3,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  dayTotal: { fontFamily: 'DMMono-Medium', fontSize: 12, color: C.accent },

  sessionRow: {
    flexDirection: 'row', backgroundColor: C.surface1,
    borderRadius: 10, marginBottom: 5, overflow: 'hidden',
  },
  colorBar: { width: 3 },
  rowMain: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  rowTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 2,
  },
  taskName: { fontWeight: '500', fontSize: 13, color: C.text1 },
  duration: { fontFamily: 'DMMono-Medium', fontSize: 12, color: C.accent },
  time: { fontWeight: '400', fontSize: 11, color: C.text3, marginBottom: 1 },
  note: {
    fontWeight: '400', fontSize: 11, color: C.text3, marginTop: 2, lineHeight: 16,
  },
});
