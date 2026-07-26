import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Alert,
  Share,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, iconSizes, shadows, type } from '../../constants/theme';
import { supabase, generateId } from '../../utils/supabase';
import { formatStudyTime } from '../../utils/format';
import { AppScreen } from '../../components/AppScreen';
import { AppHeader } from '../../components/AppHeader';
import { IconButton } from '../../components/IconButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { Avatar } from '../../components/Avatar';
import { LeaderboardRow } from '../../components/LeaderboardRow';
import { ListDivider } from '../../components/ListDivider';
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
import {
  getMyGroups,
  getPendingGroupInvites,
  acceptInvite,
  declineInvite,
  joinByInviteCode,
  type GroupSummary,
  type GroupInvite,
} from '../../store/groups';

// Accent for the "invite" affordances (header icon, promo card, add-friend
// modal) — blue, pairing with the green used elsewhere on this screen for
// the same blue-to-green "premium" identity used on the Timer screen.
const INVITE_TINT = colors.focus;

// ─── Types ────────────────────────────────────────────────────────────────────

type Friend = {
  id: string;
  name: string;
  weeklyMins: number;
  isLive: boolean;
  isMe?: boolean;
};

function entryToFriend(e: LeaderboardEntry): Friend {
  return {
    id: e.user_id,
    name: e.display_name ?? 'Unknown',
    weeklyMins: Math.round(e.weekly_secs / 60),
    isLive: e.is_studying,
    isMe: e.is_me,
  };
}

// ─── LiveDot ──────────────────────────────────────────────────────────────────
// Small pulsing dot used only by the "Studying Together" banner's LIVE badge.
// (The leaderboard rows themselves get their live indicator from Avatar/
// LeaderboardRow now — this local component is banner-only.)

function LiveDot({ color = colors.destructive }: { color?: string }) {
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
          <View key={f.id} style={[styles.togetherAvatarRing, { zIndex: 3 - i, marginLeft: i === 0 ? 0 : -10 }]}>
            <Avatar name={f.name} userId={f.id} size={28} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.togetherName}>{nameText}</Text>
        <Text style={styles.togetherSub}>studying together right now</Text>
      </View>
      <View style={styles.togetherLive}>
        <LiveDot color={colors.accentSecondary} />
        <Text style={styles.togetherLiveText}>LIVE</Text>
      </View>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'friends' | 'school' | 'groups'>('friends');

  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [profile, setProfile] = useState<{ display_name: string; username: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAddFriend, setShowAddFriend] = useState(false);
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

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupInvites, setGroupInvites] = useState<GroupInvite[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);

  type VerifyStep =
    | null
    | { step: 'email'; school: School }
    | { step: 'otp'; school: School; schoolEmail: string };
  const [verifyFlow, setVerifyFlow] = useState<VerifyStep>(null);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');


  async function loadGroups() {
    const [g, inv] = await Promise.all([getMyGroups(), getPendingGroupInvites()]);
    setGroups(g);
    setGroupInvites(inv);
  }

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
    loadGroups();
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
  // Channel name is unique per mount to avoid colliding with a previous
  // instance's subscription of the same fixed topic name.
  useEffect(() => {
    const channel = supabase
      .channel(`presence-changes-${generateId()}`)
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
  const schoolMaxMins = schoolFriends[0]?.weeklyMins ?? 1;
  const addFriendNoResults = searchQuery.trim().length > 1 && !searchLoading && searchResults.length === 0;

  return (
    <AppScreen>
      <AppHeader
        variant="large"
        title="Friends"
        right={
          <View style={styles.headerActions}>
            <IconButton
              icon="person-add"
              onPress={() => setShowAddFriend(true)}
              size="sm"
              color={INVITE_TINT}
              filled
              accessibilityLabel="Add a friend"
            />
            <IconButton
              icon="people"
              onPress={() => setActiveTab('groups')}
              size="sm"
              color={colors.accentPrimary}
              filled
              accessibilityLabel="View groups"
            />
          </View>
        }
      />

      <View style={styles.segmentWrap}>
        <SegmentedControl
          options={[
            { value: 'friends', label: 'Friends' },
            { value: 'school', label: 'School' },
            { value: 'groups', label: 'Groups' },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </View>

      {activeTab === 'friends' ? (
        <>
          {/* ── Pending requests ── */}
          {pending.length > 0 && (
            <View style={styles.pendingCard}>
              <Text style={styles.cardTitle}>Friend Requests</Text>
              {pending.map((req) => (
                <View key={req.id} style={styles.pendingRow}>
                  <Avatar name={req.display_name} userId={req.requester_id} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{req.display_name}</Text>
                    {req.username && <Text style={styles.rowMeta}>@{req.username}</Text>}
                  </View>
                  <PrimaryButton title="Accept" onPress={() => handleRespond(req.id, true)} compact />
                  <IconButton
                    icon="close"
                    onPress={() => handleRespond(req.id, false)}
                    size="sm"
                    color={colors.textMuted}
                    accessibilityLabel="Decline friend request"
                  />
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
            <LoadingState />
          ) : sorted.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No one here yet"
              subtitle="Tap the add-friend icon above to see how you compare."
            />
          ) : (
            <View style={styles.leaderboardSurface}>
              {sorted.map((f, i) => (
                <View key={f.id}>
                  {i > 0 && <ListDivider />}
                  <LeaderboardRow
                    userId={f.id}
                    name={f.name}
                    value={formatStudyTime(f.weeklyMins * 60)}
                    rank={i + 1}
                    isMe={f.isMe}
                    isLive={f.isLive}
                    progress={maxMins > 0 ? f.weeklyMins / maxMins : 0}
                  />
                </View>
              ))}
            </View>
          )}

          {/* ── Invite promo ── */}
          <View style={styles.invitePromo}>
            <View style={[styles.invitePromoIcon, { backgroundColor: INVITE_TINT + '22' }]}>
              <Ionicons name="people-circle" size={30} color={INVITE_TINT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.invitePromoTitle}>Study together. Grow together.</Text>
              <Text style={styles.invitePromoSub}>Invite friends to keep your streak going.</Text>
            </View>
            <PrimaryButton
              title="Invite"
              compact
              color={INVITE_TINT}
              onPress={() => Share.share({ message: 'Are you Lokt in? Download and find out.' })}
            />
          </View>
        </>
      ) : activeTab === 'school' ? (
        <>
          {/* ── School tab ── */}
          {mySchool ? (
            <>
              {/* School header */}
              <View style={styles.schoolHeader}>
                <View style={styles.schoolInfo}>
                  <Ionicons name="school-outline" size={iconSizes.sm} color={colors.accentSecondary} />
                  <Text style={styles.schoolName}>{mySchool.name}</Text>
                </View>
                <TouchableOpacity onPress={handleLeaveSchool} activeOpacity={0.75}>
                  <Text style={styles.leaveText}>Leave</Text>
                </TouchableOpacity>
              </View>

              {/* School leaderboard */}
              {schoolLoading ? (
                <LoadingState />
              ) : schoolFriends.length === 0 ? (
                <EmptyState
                  icon="school-outline"
                  title="Just you so far"
                  subtitle="Share the app with classmates to build the leaderboard."
                />
              ) : (
                <View style={styles.leaderboardSurface}>
                  {schoolFriends.map((f, i) => (
                    <View key={f.id}>
                      {i > 0 && <ListDivider />}
                      <LeaderboardRow
                        userId={f.id}
                        name={f.name}
                        value={formatStudyTime(f.weeklyMins * 60)}
                        rank={i + 1}
                        isMe={f.isMe}
                        isLive={f.isLive}
                        progress={schoolMaxMins > 0 ? f.weeklyMins / schoolMaxMins : 0}
                      />
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.addSection}>
              {verifyFlow === null ? (
                // ── Search ──────────────────────────────────────────────
                <>
                  <Text style={styles.cardTitle}>Join Your School</Text>
                  <Text style={styles.addHint}>
                    Compete on a leaderboard with everyone at your university.
                  </Text>
                  <View style={styles.searchRow}>
                    <TextInput
                      style={styles.input}
                      placeholder="Search for your school..."
                      placeholderTextColor={colors.textMuted}
                      value={schoolSearch}
                      onChangeText={setSchoolSearch}
                      autoCapitalize="words"
                    />
                    {schoolSearchLoading && (
                      <ActivityIndicator color={colors.accentPrimary} style={styles.inlineSpinner} />
                    )}
                  </View>
                  {schoolResults.length > 0 && (
                    <View style={styles.resultsList}>
                      {schoolResults.map((s) => (
                        <View key={s.id} style={styles.resultRow}>
                          <Ionicons name="school-outline" size={iconSizes.md} color={colors.accentSecondary} />
                          <Text style={[styles.rowName, { flex: 1 }]}>{s.name}</Text>
                          <PrimaryButton
                            title="Join"
                            onPress={() => handleJoinSchool(s)}
                            disabled={joiningSchool !== null}
                            loading={joiningSchool === s.id}
                            compact
                          />
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
                  <TouchableOpacity onPress={() => setVerifyFlow(null)} style={styles.verifyBack} activeOpacity={0.75}>
                    <Ionicons name="arrow-back" size={iconSizes.sm} color={colors.textMuted} />
                    <Text style={styles.verifyBackText}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.cardTitle}>Verify School Email</Text>
                  <Text style={styles.addHint}>
                    Enter your {verifyFlow.school.name} email to confirm enrollment.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={`you@${verifyFlow.school.domain}`}
                    placeholderTextColor={colors.textMuted}
                    value={verifyEmail}
                    onChangeText={setVerifyEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    autoFocus
                  />
                  {verifyError ? <Text style={styles.verifyErrorText}>{verifyError}</Text> : null}
                  <PrimaryButton
                    title="Send Code"
                    onPress={handleSendCode}
                    disabled={verifyLoading}
                    loading={verifyLoading}
                    style={styles.verifyBtn}
                  />
                </>
              ) : (
                // ── Enter OTP ────────────────────────────────────────────
                <>
                  <TouchableOpacity
                    onPress={() => setVerifyFlow({ step: 'email', school: verifyFlow.school })}
                    style={styles.verifyBack}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="arrow-back" size={iconSizes.sm} color={colors.textMuted} />
                    <Text style={styles.verifyBackText}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.cardTitle}>Enter the Code</Text>
                  <Text style={styles.addHint}>
                    We sent a 6-digit code to {verifyFlow.schoolEmail}.
                  </Text>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    placeholder="000000"
                    placeholderTextColor={colors.textMuted}
                    value={verifyCode}
                    onChangeText={(t) => setVerifyCode(t.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                  {verifyError ? <Text style={styles.verifyErrorText}>{verifyError}</Text> : null}
                  <PrimaryButton
                    title="Verify & Join"
                    onPress={handleVerifyCode}
                    disabled={verifyLoading || verifyCode.length < 6}
                    loading={verifyLoading}
                    style={styles.verifyBtn}
                  />
                  <TouchableOpacity
                    style={styles.resendBtn}
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
      ) : (
        <>
          {/* ── Pending group invites ── */}
          {groupInvites.length > 0 && (
            <View style={styles.pendingCard}>
              <Text style={styles.cardTitle}>Group Invites</Text>
              {groupInvites.map((inv) => (
                <View key={inv.group_id} style={styles.pendingRow}>
                  <View style={styles.inviteIcon}>
                    <Ionicons name="people" size={iconSizes.sm} color={colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{inv.group_name}</Text>
                    {inv.invited_by_name && (
                      <Text style={styles.rowMeta}>from {inv.invited_by_name}</Text>
                    )}
                  </View>
                  <PrimaryButton
                    title="Join"
                    onPress={async () => {
                      const r = await acceptInvite(inv.group_id);
                      if (r.success) loadGroups();
                      else Alert.alert('Error', r.message);
                    }}
                    compact
                  />
                  <IconButton
                    icon="close"
                    onPress={async () => {
                      const r = await declineInvite(inv.group_id);
                      if (r.success) loadGroups();
                      else Alert.alert('Error', r.message);
                    }}
                    size="sm"
                    color={colors.textMuted}
                    accessibilityLabel="Decline group invite"
                  />
                </View>
              ))}
            </View>
          )}

          {/* ── My groups list ── */}
          {groups.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={styles.groupRow}
              onPress={() => router.push(`/groups/${g.id}` as any)}
              activeOpacity={0.75}
            >
              <View style={styles.groupIcon}>
                <Ionicons name="people" size={iconSizes.md} color={colors.accentPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{g.name}</Text>
                {g.my_role === 'admin' && (
                  <Text style={styles.rowMeta}>Admin</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.textMuted} />
            </TouchableOpacity>
          ))}

          {groups.length === 0 && groupInvites.length === 0 && (
            <EmptyState
              icon="people-outline"
              title="No groups yet"
              subtitle="Create one or join with an invite code."
            />
          )}

          {/* ── Create / Join ── */}
          <View style={styles.addSection}>
            <TouchableOpacity
              style={styles.createGroupBtn}
              onPress={() => router.push('/groups/new' as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={iconSizes.md} color={colors.accentPrimary} />
              <Text style={styles.createGroupText}>Create a Group</Text>
            </TouchableOpacity>

            <Text style={styles.cardTitle}>Join with Code</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter invite code"
                placeholderTextColor={colors.textMuted}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <PrimaryButton
                title="Join"
                onPress={async () => {
                  if (!joinCode.trim() || joiningByCode) return;
                  setJoiningByCode(true);
                  const r = await joinByInviteCode(joinCode);
                  setJoiningByCode(false);
                  if (r.success && r.groupId) {
                    setJoinCode('');
                    loadGroups();
                    router.push(`/groups/${r.groupId}` as any);
                  } else {
                    Alert.alert('Could not join', r.message);
                  }
                }}
                disabled={!joinCode.trim() || joiningByCode}
                loading={joiningByCode}
                compact
                style={styles.joinCodeBtn}
              />
            </View>
          </View>
        </>
      )}

      <Modal
        visible={showAddFriend}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddFriend(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalKeyboardView}
        >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setShowAddFriend(false)}>
          <View style={[styles.modalCard, { paddingTop: insets.top + spacing.lg }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.cardTitle}>Add a Friend</Text>
              <IconButton
                icon="close"
                onPress={() => setShowAddFriend(false)}
                size="sm"
                color={colors.textMuted}
                accessibilityLabel="Close"
              />
            </View>
            {(profile?.username || profile?.display_name) && (
              <Text style={styles.addHint}>
                Your username: <Text style={{ color: INVITE_TINT }}>@{profile.username || profile.display_name}</Text>
              </Text>
            )}
            <View style={styles.searchRow}>
              <TextInput
                style={styles.input}
                placeholder="Search by username or name"
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchLoading && (
                <ActivityIndicator color={INVITE_TINT} style={styles.inlineSpinner} />
              )}
            </View>

            <TouchableOpacity
              style={[styles.inviteOption, addFriendNoResults && styles.inviteOptionHighlight]}
              onPress={() => Share.share({ message: 'Are you Lokt in? Download and find out.' })}
              activeOpacity={0.8}
            >
              <Ionicons
                name="share-social-outline"
                size={16}
                color={addFriendNoResults ? colors.textOnAccent : INVITE_TINT}
              />
              <Text style={[styles.inviteOptionText, addFriendNoResults && styles.inviteOptionTextHighlight]}>
                {addFriendNoResults
                  ? `Can't find "${searchQuery.trim()}"? Invite them to Lokt`
                  : "Invite a friend who isn't on Lokt yet"}
              </Text>
            </TouchableOpacity>

            <ScrollView style={styles.modalResults} contentContainerStyle={styles.modalResultsContent} keyboardShouldPersistTaps="handled">
              {searchResults.map((r) => {
                const alreadySent = sentTo.has(r.id);
                const isSending = sendingTo === r.id;
                return (
                  <View key={r.id} style={styles.resultRow}>
                    <Avatar name={r.display_name ?? ''} userId={r.id} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{r.display_name}</Text>
                      {r.username && <Text style={styles.rowMeta}>@{r.username}</Text>}
                    </View>
                    <PrimaryButton
                      title={alreadySent ? 'Sent' : 'Add'}
                      onPress={() => handleSendRequest(r.id)}
                      disabled={alreadySent || isSending}
                      loading={isSending}
                      color={alreadySent ? colors.surfaceActive : INVITE_TINT}
                      compact
                    />
                  </View>
                );
              })}
              {addFriendNoResults && (
                <Text style={styles.noResults}>No users found for "{searchQuery}"</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </AppScreen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  segmentWrap: { marginBottom: spacing.xl },

  invitePromo: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: INVITE_TINT + '12', borderRadius: radii.lg,
    borderWidth: 1, borderColor: INVITE_TINT + '33',
    padding: spacing.md, marginBottom: spacing.lg,
  },
  invitePromoIcon: {
    width: 44, height: 44, borderRadius: radii.full,
    alignItems: 'center', justifyContent: 'center',
  },
  invitePromoTitle: { fontWeight: '700', fontSize: 13, color: colors.textPrimary, marginBottom: 2 },
  invitePromoSub: { ...type.meta },

  cardTitle: { fontWeight: '600', fontSize: 16, color: colors.textPrimary, marginBottom: spacing.xs },
  addHint: { ...type.meta },

  // Pending requests / group invites
  pendingCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inviteIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { ...type.name },
  rowMeta: { ...type.meta, marginTop: 1 },

  // Studying together banner
  togetherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentPrimary + '28',
    overflow: 'hidden',
  },
  togetherCardBg: { borderRadius: radii.lg, backgroundColor: colors.accentSecondary },
  togetherAvatarStack: { flexDirection: 'row', alignItems: 'center' },
  togetherAvatarRing: {
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.surfaceRaised,
  },
  togetherName: { fontWeight: '600', fontSize: 13, color: colors.textPrimary, marginBottom: 1 },
  togetherSub: { ...type.meta },
  togetherLive: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  togetherLiveText: { fontWeight: '600', fontSize: 9, color: colors.accentSecondary, letterSpacing: 0.8 },
  liveDot: { width: 5, height: 5, borderRadius: 2.5 },

  // Leaderboard surface (friends + school)
  leaderboardSurface: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },

  // Add friend / join school / join group
  addSection: { gap: spacing.md, marginTop: spacing.xs },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontWeight: '400',
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  inlineSpinner: { marginLeft: spacing.sm },
  resultsList: { gap: spacing.sm },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  noResults: {
    ...type.meta,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  noSchoolWrap: { gap: spacing.xs },
  noSchoolSub: { ...type.meta, textAlign: 'center' },

  // School
  schoolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  schoolInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  schoolName: { ...type.name },
  leaveText: { fontWeight: '500', fontSize: 13, color: colors.textMuted },

  verifyBack: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  verifyBackText: { fontWeight: '500', fontSize: 13, color: colors.textMuted },
  verifyBtn: { alignSelf: 'stretch' },
  verifyErrorText: { fontWeight: '400', fontSize: 12, color: colors.destructive },
  resendBtn: { alignSelf: 'center', paddingVertical: spacing.xs },
  otpInput: {
    textAlign: 'center',
    fontFamily: 'DMMono-Medium',
    fontSize: 22,
    letterSpacing: 8,
  },

  // Groups tab
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  groupIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.accentPrimary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  createGroupText: { fontWeight: '600', fontSize: 15, color: colors.accentPrimary },
  joinCodeBtn: { minWidth: 64 },

  // Add Friend modal — anchored to the top of the screen so the keyboard
  // (which rises from the bottom) never covers it.
  modalKeyboardView: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-start' },
  modalCard: {
    backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg,
    padding: spacing.xl, gap: spacing.md, maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalResults: { maxHeight: 360 },
  modalResultsContent: { gap: spacing.sm },

  inviteOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radii.md, borderWidth: 1,
    borderColor: INVITE_TINT + '33', backgroundColor: INVITE_TINT + '12',
  },
  inviteOptionHighlight: {
    backgroundColor: INVITE_TINT, borderColor: INVITE_TINT,
    ...shadows.tinted(INVITE_TINT),
  },
  inviteOptionText: { fontWeight: '600', fontSize: 13, color: INVITE_TINT, flex: 1 },
  inviteOptionTextHighlight: { color: colors.textOnAccent },
});
