import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../constants/colors';
import { useFadeIn } from '../../utils/useFadeIn';
import { supabase } from '../../utils/supabase';
import {
  getLeaderboard,
  getPendingRequests,
  searchUsers,
  sendFriendRequest,
  respondToRequest,
  getMyProfile,
  getMySchool,
  joinSchool,
  leaveSchool,
  searchSchools,
  getSchoolLeaderboard,
  checkAndAutoJoinSchool,
  sendSchoolVerificationOtp,
  verifySchoolOtpAndJoin,
  type LeaderboardEntry,
  type PendingRequest,
  type SearchResult,
  type School,
} from '../../store/social';

const GOLD = '#d4b840';

const AVATAR_COLORS = [
  '#7c6ff7', '#6cb4f7', '#5ee8b0', '#f7a76c',
  '#f7d96c', '#f76cbf', '#f76c6c', '#5ee8e8',
];

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Friend = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  weeklyMins: number;
  isLive: boolean;
  isMe?: boolean;
};

function entryToFriend(e: LeaderboardEntry): Friend {
  return {
    id: e.user_id,
    name: e.display_name ?? 'Unknown',
    initials: getInitials(e.display_name ?? '?'),
    avatarColor: e.is_me ? C.accent : getAvatarColor(e.user_id),
    weeklyMins: Math.round(e.weekly_secs / 60),
    isLive: e.is_studying,
    isMe: e.is_me,
  };
}

// ─── LiveDot ──────────────────────────────────────────────────────────────────

function LiveDot({ color = C.red }: { color?: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[styles.liveDot, { backgroundColor: color, opacity }]} />;
}

// ─── StudyingTogetherBanner ───────────────────────────────────────────────────

function StudyingTogetherBanner({ liveFriends }: { liveFriends: Friend[] }) {
  const mountAnim = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(mountAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 1, duration: 2800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(breatheAnim, { toValue: 0, duration: 2800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const count = liveFriends.length;
  const nameText = count === 2
    ? `${liveFriends[0].name} & ${liveFriends[1].name}`
    : `${liveFriends[0].name} + ${count - 1} others`;

  const bgOpacity = breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [0.03, 0.08] });
  const scale = mountAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  return (
    <Animated.View style={[styles.togetherCard, { opacity: mountAnim, transform: [{ scale }] }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.togetherCardBg, { opacity: bgOpacity }]} pointerEvents="none" />
      <View style={styles.togetherAvatarStack}>
        {liveFriends.slice(0, 3).map((f, i) => (
          <View
            key={f.id}
            style={[styles.togetherAvatar, { backgroundColor: f.avatarColor + '33', borderColor: C.bg, zIndex: 3 - i, marginLeft: i === 0 ? 0 : -10 }]}
          >
            <Text style={[styles.togetherInitials, { color: f.avatarColor }]}>{f.initials}</Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.togetherName}>{nameText}</Text>
        <Text style={styles.togetherSub}>studying together right now</Text>
      </View>
      <View style={styles.togetherLive}>
        <LiveDot color={C.accent2} />
        <Text style={styles.togetherLiveText}>LIVE</Text>
      </View>
    </Animated.View>
  );
}

// ─── FriendRow ────────────────────────────────────────────────────────────────

function FriendRow({ f, rank, maxMins, gapToNext }: {
  f: Friend;
  rank: number;
  maxMins: number;
  gapToNext: number | null;
}) {
  const isFirst = rank === 1;
  const mountAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.2)).current;
  const goldBreath = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  const pct = maxMins > 0 ? f.weeklyMins / maxMins : 0;
  const showGap = gapToNext !== null && gapToNext > 0 && gapToNext <= (f.isMe ? 180 : 60);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(rank * 55),
      Animated.parallel([
        Animated.spring(mountAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 12 }),
        Animated.timing(barAnim, { toValue: pct, duration: 700, delay: rank * 55 + 300, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      ]),
    ]).start();

    if (f.isLive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.9, duration: 1100, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.2, duration: 1100, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, []);

  useEffect(() => {
    if (!isFirst) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(goldBreath, { toValue: 1, duration: 3200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(goldBreath, { toValue: 0, duration: 3200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isFirst]);

  const translateY = mountAnim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });
  const goldOverlayOpacity = goldBreath.interpolate({ inputRange: [0, 1], outputRange: [0.0, 0.07] });
  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  function rankLabel(r: number): string {
    if (r === 1) return '1';
    if (r === 2) return '2';
    if (r === 3) return '3';
    return `${r}`;
  }

  return (
    <Animated.View style={[
      styles.row,
      f.isMe && styles.rowMe,
      isFirst && styles.rowFirst,
      { opacity: mountAnim, transform: [{ translateY }] },
    ]}>
      {isFirst && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.goldOverlay, { opacity: goldOverlayOpacity }]} pointerEvents="none" />
      )}

      <View style={styles.rankCol}>
        <Text style={[styles.rank, isFirst && styles.rankFirst]}>#{rankLabel(rank)}</Text>
      </View>

      <View style={styles.avatarWrap}>
        {f.isLive && (
          <Animated.View style={[styles.avatarGlow, { borderColor: f.avatarColor, opacity: glowAnim }]} />
        )}
        <View style={[styles.avatar, { backgroundColor: f.avatarColor + '33' }]}>
          <Text style={[styles.initials, { color: f.avatarColor }]}>{f.initials}</Text>
        </View>
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, f.isMe && styles.nameMe]}>{f.name}</Text>
          {isFirst && !f.isMe && (
            <View style={styles.leaderBadge}>
              <Text style={styles.leaderText}>LEADER</Text>
            </View>
          )}
          {f.isLive && (
            <View style={styles.liveChip}>
              <LiveDot />
              <Text style={styles.liveText}>Studying now</Text>
            </View>
          )}
        </View>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: barWidth, backgroundColor: f.isMe ? C.accent : f.avatarColor }]} />
        </View>

        <View style={styles.metaRow}>
          {showGap && (
            <Text style={[styles.gapText, f.isMe && styles.gapTextMe]}>
              {formatMins(gapToNext!)} to catch up
            </Text>
          )}
        </View>
      </View>

      <Text style={[styles.duration, f.isMe && styles.durationMe]}>
        {formatMins(f.weeklyMins)}
      </Text>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const fadeAnim = useFadeIn();

  const [activeTab, setActiveTab] = useState<'friends' | 'school'>('friends');

  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [profile, setProfile] = useState<{ display_name: string; username: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  const [mySchool, setMySchool] = useState<School | null>(null);
  const [schoolFriends, setSchoolFriends] = useState<Friend[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolResults, setSchoolResults] = useState<School[]>([]);
  const [schoolSearchLoading, setSchoolSearchLoading] = useState(false);
  const [joiningSchool, setJoiningSchool] = useState<string | null>(null);

  type VerifyStep =
    | null
    | { step: 'email'; school: School }
    | { step: 'otp'; school: School; schoolEmail: string };
  const [verifyFlow, setVerifyFlow] = useState<VerifyStep>(null);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');


  async function loadLeaderboard() {
    const lb = await getLeaderboard();
    setFriends(lb.map(entryToFriend));
  }

  async function loadAll() {
    setLoading(true);
    const [lb, reqs, prof] = await Promise.all([
      getLeaderboard(),
      getPendingRequests(),
      getMyProfile(),
    ]);
    setFriends(lb.map(entryToFriend));
    setPending(reqs);
    setProfile(prof);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => {
    loadAll();
    loadSchool();
  }, []));

  async function loadSchool() {
    const school = await getMySchool();
    if (school) {
      setMySchool(school);
      loadSchoolLeaderboard();
      return;
    }
    const autoJoined = await checkAndAutoJoinSchool();
    if (autoJoined) {
      setMySchool(autoJoined);
      loadSchoolLeaderboard();
    }
  }

  async function loadSchoolLeaderboard() {
    setSchoolLoading(true);
    const lb = await getSchoolLeaderboard();
    setSchoolFriends(lb.map(entryToFriend));
    setSchoolLoading(false);
  }

  async function handleJoinSchool(school: School) {
    const { data: { session } } = await supabase.auth.getSession();
    const userDomain = session?.user?.email?.split('@')[1]?.toLowerCase() ?? '';

    if (school.domain && userDomain === school.domain.toLowerCase()) {
      setJoiningSchool(school.id);
      await joinSchool(school.id);
      setMySchool(school);
      setSchoolSearch('');
      setSchoolResults([]);
      setJoiningSchool(null);
      loadSchoolLeaderboard();
    } else {
      setVerifyFlow({ step: 'email', school });
      setVerifyEmail('');
      setVerifyCode('');
      setVerifyError('');
      setSchoolSearch('');
      setSchoolResults([]);
    }
  }

  async function handleSendCode() {
    if (verifyFlow?.step !== 'email') return;
    const email = verifyEmail.trim().toLowerCase();
    const domain = email.split('@')[1]?.toLowerCase() ?? '';

    if (!email.includes('@')) { setVerifyError('Enter a valid email address.'); return; }
    if (domain !== verifyFlow.school.domain.toLowerCase()) {
      setVerifyError(`Email must end in @${verifyFlow.school.domain}`);
      return;
    }

    setVerifyLoading(true);
    setVerifyError('');
    const result = await sendSchoolVerificationOtp(email);
    setVerifyLoading(false);

    if (!result.success) { setVerifyError(result.message); return; }
    setVerifyFlow({ step: 'otp', school: verifyFlow.school, schoolEmail: email });
  }

  async function handleVerifyCode() {
    if (verifyFlow?.step !== 'otp') return;
    setVerifyLoading(true);
    setVerifyError('');
    const result = await verifySchoolOtpAndJoin(verifyFlow.schoolEmail, verifyCode.trim(), verifyFlow.school.id);
    setVerifyLoading(false);

    if (!result.success) { setVerifyError(result.message); return; }
    setMySchool(verifyFlow.school);
    setVerifyFlow(null);
    setVerifyEmail('');
    setVerifyCode('');
    loadSchoolLeaderboard();
  }


  async function handleLeaveSchool() {
    Alert.alert('Leave School', `Leave ${mySchool?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await leaveSchool();
          setMySchool(null);
          setSchoolFriends([]);
        },
      },
    ]);
  }

  // Real-time: re-fetch leaderboard whenever anyone's presence changes.
  // This is what makes the live dots update instantly without refreshing.
  useEffect(() => {
    const channel = supabase
      .channel('presence-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'presence' },
        () => { loadLeaderboard(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Debounced user search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const results = await searchUsers(searchQuery);
      setSearchResults(results);
      setSearchLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Debounced school search
  useEffect(() => {
    if (!schoolSearch.trim()) { setSchoolResults([]); return; }
    const timer = setTimeout(async () => {
      setSchoolSearchLoading(true);
      const results = await searchSchools(schoolSearch);
      setSchoolResults(results);
      setSchoolSearchLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [schoolSearch]);

  async function handleSendRequest(userId: string) {
    setSendingTo(userId);
    const result = await sendFriendRequest(userId);
    setSendingTo(null);
    if (result.success) {
      setSentTo((prev) => new Set(prev).add(userId));
    } else {
      Alert.alert('Could not send request', result.message);
    }
  }

  async function handleRespond(id: string, accept: boolean) {
    await respondToRequest(id, accept);
    loadAll();
  }


  const sorted = [...friends].sort((a, b) => b.weeklyMins - a.weeklyMins);
  const maxMins = sorted[0]?.weeklyMins ?? 1;
  const liveFriends = friends.filter((f) => f.isLive && !f.isMe);

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Friends</Text>

          {/* ── Tab switcher ── */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
              onPress={() => setActiveTab('friends')}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
                Friends
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'school' && styles.tabActive]}
              onPress={() => setActiveTab('school')}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, activeTab === 'school' && styles.tabTextActive]}>
                School
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'friends' ? (
            <>
              {/* ── Pending requests ── */}
              {pending.length > 0 && (
                <View style={styles.pendingCard}>
                  <Text style={styles.pendingTitle}>Friend Requests</Text>
                  {pending.map((req) => (
                    <View key={req.id} style={styles.pendingRow}>
                      <View style={styles.pendingAvatar}>
                        <Text style={styles.pendingInitials}>
                          {getInitials(req.display_name)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pendingName}>{req.display_name}</Text>
                        {req.username && (
                          <Text style={styles.pendingUsername}>@{req.username}</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => handleRespond(req.id, true)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.acceptBtnText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => handleRespond(req.id, false)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="close" size={16} color={C.text3} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* ── Studying together banner ── */}
              {liveFriends.length >= 2 && (
                <StudyingTogetherBanner liveFriends={liveFriends} />
              )}

              {/* ── Friends leaderboard ── */}
              {loading ? (
                <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
              ) : sorted.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No one here yet</Text>
                  <Text style={styles.emptySub}>Add friends below to see how you compare.</Text>
                </View>
              ) : (
                sorted.map((f, i) => (
                  <FriendRow
                    key={f.id}
                    f={f}
                    rank={i + 1}
                    maxMins={maxMins}
                    gapToNext={i > 0 ? sorted[i - 1].weeklyMins - f.weeklyMins : null}
                  />
                ))
              )}

              {/* ── Add Friend ── */}
              <View style={styles.addCard}>
                <Text style={styles.addTitle}>Add a Friend</Text>
                {(profile?.username || profile?.display_name) && (
                  <Text style={styles.addYourUsername}>
                    Your username: <Text style={{ color: C.accent }}>@{profile.username || profile.display_name}</Text>
                  </Text>
                )}
                <View style={styles.addRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Search by username or name"
                    placeholderTextColor={C.text3}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searchLoading && (
                    <ActivityIndicator color={C.accent} style={{ marginLeft: 8 }} />
                  )}
                </View>
                {searchResults.length > 0 && (
                  <View style={styles.searchResults}>
                    {searchResults.map((r) => {
                      const alreadySent = sentTo.has(r.id);
                      const isSending = sendingTo === r.id;
                      return (
                        <View key={r.id} style={styles.searchRow}>
                          <View style={[styles.searchAvatar, { backgroundColor: getAvatarColor(r.id) + '33' }]}>
                            <Text style={[styles.searchInitials, { color: getAvatarColor(r.id) }]}>
                              {getInitials(r.display_name ?? '')}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.searchName}>{r.display_name}</Text>
                            {r.username && <Text style={styles.searchUsername}>@{r.username}</Text>}
                          </View>
                          <TouchableOpacity
                            style={[styles.addBtn, alreadySent && styles.addBtnSent]}
                            onPress={() => !alreadySent && handleSendRequest(r.id)}
                            disabled={alreadySent || isSending}
                            activeOpacity={0.8}
                          >
                            {isSending
                              ? <ActivityIndicator color="#fff" size="small" />
                              : <Text style={styles.addBtnText}>{alreadySent ? 'Sent' : 'Add'}</Text>
                            }
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
                {searchQuery.length > 1 && !searchLoading && searchResults.length === 0 && (
                  <Text style={styles.noResults}>No users found for "{searchQuery}"</Text>
                )}
              </View>
            </>
          ) : (
            <>
              {/* ── School tab ── */}
              {mySchool ? (
                <>
                  {/* School header */}
                  <View style={styles.schoolHeader}>
                    <View style={styles.schoolInfo}>
                      <Ionicons name="school-outline" size={16} color={C.accent2} />
                      <Text style={styles.schoolName}>{mySchool.name}</Text>
                    </View>
                    <TouchableOpacity onPress={handleLeaveSchool} activeOpacity={0.75}>
                      <Text style={styles.leaveText}>Leave</Text>
                    </TouchableOpacity>
                  </View>

                  {/* School leaderboard */}
                  {schoolLoading ? (
                    <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
                  ) : schoolFriends.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyTitle}>Just you so far</Text>
                      <Text style={styles.emptySub}>Share the app with classmates to build the leaderboard.</Text>
                    </View>
                  ) : (
                    schoolFriends.map((f, i) => (
                      <FriendRow
                        key={f.id}
                        f={f}
                        rank={i + 1}
                        maxMins={schoolFriends[0]?.weeklyMins ?? 1}
                        gapToNext={i > 0 ? schoolFriends[i - 1].weeklyMins - f.weeklyMins : null}
                      />
                    ))
                  )}
                </>
              ) : (
                <View style={styles.addCard}>
                  {verifyFlow === null ? (
                    // ── Search ──────────────────────────────────────────────
                    <>
                      <Text style={styles.addTitle}>Join Your School</Text>
                      <Text style={styles.addYourUsername}>
                        Compete on a leaderboard with everyone at your university.
                      </Text>
                      <View style={styles.addRow}>
                        <TextInput
                          style={styles.input}
                          placeholder="Search for your school..."
                          placeholderTextColor={C.text3}
                          value={schoolSearch}
                          onChangeText={setSchoolSearch}
                          autoCapitalize="words"
                        />
                        {schoolSearchLoading && (
                          <ActivityIndicator color={C.accent} style={{ marginLeft: 8 }} />
                        )}
                      </View>
                      {schoolResults.length > 0 && (
                        <View style={styles.searchResults}>
                          {schoolResults.map((s) => (
                            <View key={s.id} style={styles.searchRow}>
                              <Ionicons name="school-outline" size={18} color={C.accent2} style={{ marginRight: 2 }} />
                              <Text style={[styles.searchName, { flex: 1 }]}>{s.name}</Text>
                              <TouchableOpacity
                                style={[styles.addBtn, joiningSchool === s.id && styles.addBtnSent]}
                                onPress={() => handleJoinSchool(s)}
                                disabled={joiningSchool !== null}
                                activeOpacity={0.8}
                              >
                                {joiningSchool === s.id
                                  ? <ActivityIndicator color="#fff" size="small" />
                                  : <Text style={styles.addBtnText}>Join</Text>
                                }
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}
                      {schoolSearch.length > 1 && !schoolSearchLoading && schoolResults.length === 0 && (
                        <View style={styles.noSchoolWrap}>
                          <Text style={styles.noResults}>No schools found for "{schoolSearch}"</Text>
                          <Text style={styles.noSchoolSub}>
                            Don't see your school? We're adding more — check back soon.
                          </Text>
                        </View>
                      )}
                    </>
                  ) : verifyFlow.step === 'email' ? (
                    // ── Enter school email ───────────────────────────────────
                    <>
                      <TouchableOpacity onPress={() => setVerifyFlow(null)} style={styles.verifyBack}>
                        <Ionicons name="arrow-back" size={15} color={C.text3} />
                        <Text style={styles.verifyBackText}>Back</Text>
                      </TouchableOpacity>
                      <Text style={styles.addTitle}>Verify School Email</Text>
                      <Text style={styles.addYourUsername}>
                        Enter your {verifyFlow.school.name} email to confirm enrollment.
                      </Text>
                      <TextInput
                        style={styles.input}
                        placeholder={`you@${verifyFlow.school.domain}`}
                        placeholderTextColor={C.text3}
                        value={verifyEmail}
                        onChangeText={setVerifyEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoCorrect={false}
                        autoFocus
                      />
                      {verifyError ? <Text style={styles.verifyErrorText}>{verifyError}</Text> : null}
                      <TouchableOpacity
                        style={[styles.addBtn, styles.verifyBtn, verifyLoading && styles.addBtnSent]}
                        onPress={handleSendCode}
                        disabled={verifyLoading}
                        activeOpacity={0.8}
                      >
                        {verifyLoading
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.addBtnText}>Send Code</Text>
                        }
                      </TouchableOpacity>
                    </>
                  ) : (
                    // ── Enter OTP ────────────────────────────────────────────
                    <>
                      <TouchableOpacity
                        onPress={() => setVerifyFlow({ step: 'email', school: verifyFlow.school })}
                        style={styles.verifyBack}
                      >
                        <Ionicons name="arrow-back" size={15} color={C.text3} />
                        <Text style={styles.verifyBackText}>Back</Text>
                      </TouchableOpacity>
                      <Text style={styles.addTitle}>Enter the Code</Text>
                      <Text style={styles.addYourUsername}>
                        We sent a 6-digit code to {verifyFlow.schoolEmail}.
                      </Text>
                      <TextInput
                        style={[styles.input, styles.otpInput]}
                        placeholder="000000"
                        placeholderTextColor={C.text3}
                        value={verifyCode}
                        onChangeText={(t) => setVerifyCode(t.replace(/\D/g, '').slice(0, 6))}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus
                      />
                      {verifyError ? <Text style={styles.verifyErrorText}>{verifyError}</Text> : null}
                      <TouchableOpacity
                        style={[styles.addBtn, styles.verifyBtn, (verifyLoading || verifyCode.length < 6) && styles.addBtnSent]}
                        onPress={handleVerifyCode}
                        disabled={verifyLoading || verifyCode.length < 6}
                        activeOpacity={0.8}
                      >
                        {verifyLoading
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.addBtnText}>Verify & Join</Text>
                        }
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ alignSelf: 'center', paddingVertical: 4 }}
                        onPress={async () => {
                          if (verifyFlow?.step !== 'otp') return;
                          setVerifyLoading(true);
                          setVerifyError('');
                          const r = await sendSchoolVerificationOtp(verifyFlow.schoolEmail);
                          setVerifyLoading(false);
                          if (!r.success) setVerifyError(r.message);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.verifyBackText}>Resend code</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </>
          )}

        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },

  title: {
    fontFamily: 'Nunito-Black',
    fontSize: 32,
    color: C.text1,
    marginBottom: 14,
  },

  // Tab switcher
  tabRow: {
    flexDirection: 'row',
    backgroundColor: C.surface2,
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: C.surface3 },
  tabText: { fontFamily: 'Nunito-SemiBold', fontSize: 14, color: C.text3 },
  tabTextActive: { color: C.text1 },

  // School
  schoolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  schoolInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  schoolName: {
    fontFamily: 'Nunito-Bold',
    fontSize: 15,
    color: C.text1,
  },
  leaveText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 13,
    color: C.text3,
  },
  createSchoolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  createSchoolText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
    color: C.accent,
  },

  // Pending requests
  pendingCard: {
    backgroundColor: C.surface1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pendingTitle: {
    fontFamily: 'Nunito-Bold',
    fontSize: 14,
    color: C.text1,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pendingAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingInitials: {
    fontFamily: 'Nunito-Bold',
    fontSize: 12,
    color: C.text2,
  },
  pendingName: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
    color: C.text1,
  },
  pendingUsername: {
    fontFamily: 'Nunito-Regular',
    fontSize: 11,
    color: C.text3,
  },
  acceptBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  acceptBtnText: {
    fontFamily: 'Nunito-Bold',
    fontSize: 13,
    color: '#fff',
  },
  declineBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Studying together
  togetherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(94,232,176,0.18)',
    overflow: 'hidden',
  },
  togetherCardBg: { borderRadius: 16, backgroundColor: C.accent2 },
  togetherAvatarStack: { flexDirection: 'row', alignItems: 'center' },
  togetherAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  togetherInitials: { fontFamily: 'Nunito-Bold', fontSize: 11 },
  togetherName: { fontFamily: 'Nunito-Bold', fontSize: 13, color: C.text1, marginBottom: 1 },
  togetherSub: { fontFamily: 'Nunito-Regular', fontSize: 11, color: C.text3 },
  togetherLive: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  togetherLiveText: {
    fontFamily: 'Nunito-Bold',
    fontSize: 9,
    color: C.accent2,
    letterSpacing: 0.8,
  },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontFamily: 'Nunito-Bold', fontSize: 16, color: C.text2, marginBottom: 6 },
  emptySub: { fontFamily: 'Nunito-Regular', fontSize: 13, color: C.text3, textAlign: 'center' },

  // Leaderboard rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 10,
    overflow: 'hidden',
  },
  rowMe: {
    backgroundColor: '#151525',
    borderColor: 'rgba(124,111,247,0.28)',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  rowFirst: {
    borderColor: 'rgba(212,184,64,0.30)',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  goldOverlay: { borderRadius: 16, backgroundColor: GOLD },
  rankCol: { width: 34, alignItems: 'center' },
  rank: { fontFamily: 'Nunito-Bold', fontSize: 15, color: C.text2, textAlign: 'center' },
  rankFirst: { fontSize: 18, color: GOLD },
  avatarWrap: { width: 44, height: 44 },
  avatarGlow: {
    position: 'absolute',
    top: -3, left: -3, right: -3, bottom: -3,
    borderRadius: 25,
    borderWidth: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontFamily: 'Nunito-Bold', fontSize: 14 },
  info: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  name: { fontFamily: 'Nunito-Bold', fontSize: 15, color: C.text1 },
  nameMe: { color: C.accent },
  leaderBadge: {
    backgroundColor: 'rgba(212,184,64,0.12)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(212,184,64,0.28)',
  },
  leaderText: { fontFamily: 'Nunito-Bold', fontSize: 8, color: GOLD, letterSpacing: 0.8 },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.red + '22',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontFamily: 'Nunito-SemiBold', fontSize: 10, color: C.red },
  progressTrack: {
    height: 4,
    backgroundColor: C.surface3,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: { height: '100%', borderRadius: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gapText: { fontFamily: 'Nunito-SemiBold', fontSize: 10, color: C.text3 },
  gapTextMe: { color: C.accent },
  duration: { fontFamily: 'DMMono-Medium', fontSize: 13, color: C.text2 },
  durationMe: { color: C.accent },

  // Add friend
  addCard: {
    backgroundColor: C.surface1,
    borderRadius: 16,
    padding: 20,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 12,
  },
  addTitle: { fontFamily: 'Nunito-Bold', fontSize: 16, color: C.text1 },
  addYourUsername: { fontFamily: 'Nunito-Regular', fontSize: 12, color: C.text3 },
  addRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Nunito-Regular',
    fontSize: 14,
    color: C.text1,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchResults: {
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface2,
    borderRadius: 12,
    padding: 10,
  },
  searchAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInitials: { fontFamily: 'Nunito-Bold', fontSize: 12 },
  searchName: { fontFamily: 'Nunito-SemiBold', fontSize: 14, color: C.text1 },
  searchUsername: { fontFamily: 'Nunito-Regular', fontSize: 11, color: C.text3 },
  addBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 52,
    alignItems: 'center',
  },
  addBtnSent: { backgroundColor: C.surface3 },
  addBtnText: { fontFamily: 'Nunito-Bold', fontSize: 13, color: '#fff' },
  noResults: {
    fontFamily: 'Nunito-Regular',
    fontSize: 13,
    color: C.text3,
    textAlign: 'center',
    paddingVertical: 8,
  },

  verifyBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  verifyBackText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 13,
    color: C.text3,
  },
  verifyBtn: {
    alignSelf: 'stretch',
    height: 44,
    borderRadius: 11,
    justifyContent: 'center',
    minWidth: 0,
  },
  verifyErrorText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: C.red,
  },
  otpInput: {
    textAlign: 'center',
    fontFamily: 'DMMono-Medium',
    fontSize: 22,
    letterSpacing: 8,
  },
});
