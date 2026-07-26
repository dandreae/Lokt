import { supabase, getUserId } from '../utils/supabase';
import { PREVIEW } from '../utils/previewData';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupSummary = {
  id: string;
  name: string;
  my_role: 'admin' | 'member';
};

export type GroupDetail = {
  id: string;
  name: string;
  invite_code: string;
  my_role: 'admin' | 'member';
  member_count: number;
};

export type GroupMember = {
  user_id: string;
  display_name: string;
  username: string | null;
  role: 'admin' | 'member';
  joined_at: string;
};

export type GroupInvite = {
  group_id: string;
  group_name: string;
  invited_by_name: string | null;
};

// Period-agnostic leaderboard entry — distinct from LeaderboardEntry in
// social.ts which hardcodes weekly_secs. Groups support week/month/all.
export type GroupLeaderboardEntry = {
  user_id: string;
  display_name: string;
  username: string | null;
  period_secs: number;
  is_studying: boolean;
  is_me: boolean;
};

// ─── Queries ──────────────────────────────────────────────────────────────────

// All groups the user is actively in, ordered by when they joined.
export async function getMyGroups(): Promise<GroupSummary[]> {
  if (PREVIEW) return [];
  const userId = await getUserId();
  if (!userId) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from('group_members')
    .select('role, groups!inner(id, name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  if (error) { console.error('getMyGroups error:', error.message); return []; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.groups.id,
    name: row.groups.name,
    my_role: row.role as 'admin' | 'member',
  }));
}

// Groups where the user has a pending invite (status = 'invited').
export async function getPendingGroupInvites(): Promise<GroupInvite[]> {
  if (PREVIEW) return [];
  const userId = await getUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, invited_by, groups!inner(name)')
    .eq('user_id', userId)
    .eq('status', 'invited');

  if (error) { console.error('getPendingGroupInvites error:', error.message); return []; }
  if (!data?.length) return [];

  // Fetch inviter display names in one round-trip.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inviterIds = (data as any[]).map((r) => r.invited_by).filter(Boolean);
  const nameMap = new Map<string, string>();

  if (inviterIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', inviterIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profiles ?? []).forEach((p: any) => nameMap.set(p.id, p.display_name));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({
    group_id: r.group_id,
    group_name: r.groups.name,
    invited_by_name: r.invited_by ? (nameMap.get(r.invited_by) ?? null) : null,
  }));
}

// Name, invite code, role, and member count for the group detail screen.
export async function getGroupDetail(groupId: string): Promise<GroupDetail | null> {
  if (PREVIEW) return null;
  const userId = await getUserId();
  if (!userId) return null;

  const [groupRes, membershipRes, countRes] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, invite_code')
      .eq('id', groupId)
      .maybeSingle(),
    supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'active'),
  ]);

  if (!groupRes.data || !membershipRes.data) return null;

  return {
    id: groupRes.data.id,
    name: groupRes.data.name,
    invite_code: groupRes.data.invite_code,
    my_role: membershipRes.data.role as 'admin' | 'member',
    member_count: countRes.count ?? 0,
  };
}

// Full active roster for the member management panel.
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  if (PREVIEW) return [];
  const userId = await getUserId();
  if (!userId) return [];

  const { data: members, error } = await supabase
    .from('group_members')
    .select('user_id, role, joined_at')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  if (error) { console.error('getGroupMembers error:', error.message); return []; }
  if (!members?.length) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = (members as any[]).map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, username')
    .in('id', userIds);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (members as any[]).map((m) => ({
    user_id: m.user_id,
    display_name: profileMap.get(m.user_id)?.display_name ?? 'Unknown',
    username: profileMap.get(m.user_id)?.username ?? null,
    role: m.role as 'admin' | 'member',
    joined_at: m.joined_at,
  }));
}

// Leaderboard for one period. All cross-user session access happens inside
// the SECURITY DEFINER RPC — this function never reads sessions directly.
export async function getGroupLeaderboard(
  groupId: string,
  period: 'week' | 'month' | 'all' = 'week',
): Promise<GroupLeaderboardEntry[]> {
  if (PREVIEW) return [];
  const userId = await getUserId();
  if (!userId) return [];

  const { data, error } = await supabase.rpc('get_group_leaderboard', {
    p_group_id: groupId,
    p_period: period,
  });

  if (error) { console.error('getGroupLeaderboard error:', error.message); return []; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    user_id: row.user_id,
    display_name: row.display_name,
    username: row.username,
    period_secs: Number(row.period_secs),
    is_studying: row.is_studying,
    is_me: row.user_id === userId,
  }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createGroup(
  name: string,
): Promise<{ success: boolean; groupId?: string; message: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: 'Group name cannot be empty.' };
  if (trimmed.length > 60) return { success: false, message: 'Name must be 60 characters or fewer.' };

  const { data, error } = await supabase.rpc('create_group', { p_name: trimmed });
  if (error) {
    console.error('createGroup error:', error.message);
    return { success: false, message: error.message };
  }
  return { success: true, groupId: data as string, message: 'Group created!' };
}

export async function inviteMember(
  groupId: string,
  userId: string,
): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase.rpc('invite_member', {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) {
    console.error('inviteMember error:', error.message);
    return { success: false, message: error.message };
  }
  return { success: true, message: 'Invite sent!' };
}

export async function acceptInvite(
  groupId: string,
): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase.rpc('accept_invite', { p_group_id: groupId });
  if (error) {
    console.error('acceptInvite error:', error.message);
    return { success: false, message: error.message };
  }
  return { success: true, message: 'Joined!' };
}

export async function declineInvite(
  groupId: string,
): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase.rpc('decline_invite', { p_group_id: groupId });
  if (error) {
    console.error('declineInvite error:', error.message);
    return { success: false, message: error.message };
  }
  return { success: true, message: 'Invite declined.' };
}

export async function leaveGroup(
  groupId: string,
): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
  if (error) {
    console.error('leaveGroup error:', error.message);
    return { success: false, message: error.message };
  }
  return { success: true, message: 'Left group.' };
}

export async function kickMember(
  groupId: string,
  targetUserId: string,
): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase.rpc('kick_member', {
    p_group_id: groupId,
    p_target_user_id: targetUserId,
  });
  if (error) {
    console.error('kickMember error:', error.message);
    return { success: false, message: error.message };
  }
  return { success: true, message: 'Member removed.' };
}

export async function joinByInviteCode(
  code: string,
): Promise<{ success: boolean; groupId?: string; message: string }> {
  if (!code.trim()) return { success: false, message: 'Enter an invite code.' };

  const { data, error } = await supabase.rpc('join_by_invite_code', {
    p_code: code.trim(),
  });
  if (error) {
    console.error('joinByInviteCode error:', error.message);
    return { success: false, message: error.message };
  }
  return { success: true, groupId: data as string, message: 'Joined!' };
}

export async function regenerateInviteCode(
  groupId: string,
): Promise<{ success: boolean; newCode?: string; message: string }> {
  const { data, error } = await supabase.rpc('regenerate_invite_code', {
    p_group_id: groupId,
  });
  if (error) {
    console.error('regenerateInviteCode error:', error.message);
    return { success: false, message: error.message };
  }
  return { success: true, newCode: data as string, message: 'Invite code updated.' };
}

export async function deleteGroup(
  groupId: string,
): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase.rpc('delete_group', { p_group_id: groupId });
  if (error) {
    console.error('deleteGroup error:', error.message);
    return { success: false, message: error.message };
  }
  return { success: true, message: 'Group deleted.' };
}
