import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, componentHeights, radii, spacing, type } from '../../constants/theme';
import { AppScreen } from '../../components/AppScreen';
import { CircularStudyTimer } from '../../components/CircularStudyTimer';
import { Metric, MetricDivider } from '../../components/Metric';
import { Avatar } from '../../components/Avatar';
import { ListDivider } from '../../components/ListDivider';
import { getSessions, getWeekSessions, getTodaySessions } from '../../store/sessions';
import { getTasks, lookupTask } from '../../store/tasks';
import { getSettings } from '../../store/settings';
import { getLastStart, saveLastStart } from '../../store/lastStart';
import { supabase, generateId } from '../../utils/supabase';
import { getLeaderboard, type LeaderboardEntry } from '../../store/social';
import { formatDuration, formatStudyTime } from '../../utils/format';
import { ScalePressable } from '../../utils/ScalePressable';
import { getSubjectIcon } from '../../utils/subjectIcon';
import { SubjectIcon } from '../../components/SubjectIcon';
import type { Session, Task } from '../../types';

// ─── Types & pure helpers ────────────────────────────────────────────────────

type LeaderFriend = {
  id: string; name: string;
  weeklyMins: number; isLive: boolean; isMe?: boolean;
};

function entryToFriend(e: LeaderboardEntry): LeaderFriend {
  return {
    id: e.user_id,
    name: e.display_name ?? 'Unknown',
    weeklyMins: Math.round(e.weekly_secs / 60),
    isLive: e.is_studying,
    isMe: e.is_me,
  };
}

function formatMins(m: number): string {
  return formatStudyTime(m * 60);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

type HeroMsg = { headline: string; sub: string };

function buildHeroMsgs(
  weekSecs: number, weeklyGoalSecs: number, streak: number,
  myRank: number, friendAheadName: string | null, minsToNext: number,
): HeroMsg[] {
  const msgs: HeroMsg[] = [];
  const weekPct = Math.round((weekSecs / weeklyGoalSecs) * 100);
  const remaining = weeklyGoalSecs - weekSecs;

  if (weekSecs === 0) {
    msgs.push({ headline: 'Your first session', sub: 'starts now.' });
    if (friendAheadName) msgs.push({ headline: `${friendAheadName} is ahead.`, sub: 'Start now to catch up.' });
  } else {
    if (weekSecs >= weeklyGoalSecs) {
      msgs.push({ headline: 'Weekly goal hit.', sub: 'Keep going.' });
    } else if (remaining <= 30 * 60) {
      msgs.push({ headline: `${formatDuration(remaining)} away`, sub: 'from your weekly goal.' });
    } else if (weekPct >= 50) {
      msgs.push({ headline: 'More than halfway.', sub: `${formatDuration(remaining)} left this week.` });
    } else {
      msgs.push({ headline: `${formatDuration(weekSecs)} logged`, sub: `${weekPct}% of your weekly goal.` });
    }
    if (myRank === 1) msgs.push({ headline: '#1 this week.', sub: "Hold your lead — they're watching." });
    else if (friendAheadName && minsToNext > 0)
      msgs.push({ headline: `${formatMins(minsToNext)} to pass ${friendAheadName}.`, sub: `You're #${myRank} this week.` });
    if (streak >= 14) msgs.push({ headline: `${streak}-day streak.`, sub: "You're on fire. Don't stop." });
    else if (streak >= 7) msgs.push({ headline: `${streak}-day streak.`, sub: "Don't let tonight break it." });
    else if (streak >= 3) msgs.push({ headline: `${streak}-day streak.`, sub: 'Keep it alive.' });
  }
  return msgs.length ? msgs : [{ headline: 'Ready to study?', sub: "Let's go." }];
}

function buildSocialMsgs(myMins: number, myRank: number, friendAhead: LeaderFriend | null, live: LeaderFriend[]): string[] {
  const msgs: string[] = [];
  if (live.length >= 2) msgs.push(`${live[0].name} + ${live.length - 1} other${live.length > 2 ? 's' : ''} studying now`);
  else if (live.length === 1) msgs.push(`${live[0].name} is studying right now`);
  if (friendAhead) {
    const gap = friendAhead.weeklyMins - myMins;
    if (gap > 0) msgs.push(`${formatMins(gap)} to pass ${friendAhead.name}`);
  }
  msgs.push(myRank === 1 ? "You're leading the group this week" : `You're #${myRank} — keep pushing`);
  return msgs.length ? msgs : ['Study to move up the leaderboard'];
}

// ─── SocialPulse ──────────────────────────────────────────────────────────────

function SocialPulse({ messages, liveFriends }: { messages: string[]; liveFriends: LeaderFriend[] }) {
  const [idx, setIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const idxRef = useRef(0);
  const lenRef = useRef(messages.length);
  lenRef.current = messages.length;

  useEffect(() => {
    if (messages.length <= 1) return;
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        idxRef.current = (idxRef.current + 1) % lenRef.current;
        setIdx(idxRef.current);
        Animated.timing(fadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.socialPulse}>
      {liveFriends.length > 0 && (
        <View style={styles.socialAvatars}>
          {liveFriends.slice(0, 3).map((f, i) => (
            <View key={f.id} style={i > 0 && { marginLeft: -10 }}>
              <Avatar name={f.name} userId={f.id} size={30} live />
            </View>
          ))}
        </View>
      )}
      <Animated.Text style={[styles.socialMessage, { opacity: fadeAnim }]} numberOfLines={1}>
        {messages[idx] ?? ''}
      </Animated.Text>
      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
    </View>
  );
}

// ─── Leader / rank mini podium ─────────────────────────────────────────────────

function Podium({ entries, maxMins }: { entries: LeaderFriend[]; maxMins: number }) {
  const order = entries.length === 3 ? [entries[1], entries[0], entries[2]] : entries;
  return (
    <View style={styles.podiumRow}>
      {order.map((f) => {
        const rank = entries.indexOf(f) + 1;
        const isFirst = rank === 1;
        const barH = 10 + Math.round(((f.weeklyMins / Math.max(maxMins, 1)) || 0) * 26);
        const tint = isFirst ? colors.rankGold : f.isMe ? colors.accentPrimary : colors.textSecondary;
        return (
          <View key={f.id} style={styles.podiumItem}>
            <View style={[styles.podiumBadge, { backgroundColor: tint + '2A', borderColor: tint + '55' }]}>
              <Text style={[styles.podiumBadgeText, { color: tint }]}>{rank}</Text>
            </View>
            <View style={[styles.podiumBar, { height: barH, backgroundColor: tint + (isFirst ? 'cc' : '80') }]} />
            <Text style={styles.podiumValue}>{formatMins(f.weeklyMins)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const [sessions, setSessions]         = useState<Session[]>([]);
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [weeklyGoalSecs, setGoal]       = useState(8 * 3600);
  const [startMode, setStartMode]       = useState<'stopwatch' | 'timer'>('stopwatch');
  const [startTaskId, setStartTaskId]   = useState<string | null>(null);
  const [leaderboard, setLeaderboard]   = useState<LeaderFriend[]>([]);
  const [cardWidth, setCardWidth]       = useState(0);
  const [cardPage, setCardPage]         = useState(0);

  const pulseAnim      = useRef(new Animated.Value(1)).current;
  const ringBreathAnim = useRef(new Animated.Value(1)).current;

  useFocusEffect(useCallback(() => {
    getSessions().then(setSessions);
    getTasks().then(t => {
      setTasks(t);
      getLastStart().then(ls => {
        setStartMode(ls.mode);
        const validId = ls.taskId && t.find(tk => tk.id === ls.taskId)
          ? ls.taskId : (t.length > 0 ? t[0].id : null);
        setStartTaskId(validId);
      });
    });
    getSettings().then(s => setGoal(s.weeklyGoalSecs));
    getLeaderboard().then(lb => setLeaderboard(lb.map(entryToFriend)));
  }, []));

  // Real-time presence
  // Channel name is unique per mount — if React Navigation ever keeps a
  // previous instance of this screen alive briefly during a nested-tab
  // transition, two subscriptions with the same fixed topic name would
  // collide ("cannot add postgres_changes callbacks ... after subscribe()").
  useEffect(() => {
    const ch = supabase.channel(`home-presence-${generateId()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presence' }, () => {
        getSessions().then(setSessions);
        getLeaderboard().then(lb => setLeaderboard(lb.map(entryToFriend)));
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Ring breathing
  const hasProgress = useRef(false);
  useEffect(() => {
    const active = sessions.length > 0;
    if (active === hasProgress.current) return;
    hasProgress.current = active;
    if (!active) { ringBreathAnim.setValue(1); return; }
    const breath = Animated.loop(Animated.sequence([
      Animated.timing(ringBreathAnim, { toValue: 1.02, duration: 2800, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      Animated.timing(ringBreathAnim, { toValue: 1,    duration: 2800, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
    ]));
    breath.start();
    return () => breath.stop();
  }, [sessions.length > 0]);

  // CTA pulse
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(3000),
      Animated.timing(pulseAnim, { toValue: 1.015, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(pulseAnim, { toValue: 1,     duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  function handleQuickStart() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveLastStart({ mode: startMode, taskId: startTaskId });
    const params: Record<string, string> = { mode: startMode };
    if (startTaskId) params.subjectId = startTaskId;
    router.push({ pathname: '/timer', params });
  }

  function handleCardLayout(e: LayoutChangeEvent) {
    setCardWidth(e.nativeEvent.layout.width);
  }

  function handleCardScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (cardWidth <= 0) return;
    setCardPage(Math.round(e.nativeEvent.contentOffset.x / cardWidth));
  }

  // ─── Computed ─────────────────────────────────────────────────────────────

  const weekSessions  = getWeekSessions(sessions);
  const weekSecs      = weekSessions.reduce((a, s) => a + s.secs, 0);
  const weekPct       = Math.min(Math.round((weekSecs / weeklyGoalSecs) * 100), 100);
  const streak        = getStreakDays(sessions);
  const myMins        = Math.round(weekSecs / 60);
  const remainingSecs = Math.max(weeklyGoalSecs - weekSecs, 0);
  const ringColor     = weekPct >= 100 ? colors.accentSecondary : colors.accentPrimary;

  const sortedLB    = useMemo(() => [...leaderboard].sort((a, b) => b.weeklyMins - a.weeklyMins), [leaderboard]);
  const myRank      = sortedLB.findIndex(f => f.isMe) + 1 || 1;
  const friendAhead = myRank > 1 ? sortedLB[myRank - 2] : null;
  const minsToNext  = friendAhead ? Math.max(friendAhead.weeklyMins - myMins, 0) : 0;
  const liveFriends = leaderboard.filter(f => f.isLive && !f.isMe);
  const hasSocialContext = liveFriends.length > 0 || leaderboard.length > 1;
  const hasLeaderPreview = sortedLB.length >= 2;
  const topN = sortedLB.slice(0, Math.min(3, sortedLB.length));
  const topMins = topN[0]?.weeklyMins ?? 1;

  const heroMessages = useMemo(
    () => buildHeroMsgs(weekSecs, weeklyGoalSecs, streak, myRank, friendAhead?.name ?? null, minsToNext),
    [weekSecs, weeklyGoalSecs, streak, myRank, minsToNext],
  );
  const heroMsg = heroMessages[0];

  const socialMessages = useMemo(
    () => buildSocialMsgs(myMins, myRank, friendAhead ?? null, liveFriends),
    [myMins, myRank, friendAhead],
  );

  const todaySessions  = getTodaySessions(sessions);
  const todayTotal     = todaySessions.reduce((a, s) => a + s.secs, 0);
  const displaySessions = todaySessions.length > 0 ? todaySessions : sessions.slice(0, 3);
  const momentumLabel  = todaySessions.length > 0 ? 'Today' : sessions.length > 0 ? 'Recent' : null;

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <AppScreen fade contentStyle={{ paddingTop: spacing.md }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>
        {streak > 0 && (
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={13} color={colors.warning} />
            <Text style={styles.streakBadgeText}>{streak} day streak</Text>
          </View>
        )}
      </View>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <View style={styles.heroWrap}>

        <View style={styles.heroRow}>
          <Animated.View style={{ transform: [{ scale: ringBreathAnim }] }}>
            <View style={styles.ringGlow}>
              <CircularStudyTimer size={156} strokeWidth={9} progress={weekPct / 100} color={ringColor}>
                <View style={styles.ringCenter}>
                  <Text style={styles.ringEyebrow}>weekly goal</Text>
                  <Text style={[styles.ringNum, { color: weekPct === 0 ? colors.textMuted : colors.textPrimary }]}>
                    {weekPct}<Text style={styles.ringSym}>%</Text>
                  </Text>
                  <Text style={styles.ringFraction}>
                    {formatDuration(weekSecs)} / {formatDuration(weeklyGoalSecs)}
                  </Text>
                </View>
              </CircularStudyTimer>
            </View>
          </Animated.View>

          <View style={styles.leaderCardWrap} onLayout={handleCardLayout}>
            {cardWidth > 0 && (
              hasLeaderPreview ? (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={handleCardScrollEnd}
                  style={{ width: cardWidth }}
                >
                  <View style={[styles.leaderCardPage, { width: cardWidth }]}>
                    <Text style={styles.cardEyebrow} numberOfLines={1}>
                      {friendAhead && minsToNext > 0 ? `${formatMins(minsToNext)} to pass` : myRank === 1 ? "You're in the lead" : 'This week'}
                    </Text>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {friendAhead && minsToNext > 0 ? friendAhead.name : myRank === 1 ? 'Keep it up' : 'Weekly ranking'}
                    </Text>
                    <Text style={[styles.cardRank, { color: ringColor }]}>You're #{myRank} this week</Text>
                    <Podium entries={topN} maxMins={topMins} />
                  </View>
                  <View style={[styles.leaderCardPage, styles.leaderCardPageCentered, { width: cardWidth }]}>
                    <Text style={styles.cardName}>{heroMsg.headline}</Text>
                    <Text style={[styles.cardEyebrow, { color: ringColor, marginTop: 4 }]}>{heroMsg.sub}</Text>
                  </View>
                </ScrollView>
              ) : (
                <View style={[styles.leaderCardPage, styles.leaderCardPageCentered, { width: cardWidth }]}>
                  <Text style={styles.cardName}>{heroMsg.headline}</Text>
                  <Text style={[styles.cardEyebrow, { color: ringColor, marginTop: 4 }]}>{heroMsg.sub}</Text>
                </View>
              )
            )}
            {hasLeaderPreview && (
              <View style={styles.dotsRow}>
                {[0, 1].map(i => (
                  <View key={i} style={[styles.dot, i === cardPage && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        </View>

        <View style={styles.statsRow}>
          <Metric
            icon="time-outline" iconColor={colors.focus}
            value={weekSecs === 0 ? '—' : formatDuration(weekSecs)} label="logged"
          />
          <MetricDivider />
          <Metric
            icon="flag" iconColor={colors.accentPrimary}
            value={weekPct >= 100 ? '+' + formatDuration(weekSecs - weeklyGoalSecs) : formatDuration(remainingSecs)}
            label={weekPct >= 100 ? 'over goal' : 'to go'}
          />
          <MetricDivider />
          <Metric
            icon="flame" iconColor={colors.warning}
            value={streak > 0 ? `${streak}d` : '—'}
            label="streak"
            valueColor={streak > 0 ? colors.warning : colors.textMuted}
          />
        </View>

      </View>

      {/* ── Social pulse ──────────────────────────────────────── */}
      {hasSocialContext && socialMessages.length > 0 && (
        <TouchableOpacity onPress={() => router.push('/(tabs)/friends')} activeOpacity={0.75}>
          <SocialPulse messages={socialMessages} liveFriends={liveFriends} />
        </TouchableOpacity>
      )}

      {/* ── CTA ───────────────────────────────────────────────── */}
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <ScalePressable onPress={handleQuickStart} scaleTo={0.97} style={styles.ctaWrapper}>
          <LinearGradient
            colors={[colors.accentSecondary, colors.accentPrimary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaBtn}
          >
            <Ionicons name="sparkles" size={16} color={colors.textOnAccent} />
            <Text style={type.button}>Start Studying</Text>
          </LinearGradient>
        </ScalePressable>
      </Animated.View>

      {/* ── Recent sessions ───────────────────────────────────── */}
      {momentumLabel && (
        <View style={styles.momentumSection}>
          <View style={styles.momentumHeader}>
            <Text style={type.sectionTitle}>{momentumLabel}</Text>
            {todaySessions.length > 0 && todayTotal > 0 && (
              <Text style={styles.momentumTotal}>{formatDuration(todayTotal)}</Text>
            )}
          </View>
          <View style={styles.sessionSurface}>
            {displaySessions.map((s, i) => {
              const subj = lookupTask(tasks, s.subjectId);
              const icon = getSubjectIcon(subj.label);
              return (
                <View key={s.id}>
                  {i > 0 && <ListDivider inset={spacing.lg + 36 + spacing.md} />}
                  <ScalePressable
                    onPress={() => router.push({ pathname: '/task-detail', params: { taskId: subj.id } })}
                    scaleTo={0.99}
                    style={styles.sessionRow}
                  >
                    <View style={[styles.sessionIconTile, { backgroundColor: subj.color + '22', borderColor: subj.color + '3d' }]}>
                      <SubjectIcon icon={icon} size={16} color={subj.color} />
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionSubject}>{subj.label}</Text>
                      {s.note ? <Text style={styles.sessionNote} numberOfLines={1}>{s.note}</Text> : null}
                    </View>
                    <View style={styles.sessionRight}>
                      <Text style={styles.sessionDuration}>{formatDuration(s.secs)}</Text>
                      {momentumLabel === 'Recent' && <Text style={styles.sessionDate}>{formatDate(s.ts)}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </ScalePressable>
                </View>
              );
            })}
          </View>
        </View>
      )}

    </AppScreen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.xxl },
  greeting: { fontWeight: '700', fontSize: 22, color: colors.textPrimary, marginBottom: 4 },
  dateText: { ...type.meta },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.md, height: componentHeights.chip,
    borderRadius: radii.full, borderWidth: 1, borderColor: colors.warning + '40',
    backgroundColor: colors.warning + '14',
  },
  streakBadgeText: { fontWeight: '600', fontSize: 12, color: colors.warning },

  // ── Hero ─────────────────────────────────────────────────────────────────

  heroWrap: { gap: spacing.lg, marginBottom: spacing.xl },
  heroRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },

  ringGlow: {
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 8,
  },
  ringCenter: { alignItems: 'center' },
  ringEyebrow: { fontWeight: '600', fontSize: 10, color: colors.accentPrimary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  ringNum: { fontFamily: 'DMMono-Medium', fontSize: 32, lineHeight: 36, includeFontPadding: false },
  ringSym: { fontFamily: 'DMMono-Medium', fontSize: 16, color: colors.textSecondary },
  ringFraction: { fontWeight: '400', fontSize: 11, color: colors.textMuted, marginTop: 3 },

  leaderCardWrap: { flex: 1, justifyContent: 'space-between' },
  leaderCardPage: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.md,
    minHeight: 156,
    gap: 2,
  },
  leaderCardPageCentered: { justifyContent: 'center' },
  cardEyebrow: { fontWeight: '400', fontSize: 12, color: colors.textSecondary },
  cardName: { fontWeight: '700', fontSize: 17, color: colors.textPrimary },
  cardRank: { fontWeight: '600', fontSize: 12, marginTop: 2, marginBottom: spacing.sm },

  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 'auto', gap: spacing.sm },
  podiumItem: { alignItems: 'center', gap: 4, flex: 1 },
  podiumBadge: {
    width: 28, height: 28, borderRadius: radii.full, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  podiumBadgeText: { fontFamily: 'DMMono-Medium', fontSize: 12, fontWeight: '700' },
  podiumBar: { width: 22, borderRadius: 4 },
  podiumValue: { fontFamily: 'DMMono-Medium', fontSize: 10, color: colors.textMuted },

  dotsRow: { flexDirection: 'row', alignSelf: 'center', gap: 5, marginTop: spacing.sm },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.divider },
  dotActive: { backgroundColor: colors.accentPrimary, width: 14 },

  heroMsg: { alignItems: 'center', gap: 2 },
  heroHeadline: { fontWeight: '700', fontSize: 19, color: colors.textPrimary, textAlign: 'center', lineHeight: 24 },
  heroSub:      { fontWeight: '500', fontSize: 19, textAlign: 'center', lineHeight: 24 },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceRaised,
  },

  // ── Social pulse ──────────────────────────────────────────────────────────

  socialPulse: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.md,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surfaceRaised,
  },
  socialAvatars: { flexDirection: 'row', alignItems: 'center' },
  socialMessage: { flex: 1, fontWeight: '500', fontSize: 13, color: colors.textSecondary },

  // ── CTA ───────────────────────────────────────────────────────────────────

  ctaWrapper: { borderRadius: radii.lg, overflow: 'hidden', marginBottom: spacing.xl },
  ctaBtn: {
    height: componentHeights.button + 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },

  // ── Recent sessions ───────────────────────────────────────────────────────

  momentumSection: { marginTop: spacing.xl },
  momentumHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  momentumTotal: { fontFamily: 'DMMono-Medium', fontSize: 12, color: colors.accentPrimary },
  sessionSurface: { backgroundColor: colors.surfaceRaised, borderRadius: radii.lg, overflow: 'hidden' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
  sessionIconTile: {
    width: 36, height: 36, borderRadius: radii.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  sessionInfo: { flex: 1 },
  sessionSubject: { fontWeight: '600', fontSize: 14, color: colors.textPrimary },
  sessionNote: { ...type.meta, marginTop: 1 },
  sessionRight: { alignItems: 'flex-end' },
  sessionDuration: { fontFamily: 'DMMono-Medium', fontSize: 13, color: colors.accentPrimary },
  sessionDate: { fontWeight: '400', fontSize: 10, color: colors.textMuted, marginTop: 2 },
});
