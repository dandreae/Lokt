import { useCallback, useState, useMemo } from 'react';
import {
  Alert, View, Text, StyleSheet,
  Dimensions, TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, type } from '../../constants/theme';
import { AppScreen } from '../../components/AppScreen';
import { AppHeader } from '../../components/AppHeader';
import { IconButton } from '../../components/IconButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SecondaryButton } from '../../components/SecondaryButton';
import { Avatar } from '../../components/Avatar';
import { Metric, MetricDivider } from '../../components/Metric';
import { EmptyState } from '../../components/EmptyState';
import { ListDivider } from '../../components/ListDivider';
import { getSessions } from '../../store/sessions';
import { getTasks, lookupTask } from '../../store/tasks';
import { getMyProfile, updateDisplayName, updateUsername } from '../../store/social';
import { formatDuration } from '../../utils/format';
import type { Session, Task } from '../../types';

// --- grid layout constants ---
// Kept exactly as before (values intentionally literal, not tokens) since
// they feed CELL_SIZE math and must not shift the heatmap layout.
const NUM_WEEKS = 14;
const CELL_GAP = 3;
const SCREEN_W = Dimensions.get('window').width;
const CONTENT_PAD = spacing.xl; // matches AppScreen's horizontal padding
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
  if (mins === 0) return isToday ? colors.surfaceActive : colors.divider;
  if (mins < 30) return colors.accentPrimary + '55';
  if (mins < 60) return colors.accentPrimary + '99';
  return colors.accentPrimary;
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
    <AppScreen>
      <AppHeader
        variant="large"
        title="Profile"
        right={<IconButton icon="settings-outline" onPress={() => router.push('/settings')} accessibilityLabel="Settings" />}
      />

      {/* Profile header */}
      <View style={styles.profileHeader}>
        <Avatar name={displayName || 'Profile'} userId={username || displayName || 'me'} size={56} isMe />

        {editing ? (
          <View style={styles.profileEditFields}>
            <TextInput
              style={styles.profileEditInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Display name"
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="next"
            />
            <TextInput
              style={styles.profileEditInput}
              value={editUsername}
              onChangeText={(t) => setEditUsername(t.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              placeholder="username"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <View style={styles.profileEditBtns}>
              <SecondaryButton title="Cancel" onPress={() => setEditing(false)} compact style={styles.profileEditBtn} />
              <PrimaryButton title="Save" onPress={handleSave} disabled={saving} loading={saving} compact style={styles.profileEditBtn} />
            </View>
          </View>
        ) : (
          <View style={styles.profileInfo}>
            <Text style={type.name}>{displayName || 'Set your name'}</Text>
            <Text style={styles.profileUsername}>
              {username ? `@${username}` : `@${displayName} · tap to set username`}
            </Text>
          </View>
        )}

        {!editing && (
          <IconButton icon="pencil-outline" size="sm" color={colors.textMuted} onPress={startEdit} accessibilityLabel="Edit profile" />
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <Metric value={`${(totalSecs / 3600).toFixed(1)}h`} label="Total time" />
        <MetricDivider />
        <Metric value={String(sessions.length)} label="Sessions" />
        <MetricDivider />
        <Metric
          value={streak > 0 ? `${streak}d` : '—'}
          label="Streak"
          valueColor={streak > 0 ? colors.warning : colors.textMuted}
        />
      </View>

      {/* Activity heatmap + milestones */}
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
                      ...(cell.isToday && { borderWidth: 1, borderColor: colors.textPrimary + '59' }),
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
          {([colors.divider, colors.accentPrimary + '55', colors.accentPrimary + '99', colors.accentPrimary] as string[]).map((bg, i) => (
            <View key={i} style={[styles.legendCell, { backgroundColor: bg }]} />
          ))}
          <Text style={styles.legendText}>More</Text>
        </View>

        {/* Milestones */}
        <View style={styles.milestonesDivider}>
          <ListDivider />
        </View>
        <View style={styles.milestonesInner}>
          <View style={styles.milestone}>
            <Ionicons name="timer-outline" size={16} color={colors.accentPrimary} />
            <Text style={[styles.milestoneVal, { color: colors.accentPrimary }]}>
              {longestSecs > 0 ? formatDuration(longestSecs) : '—'}
            </Text>
            <Text style={styles.milestoneLabel}>Longest{'\n'}session</Text>
          </View>
          <View style={styles.milestoneDiv} />
          <View style={styles.milestone}>
            <Ionicons name="flame-outline" size={16} color={colors.warning} />
            <Text style={[styles.milestoneVal, { color: colors.warning }]}>
              {bestStreak > 0 ? `${bestStreak}d` : '—'}
            </Text>
            <Text style={styles.milestoneLabel}>Best{'\n'}streak</Text>
          </View>
          <View style={styles.milestoneDiv} />
          <View style={styles.milestone}>
            <Ionicons name="calendar-outline" size={16} color={colors.accentSecondary} />
            <Text style={[styles.milestoneVal, { color: colors.accentSecondary }]}>
              {studyDays > 0 ? String(studyDays) : '—'}
            </Text>
            <Text style={styles.milestoneLabel}>Study{'\n'}days</Text>
          </View>
        </View>
      </View>

      {/* Session Log */}
      <Text style={styles.sectionLabel}>Session Log</Text>

      {groups.length === 0 ? (
        <EmptyState icon="time-outline" title="No sessions yet" subtitle="Your study history will appear here." />
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <View style={styles.dayHeader}>
              <Text style={type.sectionTitle}>{group.label}</Text>
              <Text style={styles.dayTotal}>{formatDuration(group.totalSecs)}</Text>
            </View>
            <View style={styles.sessionList}>
              {group.sessions.map((s, i) => {
                const task = lookupTask(tasks, s.subjectId);
                return (
                  <View key={s.id}>
                    {i > 0 && <ListDivider inset={CARD_PAD + 3} />}
                    <View style={styles.sessionRow}>
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
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  // Profile header
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xxl,
    paddingVertical: spacing.xs,
  },
  profileInfo: { flex: 1 },
  profileUsername: {
    ...type.meta,
  },
  profileEditFields: { flex: 1, gap: spacing.sm },
  profileEditInput: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontWeight: '400',
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  profileEditBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs / 2,
  },
  profileEditBtn: { flex: 1 },

  statsRow: {
    flexDirection: 'row',
    marginBottom: spacing.xxxl,
    paddingVertical: spacing.xl,
  },

  sectionLabel: {
    ...type.sectionTitle,
    marginBottom: spacing.md,
  },

  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: CARD_PAD,
    marginBottom: spacing.xxl + spacing.xs,
  },

  // heatmap
  heatmapRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm + 2 },
  dayLabelText: {
    fontFamily: 'DMMono-Medium', fontSize: 9, color: colors.textMuted, textAlign: 'right',
  },
  legendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs,
  },
  legendText: { fontWeight: '400', fontSize: 9, color: colors.textMuted },
  legendCell: { width: 10, height: 10, borderRadius: 2 },

  // milestones (inside activity card)
  milestonesDivider: {
    marginHorizontal: -CARD_PAD,
    marginTop: spacing.sm,
    marginBottom: spacing.md + 2,
  },
  milestonesInner: { flexDirection: 'row', alignItems: 'stretch' },
  milestone: { flex: 1, alignItems: 'center', gap: spacing.xs },
  milestoneDiv: {
    width: 1,
    backgroundColor: colors.divider,
    alignSelf: 'stretch',
    marginHorizontal: spacing.xs,
  },
  milestoneVal: { fontFamily: 'DMMono-Medium', fontSize: 15, color: colors.textPrimary },
  milestoneLabel: {
    fontWeight: '400', fontSize: 10, color: colors.textMuted,
    textAlign: 'center', lineHeight: 14,
  },

  // session log
  group: { marginBottom: spacing.xxl },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.sm, paddingHorizontal: 2,
  },
  dayTotal: { fontFamily: 'DMMono-Medium', fontSize: 12, color: colors.accentPrimary },

  sessionList: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  sessionRow: {
    flexDirection: 'row',
  },
  colorBar: { width: 3, alignSelf: 'stretch' },
  rowMain: { flex: 1, paddingVertical: spacing.md - 1, paddingHorizontal: spacing.md },
  rowTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 2,
  },
  taskName: { fontWeight: '500', fontSize: 13, color: colors.textPrimary },
  duration: { fontFamily: 'DMMono-Medium', fontSize: 12, color: colors.accentPrimary },
  time: { fontWeight: '400', fontSize: 11, color: colors.textMuted, marginBottom: 1 },
  note: {
    fontWeight: '400', fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 16,
  },
});
