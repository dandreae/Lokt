import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, Alert, TextInput, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors, spacing, radii, componentHeights, type } from '../../constants/theme';
import { AppHeader } from '../../components/AppHeader';
import { IconButton } from '../../components/IconButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SecondaryButton } from '../../components/SecondaryButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { Avatar } from '../../components/Avatar';
import { LeaderboardRow } from '../../components/LeaderboardRow';
import { ListDivider } from '../../components/ListDivider';
import { formatStudyTime } from '../../utils/format';
import {
  getGroupDetail,
  getGroupLeaderboard,
  getGroupMembers,
  inviteMember,
  kickMember,
  leaveGroup,
  deleteGroup,
  regenerateInviteCode,
  type GroupDetail,
  type GroupLeaderboardEntry,
  type GroupMember,
} from '../../store/groups';
import { searchUsers, type SearchResult } from '../../store/social';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'all';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All Time' },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function GroupDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [leaderboard, setLeaderboard] = useState<GroupLeaderboardEntry[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [period, setPeriod] = useState<Period>('week');
  const [loading, setLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(false);

  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteResults, setInviteResults] = useState<SearchResult[]>([]);
  const [inviteSearchLoading, setInviteSearchLoading] = useState(false);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<Set<string>>(new Set());

  const [inviteCode, setInviteCode] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    const [det, lb] = await Promise.all([
      getGroupDetail(id),
      getGroupLeaderboard(id, 'week'),
    ]);
    setDetail(det);
    setLeaderboard(lb);
    if (det) {
      setInviteCode(det.invite_code);
      if (det.my_role === 'admin') {
        const m = await getGroupMembers(id);
        setMembers(m);
      }
    }
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, [id]));

  async function switchPeriod(p: Period) {
    if (p === period || !id) return;
    setPeriod(p);
    setLbLoading(true);
    const lb = await getGroupLeaderboard(id, p);
    setLeaderboard(lb);
    setLbLoading(false);
  }

  useEffect(() => {
    if (!inviteSearch.trim()) { setInviteResults([]); return; }
    const t = setTimeout(async () => {
      setInviteSearchLoading(true);
      const r = await searchUsers(inviteSearch);
      setInviteResults(r);
      setInviteSearchLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [inviteSearch]);

  async function handleInvite(userId: string) {
    if (!id) return;
    setSendingInvite(userId);
    const r = await inviteMember(id, userId);
    setSendingInvite(null);
    if (r.success) {
      setSentInvites((prev) => new Set(prev).add(userId));
    } else {
      Alert.alert('Could not invite', r.message);
    }
  }

  async function handleKick(member: GroupMember) {
    if (!id) return;
    Alert.alert('Remove Member', `Remove ${member.display_name} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setKicking(member.user_id);
          const r = await kickMember(id, member.user_id);
          setKicking(null);
          if (r.success) {
            setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
            setDetail((prev) => prev ? { ...prev, member_count: prev.member_count - 1 } : prev);
          } else {
            Alert.alert('Error', r.message);
          }
        },
      },
    ]);
  }

  async function handleRegenerateCode() {
    if (!id) return;
    Alert.alert('Regenerate Code', 'This will invalidate the current invite code.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        onPress: async () => {
          setRegenerating(true);
          const r = await regenerateInviteCode(id);
          setRegenerating(false);
          if (r.success && r.newCode) setInviteCode(r.newCode);
          else Alert.alert('Error', r.message);
        },
      },
    ]);
  }

  async function handleLeave() {
    if (!id) return;
    Alert.alert('Leave Group', 'Leave this group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const r = await leaveGroup(id);
          if (r.success) router.back();
          else Alert.alert('Error', r.message);
        },
      },
    ]);
  }

  async function handleDelete() {
    if (!id) return;
    Alert.alert('Delete Group', `Delete "${detail?.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const r = await deleteGroup(id);
          if (r.success) router.back();
          else Alert.alert('Error', r.message);
        },
      },
    ]);
  }

  function handleShareCode() {
    Share.share({ message: `Join my Lokt study group "${detail?.name}" — invite code: ${inviteCode}` });
  }

  const maxSecs = leaderboard[0]?.period_secs ?? 1;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <AppHeader variant="bar" title="Group" onBack={() => router.back()} />
        <LoadingState label="Loading group…" />
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <AppHeader variant="bar" title="Group" onBack={() => router.back()} />
        <EmptyState
          icon="people-outline"
          title="Group not found"
          subtitle="It may have been deleted or you are no longer a member."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AppHeader
        variant="bar"
        title={detail.name}
        subtitle={`${detail.member_count} member${detail.member_count !== 1 ? 's' : ''}`}
        onBack={() => router.back()}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* ── Period picker ── */}
        <SegmentedControl options={PERIOD_OPTIONS} value={period} onChange={switchPeriod} />

        {/* ── Leaderboard ── */}
        <View style={styles.leaderboardWrap}>
          {lbLoading ? (
            <LoadingState label="Loading leaderboard…" />
          ) : leaderboard.length === 0 ? (
            <EmptyState
              icon="trophy-outline"
              title="No sessions yet"
              subtitle="Start studying to appear on the leaderboard."
            />
          ) : (
            <View style={styles.card}>
              {leaderboard.map((entry, i) => (
                <View key={entry.user_id}>
                  <LeaderboardRow
                    userId={entry.user_id}
                    name={entry.display_name}
                    value={formatStudyTime(entry.period_secs)}
                    rank={i + 1}
                    isMe={entry.is_me}
                    isLive={entry.is_studying}
                    progress={maxSecs > 0 ? entry.period_secs / maxSecs : 0}
                  />
                  {i < leaderboard.length - 1 && <ListDivider />}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Admin panel ── */}
        {detail.my_role === 'admin' && (
          <>
            {/* Invite search */}
            <View style={styles.section}>
              <Text style={type.sectionTitle}>Invite Member</Text>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Search by username or name"
                  placeholderTextColor={colors.textMuted}
                  value={inviteSearch}
                  onChangeText={setInviteSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {inviteSearchLoading && (
                  <ActivityIndicator color={colors.accentPrimary} style={styles.searchSpinner} />
                )}
              </View>
              {inviteResults.length > 0 && (
                <View style={styles.card}>
                  {inviteResults.map((r, i) => {
                    const sent = sentInvites.has(r.id);
                    const sending = sendingInvite === r.id;
                    return (
                      <View key={r.id}>
                        <View style={styles.resultRow}>
                          <Avatar name={r.display_name ?? ''} userId={r.id} size={40} />
                          <View style={styles.rowInfo}>
                            <Text style={type.name}>{r.display_name}</Text>
                            {r.username && <Text style={type.meta}>@{r.username}</Text>}
                          </View>
                          <PrimaryButton
                            title={sent ? 'Sent' : 'Invite'}
                            onPress={() => handleInvite(r.id)}
                            disabled={sent}
                            loading={sending}
                            compact
                            color={sent ? colors.surfaceActive : colors.accentPrimary}
                          />
                        </View>
                        {i < inviteResults.length - 1 && <ListDivider />}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Invite code */}
            <View style={styles.section}>
              <Text style={type.sectionTitle}>Invite Code</Text>
              <View style={styles.codeRow}>
                <Text style={styles.codeText}>{inviteCode}</Text>
                <IconButton
                  icon="share-outline"
                  size="sm"
                  color={colors.accentPrimary}
                  onPress={handleShareCode}
                  accessibilityLabel="Share invite code"
                />
                {regenerating ? (
                  <View style={styles.iconLoading}>
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  </View>
                ) : (
                  <IconButton
                    icon="refresh-outline"
                    size="sm"
                    color={colors.textMuted}
                    onPress={handleRegenerateCode}
                    accessibilityLabel="Regenerate invite code"
                  />
                )}
              </View>
              <Text style={type.helper}>Share this code so others can join instantly.</Text>
            </View>

            {/* Member list */}
            <View style={styles.section}>
              <Text style={type.sectionTitle}>Members</Text>
              <View style={styles.card}>
                {members.map((m, i) => (
                  <View key={m.user_id}>
                    <View style={styles.resultRow}>
                      <Avatar name={m.display_name} userId={m.user_id} size={40} />
                      <View style={styles.rowInfo}>
                        <Text style={type.name}>{m.display_name}</Text>
                        {m.username && <Text style={type.meta}>@{m.username}</Text>}
                      </View>
                      {m.role === 'admin' ? (
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>Admin</Text>
                        </View>
                      ) : kicking === m.user_id ? (
                        <View style={styles.iconLoading}>
                          <ActivityIndicator size="small" color={colors.textMuted} />
                        </View>
                      ) : (
                        <IconButton
                          icon="close"
                          size="sm"
                          color={colors.textMuted}
                          onPress={() => handleKick(m)}
                          accessibilityLabel={`Remove ${m.display_name}`}
                        />
                      )}
                    </View>
                    {i < members.length - 1 && <ListDivider />}
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <SecondaryButton title="Leave Group" onPress={handleLeave} />
          {detail.my_role === 'admin' && (
            <SecondaryButton title="Delete Group" onPress={handleDelete} destructive />
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backgroundPrimary },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.section },

  leaderboardWrap: { marginTop: spacing.lg },

  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },

  // Admin sections
  section: { marginTop: spacing.xxl, gap: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: componentHeights.input,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  searchSpinner: { marginLeft: spacing.sm },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  rowInfo: { flex: 1, gap: 2 },

  // Invite code
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  codeText: {
    flex: 1,
    fontFamily: 'DMMono-Medium',
    fontSize: 18,
    color: colors.textPrimary,
    letterSpacing: 3,
  },
  iconLoading: {
    width: componentHeights.touchTarget,
    height: componentHeights.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Member list
  adminBadge: {
    backgroundColor: colors.surfaceActive,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  adminBadgeText: { fontWeight: '600', fontSize: 11, color: colors.textMuted },

  // Footer
  footer: { marginTop: spacing.xxxl, gap: spacing.md },
});
