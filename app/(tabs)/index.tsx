import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { C } from '../../constants/colors';
import { getSessions, getWeekSessions, getTodaySessions } from '../../store/sessions';
import { getTasks, lookupTask } from '../../store/tasks';
import { getSettings } from '../../store/settings';
import { getLastStart, saveLastStart } from '../../store/lastStart';
import { supabase } from '../../utils/supabase';
import { getLeaderboard, type LeaderboardEntry } from '../../store/social';
import { formatDuration } from '../../utils/format';
import { useFadeIn } from '../../utils/useFadeIn';
import { ScalePressable } from '../../utils/ScalePressable';
import type { Session, Task } from '../../types';

// ─── Layout animation configs ─────────────────────────────────────────────────

const EXPAND_ANIM = {
  duration: 340,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
};
const COLLAPSE_ANIM = {
  duration: 260,
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
};

// ─── Leaderboard helpers ──────────────────────────────────────────────────────

type LeaderFriend = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  weeklyMins: number;
  isLive: boolean;
  isMe?: boolean;
};

const LEADER_AVATAR_COLORS = [
  '#7c6ff7', '#6cb4f7', '#5ee8b0', '#f7a76c',
  '#f7d96c', '#f76cbf', '#f76c6c', '#5ee8e8',
];

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return LEADER_AVATAR_COLORS[Math.abs(hash) % LEADER_AVATAR_COLORS.length];
}

function entryToLeaderFriend(e: LeaderboardEntry): LeaderFriend {
  return {
    id: e.user_id,
    name: e.display_name ?? 'Unknown',
    initials: e.is_me ? 'ME' : getInitials(e.display_name ?? ''),
    avatarColor: e.is_me ? C.accent : getAvatarColor(e.user_id),
    weeklyMins: Math.round(e.weekly_secs / 60),
    isLive: e.is_studying,
    isMe: e.is_me,
  };
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, tension: 70, friction: 11 }).start();
  }, [value]);
  const trackBg = anim.interpolate({ inputRange: [0, 1], outputRange: [C.surface3, C.accent] });
  const thumbX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });
  return (
    <TouchableOpacity onPress={() => onChange(!value)} activeOpacity={0.85} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Animated.View style={[styles.toggleTrack, { backgroundColor: trackBg }]}>
        <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: thumbX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  );
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
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        idxRef.current = (idxRef.current + 1) % lenRef.current;
        setIdx(idxRef.current);
        Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.socialPulse}>
      {liveFriends.length > 0 && (
        <View style={styles.socialAvatars}>
          {liveFriends.slice(0, 3).map((f, i) => (
            <View key={f.id} style={[styles.socialAvatarWrap, i > 0 && { marginLeft: -9 }]}>
              <View style={[styles.socialAvatarCircle, { backgroundColor: f.avatarColor + '28', borderColor: f.avatarColor + '60' }]}>
                <Text style={[styles.socialAvatarText, { color: f.avatarColor }]}>{f.initials}</Text>
              </View>
              <View style={styles.socialLiveDot} />
            </View>
          ))}
        </View>
      )}
      <Animated.Text style={[styles.socialMessage, { opacity: fadeAnim }]} numberOfLines={1}>
        {messages[idx] ?? ''}
      </Animated.Text>
      <Ionicons name="chevron-forward" size={11} color={C.text3} />
    </View>
  );
}

// ─── WeekRing ─────────────────────────────────────────────────────────────────

function WeekRing({
  progress = 0,
  color = C.accent,
  size = 164,
  strokeWidth = 8,
  children,
}: {
  progress?: number;
  color?: string;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);
  const animVal = useRef(new Animated.Value(circumference)).current;

  useEffect(() => {
    const clamped = Math.min(Math.max(progress, 0), 1);
    const target = circumference * (1 - clamped);
    const id = animVal.addListener(({ value }) => setOffset(value));
    Animated.timing(animVal, {
      toValue: target,
      duration: 1100,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start(() => animVal.removeListener(id));
    return () => animVal.removeListener(id);
  }, [progress, circumference]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Track */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color + '22'}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type HeroMsg = { headline: string; sub: string };

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function getStreakDays(sessions: Session[]): number {
  if (sessions.length === 0) return 0;
  const days = new Set(sessions.map((s) => {
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

function buildHeroMsgs(
  weekSecs: number,
  weeklyGoalSecs: number,
  streak: number,
  myRank: number,
  friendAheadName: string | null,
  minsToNext: number,
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
    if (myRank === 1) {
      msgs.push({ headline: '#1 this week.', sub: "Hold your lead — they're watching." });
    } else if (friendAheadName && minsToNext > 0) {
      msgs.push({ headline: `${formatMins(minsToNext)} to pass ${friendAheadName}.`, sub: `You're #${myRank} this week.` });
    }
    if (streak >= 14) {
      msgs.push({ headline: `${streak}-day streak.`, sub: "You're on fire. Don't stop." });
    } else if (streak >= 7) {
      msgs.push({ headline: `${streak}-day streak.`, sub: "Don't let tonight break it." });
    } else if (streak >= 3) {
      msgs.push({ headline: `${streak}-day streak.`, sub: 'Keep it alive.' });
    }
  }

  return msgs.length > 0 ? msgs : [{ headline: 'Ready to study?', sub: "Let's go." }];
}

function buildSocialMsgs(myActualMins: number, myRank: number, friendAhead: LeaderFriend | null, liveFriends: LeaderFriend[]): string[] {
  const msgs: string[] = [];
  if (liveFriends.length >= 2) {
    msgs.push(`${liveFriends[0].name} + ${liveFriends.length - 1} other${liveFriends.length > 2 ? 's' : ''} studying now`);
  } else if (liveFriends.length === 1) {
    msgs.push(`${liveFriends[0].name} is studying right now`);
  }
  if (friendAhead) {
    const gap = friendAhead.weeklyMins - myActualMins;
    if (gap > 0) msgs.push(`${formatMins(gap)} to pass ${friendAhead.name}`);
  }
  msgs.push(myRank === 1 ? "You're leading the group this week" : `You're #${myRank} — keep pushing`);
  return msgs.length > 0 ? msgs : ['Study to move up the leaderboard'];
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weeklyGoalSecs, setWeeklyGoalSecs] = useState(8 * 3600);
  const [showPanel, setShowPanel] = useState(false);
  const [startMode, setStartMode] = useState<'stopwatch' | 'timer'>('stopwatch');
  const [startTaskId, setStartTaskId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderFriend[]>([]);
  const [heroMsgIdx, setHeroMsgIdx] = useState(0);

  const fadeAnim = useFadeIn();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;
  const panelSlide = useRef(new Animated.Value(-10)).current;
  const heroAnim = useRef(new Animated.Value(1)).current;
  const heroFadeAnim = useRef(new Animated.Value(1)).current;
  const ringBreathAnim = useRef(new Animated.Value(1)).current;
  const focusMorphAnim = useRef(new Animated.Value(0)).current;
  const heroMsgIdxRef = useRef(0);
  const heroMsgLenRef = useRef(1);

  useFocusEffect(
    useCallback(() => {
      getSessions().then(setSessions);
      getTasks().then((t) => {
        setTasks(t);
        getLastStart().then((ls) => {
          setStartMode(ls.mode);
          const validId = ls.taskId && t.find((tk) => tk.id === ls.taskId) ? ls.taskId : (t.length > 0 ? t[0].id : null);
          setStartTaskId(validId);
        });
      });
      getSettings().then((s) => setWeeklyGoalSecs(s.weeklyGoalSecs));
      getLeaderboard().then((lb) => setLeaderboard(lb.map(entryToLeaderFriend)));
    }, [])
  );

  // Hero message rotation
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(heroFadeAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
        heroMsgIdxRef.current = (heroMsgIdxRef.current + 1) % Math.max(heroMsgLenRef.current, 1);
        setHeroMsgIdx(heroMsgIdxRef.current);
        Animated.timing(heroFadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Real-time: reload sessions when presence changes so social pulse
  // messages ("Alex K. is studying now") update instantly.
  useEffect(() => {
    const channel = supabase
      .channel('home-presence')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'presence' },
        () => {
          getSessions().then(setSessions);
          getLeaderboard().then((lb) => setLeaderboard(lb.map(entryToLeaderFriend)));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Ring breathing — only when there is progress
  const hasProgress = useRef(false);
  useEffect(() => {
    const active = sessions.length > 0;
    if (active === hasProgress.current) return;
    hasProgress.current = active;
    if (!active) { ringBreathAnim.setValue(1); return; }
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(ringBreathAnim, { toValue: 1.018, duration: 2600, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(ringBreathAnim, { toValue: 1, duration: 2600, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    );
    breath.start();
    return () => breath.stop();
  }, [sessions.length > 0]);

  // Start button pulse
  useEffect(() => {
    if (showPanel) {
      pulseAnim.stopAnimation();
      Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(3200),
        Animated.timing(pulseAnim, { toValue: 1.016, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showPanel]);

  function openPanel() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    panelOpacity.setValue(0);
    panelSlide.setValue(-10);
    Animated.timing(heroAnim, { toValue: 0.75, duration: 220, useNativeDriver: true }).start();
    LayoutAnimation.configureNext(EXPAND_ANIM);
    setShowPanel(true);
    Animated.parallel([
      Animated.timing(panelOpacity, { toValue: 1, duration: 260, delay: 80, useNativeDriver: true }),
      Animated.timing(panelSlide, { toValue: 0, duration: 300, delay: 80, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }

  function closePanel() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(heroAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    Animated.parallel([
      Animated.timing(panelOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(panelSlide, { toValue: -6, duration: 160, useNativeDriver: true }),
    ]).start(() => { LayoutAnimation.configureNext(COLLAPSE_ANIM); setShowPanel(false); });
  }

  function handleQuickStart() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveLastStart({ mode: startMode, taskId: startTaskId });
    const pathname = startMode === 'stopwatch' ? '/stopwatch' : '/timer';
    router.push(startTaskId ? { pathname, params: { subjectId: startTaskId } } : { pathname });
  }

  function handleGo() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveLastStart({ mode: startMode, taskId: startTaskId });
    const pathname = startMode === 'stopwatch' ? '/stopwatch' : '/timer';
    const params: Record<string, string> = {};
    if (startTaskId) params.subjectId = startTaskId;
    if (focusMode) params.focusMode = '1';
    router.push({ pathname, params });
    setShowPanel(false);
    heroAnim.setValue(1);
  }

  function handleSelectMode(mode: 'stopwatch' | 'timer') {
    if (mode !== startMode) { Haptics.selectionAsync(); setStartMode(mode); }
  }

  function handleSelectTask(id: string) {
    if (id !== startTaskId) { Haptics.selectionAsync(); setStartTaskId(id); }
  }

  function handleToggleFocusMode(v: boolean) {
    Haptics.selectionAsync();
    setFocusMode(v);
    Animated.spring(focusMorphAnim, { toValue: v ? 1 : 0, useNativeDriver: false, tension: 65, friction: 11 }).start();
  }

  // ─── Computed ──────────────────────────────────────────────────────────────

  const weekSessions = getWeekSessions(sessions);
  const weekSecs = weekSessions.reduce((a, s) => a + s.secs, 0);
  const weekPct = Math.min(Math.round((weekSecs / weeklyGoalSecs) * 100), 100);
  const streak = getStreakDays(sessions);
  const myActualMins = Math.round(weekSecs / 60);
  const remainingSecs = Math.max(weeklyGoalSecs - weekSecs, 0);

  const myRank = leaderboard.findIndex((f) => f.isMe) + 1 || 1;
  const friendAhead = myRank > 1 ? leaderboard[myRank - 2] : null;
  const minsToNext = friendAhead ? Math.max(friendAhead.weeklyMins - myActualMins, 0) : 0;
  const liveFriends = leaderboard.filter((f) => f.isLive && !f.isMe);

  const heroMessages = useMemo(
    () => buildHeroMsgs(weekSecs, weeklyGoalSecs, streak, myRank, friendAhead?.name ?? null, minsToNext),
    [weekSecs, weeklyGoalSecs, streak, myRank, minsToNext]
  );
  heroMsgLenRef.current = heroMessages.length;
  const safeHeroMsg = heroMessages[heroMsgIdx % heroMessages.length];

  const socialMessages = useMemo(
    () => buildSocialMsgs(myActualMins, myRank, friendAhead ?? null, liveFriends),
    [myActualMins, myRank, friendAhead]
  );

  const todaySessions = getTodaySessions(sessions);
  const todayTotal = todaySessions.reduce((a, s) => a + s.secs, 0);
  const displaySessions = todaySessions.length > 0 ? todaySessions : sessions.slice(0, 3);
  const momentumLabel = todaySessions.length > 0 ? 'Today' : sessions.length > 0 ? 'Recent' : null;

  const selectedTask = tasks.find((t) => t.id === startTaskId);
  const setupLabel = selectedTask
    ? `${startMode === 'stopwatch' ? 'Stopwatch' : 'Timer'} · ${selectedTask.label}`
    : (startMode === 'stopwatch' ? 'Stopwatch' : 'Timer');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const focusRowBg = focusMorphAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0)', 'rgba(63,175,114,0.08)'] });
  const moonDimOpacity = focusMorphAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const moonLitOpacity = focusMorphAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const ringColor = weekPct >= 100 ? C.accent2 : C.accent;

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <SafeAreaView style={styles.safe} edges={['top']}>


        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <Text style={styles.dateText}>{today}</Text>

          {/* ── Hero Card ──────────────────────────────────────────── */}
          <Animated.View style={[styles.heroShadowWrap, { opacity: heroAnim, shadowColor: ringColor }]}>
            <View style={styles.heroCard}>

              {/* Progress Ring */}
              <Animated.View style={{ transform: [{ scale: ringBreathAnim }] }}>
                <WeekRing progress={weekPct / 100} color={ringColor} size={164}>
                  <View style={styles.ringCenter}>
                    <Text style={[styles.ringPctNum, { color: weekPct === 0 ? C.text3 : C.text1 }]}>
                      {weekPct}
                      <Text style={styles.ringPctSymbol}>%</Text>
                    </Text>
                    <Text style={styles.ringGoalLabel}>weekly goal</Text>
                  </View>
                </WeekRing>
              </Animated.View>

              {/* Rotating message */}
              <Animated.View style={[styles.heroMsgWrap, { opacity: heroFadeAnim }]}>
                <Text style={styles.heroHeadline}>{safeHeroMsg.headline}</Text>
                <Text style={[styles.heroSub, { color: weekPct >= 100 ? C.accent2 : C.accent }]}>
                  {safeHeroMsg.sub}
                </Text>
              </Animated.View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{formatDuration(weekSecs)}</Text>
                  <Text style={styles.statLabel}>logged</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>
                    {weekPct >= 100
                      ? '+' + formatDuration(weekSecs - weeklyGoalSecs)
                      : formatDuration(remainingSecs)}
                  </Text>
                  <Text style={styles.statLabel}>{weekPct >= 100 ? 'over goal' : 'to go'}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  {streak > 0 ? (
                    <View style={styles.statStreakRow}>
                      <Ionicons name="flame" size={13} color={C.accent3} />
                      <Text style={[styles.statValue, { color: C.accent3 }]}>{streak}d</Text>
                    </View>
                  ) : (
                    <Text style={[styles.statValue, { color: C.text3 }]}>—</Text>
                  )}
                  <Text style={styles.statLabel}>streak</Text>
                </View>
              </View>

            </View>
          </Animated.View>

          {/* ── Social Pulse ───────────────────────────────────────── */}
          {socialMessages.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/friends')} activeOpacity={0.75}>
              <SocialPulse messages={socialMessages} liveFriends={liveFriends} />
            </TouchableOpacity>
          )}

          {/* ── Quick Start ────────────────────────────────────────── */}
          <Animated.View style={[styles.startShadowWrap, showPanel && styles.startShadowWrapMuted, { transform: [{ scale: pulseAnim }] }]}>
            <ScalePressable onPress={handleQuickStart} scaleTo={0.97} style={styles.startBtnTouchable}>
              <View style={styles.startBtnGradient}>
                <Ionicons name="play-circle-outline" size={24} color="#fff" />
                <Text style={styles.startBtnText}>Start Studying</Text>
              </View>
            </ScalePressable>
          </Animated.View>

          {/* Setup hint + options toggle */}
          <TouchableOpacity style={styles.setupRow} onPress={showPanel ? closePanel : openPanel} activeOpacity={0.65}>
            <Text style={styles.setupHint}>{setupLabel}</Text>
            <View style={styles.setupRight}>
              <Text style={styles.setupOptions}>{showPanel ? 'Close' : 'Options'}</Text>
              <Ionicons name={showPanel ? 'close' : 'chevron-down'} size={12} color={C.text3} />
            </View>
          </TouchableOpacity>

          {/* ── Options Panel ─────────────────────────────────────── */}
          {showPanel && (
            <Animated.View style={[styles.panel, { opacity: panelOpacity, transform: [{ translateY: panelSlide }] }]}>

              <View style={styles.modeRow}>
                {(['stopwatch', 'timer'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modeBtn, startMode === m && styles.modeBtnActive]}
                    onPress={() => handleSelectMode(m)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={m === 'stopwatch' ? 'stopwatch-outline' : 'timer-outline'} size={14} color={startMode === m ? '#fff' : C.text3} />
                    <Text style={[styles.modeBtnText, startMode === m && styles.modeBtnTextActive]}>
                      {m === 'stopwatch' ? 'Stopwatch' : 'Timer'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View>
                <Text style={styles.panelLabel}>Task</Text>
                {tasks.length === 0 ? (
                  <TouchableOpacity onPress={() => router.push('/(tabs)/subjects')} activeOpacity={0.75}>
                    <Text style={styles.noTasksLink}>No tasks yet — create one →</Text>
                  </TouchableOpacity>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillScroll}>
                    {tasks.map((task) => {
                      const selected = task.id === startTaskId;
                      return (
                        <TouchableOpacity
                          key={task.id}
                          style={[styles.pill, selected && { borderColor: task.color, backgroundColor: task.color + '1a' }]}
                          onPress={() => handleSelectTask(task.id)}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.pillDot, { backgroundColor: task.color }]} />
                          <Text style={[styles.pillText, selected && { color: C.text1 }]}>{task.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <Animated.View style={[styles.focusRow, { backgroundColor: focusRowBg }]}>
                <View style={styles.focusLeft}>
                  <View style={styles.moonIconWrap}>
                    <Animated.View style={[StyleSheet.absoluteFill, { opacity: moonDimOpacity }]}>
                      <Ionicons name="moon-outline" size={16} color={C.text3} />
                    </Animated.View>
                    <Animated.View style={[StyleSheet.absoluteFill, { opacity: moonLitOpacity }]}>
                      <Ionicons name="moon" size={16} color={C.accent} />
                    </Animated.View>
                  </View>
                  <View>
                    <Text style={styles.focusLabel}>Focus Mode</Text>
                    <Text style={styles.focusSub}>Minimize distractions</Text>
                  </View>
                </View>
                <Toggle value={focusMode} onChange={handleToggleFocusMode} />
              </Animated.View>

              <View style={styles.panelDivider} />

              <ScalePressable onPress={handleGo} style={styles.goBtn} scaleTo={0.97}>
                <Text style={styles.goBtnText}>Go</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </ScalePressable>

            </Animated.View>
          )}

          {/* ── Momentum ──────────────────────────────────────────── */}
          {momentumLabel && (
            <View style={styles.momentumSection}>
              <View style={styles.momentumHeader}>
                <Text style={styles.sectionTitle}>{momentumLabel}</Text>
                {todaySessions.length > 0 && todayTotal > 0 && (
                  <Text style={styles.momentumTotal}>{formatDuration(todayTotal)}</Text>
                )}
              </View>
              {displaySessions.map((s) => {
                const subj = lookupTask(tasks, s.subjectId);
                return (
                  <View key={s.id} style={styles.sessionRow}>
                    <View style={[styles.sessionBar, { backgroundColor: subj.color }]} />
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionSubject}>{subj.label}</Text>
                      {s.note ? <Text style={styles.sessionNote} numberOfLines={1}>{s.note}</Text> : null}
                    </View>
                    <View style={styles.sessionRight}>
                      <Text style={styles.sessionDuration}>{formatDuration(s.secs)}</Text>
                      <Text style={styles.sessionDate}>{formatDate(s.ts)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 52 },

  dateText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 11,
    color: C.text3,
    letterSpacing: 0.6,
    marginBottom: 16,
    textTransform: 'uppercase',
  },

  // ── Hero ──────────────────────────────────────────────────────────────────

  heroShadowWrap: {
    borderRadius: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  heroCard: {
    borderRadius: 16,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 18,
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },

  // Ring
  ringCenter: { alignItems: 'center' },
  ringPctNum: {
    fontFamily: 'Nunito-Black',
    fontSize: 38,
    lineHeight: 42,
    color: C.text1,
    includeFontPadding: false,
  },
  ringPctSymbol: {
    fontFamily: 'Nunito-Black',
    fontSize: 20,
    color: C.text2,
  },
  ringGoalLabel: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 11,
    color: C.text3,
    letterSpacing: 0.4,
    marginTop: 2,
  },

  // Message
  heroMsgWrap: { alignItems: 'center', gap: 2 },
  heroHeadline: {
    fontFamily: 'Nunito-Black',
    fontSize: 18,
    color: C.text1,
    textAlign: 'center',
    lineHeight: 22,
  },
  heroSub: {
    fontFamily: 'Nunito-Black',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: C.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 12,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: C.border,
  },
  statValue: {
    fontFamily: 'DMMono-Medium',
    fontSize: 14,
    color: C.text1,
  },
  statLabel: {
    fontFamily: 'Nunito-Regular',
    fontSize: 10,
    color: C.text3,
    letterSpacing: 0.3,
  },
  statStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  // ── Social pulse ──────────────────────────────────────────────────────────

  socialPulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  socialAvatars: { flexDirection: 'row', alignItems: 'center' },
  socialAvatarWrap: { position: 'relative' },
  socialAvatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialAvatarText: { fontFamily: 'Nunito-Bold', fontSize: 9.5 },
  socialLiveDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent2,
    borderWidth: 1.5,
    borderColor: C.surface1,
  },
  socialMessage: {
    flex: 1,
    fontFamily: 'Nunito-SemiBold',
    fontSize: 13,
    color: C.text2,
  },

  // ── Quick start ───────────────────────────────────────────────────────────

  startShadowWrap: {
    borderRadius: 12,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  startShadowWrapMuted: { shadowOpacity: 0, elevation: 0 },
  startBtnTouchable: { borderRadius: 12, overflow: 'hidden' },
  startBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    backgroundColor: C.accent,
  },
  startBtnText: { fontFamily: 'Nunito-Bold', fontSize: 16, color: '#fff' },

  setupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 10,
    marginBottom: 12,
  },
  setupHint: { fontFamily: 'Nunito-Regular', fontSize: 12, color: C.text3 },
  setupRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  setupOptions: { fontFamily: 'Nunito-SemiBold', fontSize: 12, color: C.text3 },

  // ── Options panel ─────────────────────────────────────────────────────────

  panel: {
    backgroundColor: C.surface1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 38,
    borderRadius: 8,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  modeBtnText: { fontFamily: 'Nunito-SemiBold', fontSize: 13, color: C.text3 },
  modeBtnTextActive: { color: '#fff' },
  panelLabel: {
    fontFamily: 'Nunito-Bold',
    fontSize: 11,
    color: C.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  pillScroll: { gap: 7 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  pillDot: { width: 7, height: 7, borderRadius: 3.5 },
  pillText: { fontFamily: 'Nunito-SemiBold', fontSize: 12, color: C.text3 },
  noTasksLink: { fontFamily: 'Nunito-SemiBold', fontSize: 13, color: C.accent },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    overflow: 'hidden',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  focusLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moonIconWrap: { width: 16, height: 16 },
  focusLabel: { fontFamily: 'Nunito-SemiBold', fontSize: 13, color: C.text2 },
  focusSub: { fontFamily: 'Nunito-Regular', fontSize: 11, color: C.text3, marginTop: 1 },
  toggleTrack: { width: 42, height: 24, borderRadius: 12, justifyContent: 'center' },
  toggleThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    top: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  panelDivider: { height: 1, backgroundColor: C.border, marginHorizontal: -16 },
  goBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: C.accent,
    borderRadius: 8,
    height: 44,
  },
  goBtnText: { fontFamily: 'Nunito-Bold', fontSize: 15, color: '#fff' },

  // ── Momentum ──────────────────────────────────────────────────────────────

  momentumSection: { marginTop: 4 },
  momentumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'Nunito-Bold',
    fontSize: 12,
    color: C.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  momentumTotal: { fontFamily: 'DMMono-Medium', fontSize: 12, color: C.accent },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    marginBottom: 7,
    overflow: 'hidden',
  },
  sessionBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginRight: 12 },
  sessionInfo: { flex: 1 },
  sessionSubject: { fontFamily: 'Nunito-SemiBold', fontSize: 13, color: C.text1 },
  sessionNote: { fontFamily: 'Nunito-Regular', fontSize: 11, color: C.text3, marginTop: 1 },
  sessionRight: { alignItems: 'flex-end' },
  sessionDuration: { fontFamily: 'DMMono-Medium', fontSize: 13, color: C.accent },
  sessionDate: { fontFamily: 'Nunito-Regular', fontSize: 10, color: C.text3, marginTop: 2 },
});
