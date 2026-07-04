import { supabase, getUserId } from '../utils/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeaderboardEntry = {
  user_id: string;
  display_name: string;
  username: string | null;
  weekly_secs: number;
  is_studying: boolean;
  is_me: boolean;
};

export type PendingRequest = {
  id: string;
  requester_id: string;
  display_name: string;
  username: string | null;
};

export type UserProfile = {
  display_name: string;
  username: string | null;
};

export type School = {
  id: string;
  name: string;
  domain: string;
};

export type SearchResult = {
  id: string;
  display_name: string;
  username: string | null;
};

// ─── Leaderboard ──────────────────────────────────────────────────────────────

// Calls the database function we created in SQL.
// Returns you + all accepted friends sorted by weekly study time.
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const { data, error } = await supabase.rpc('get_friends_leaderboard');
  if (error) {
    console.error('getLeaderboard error:', error.message);
    return [];
  }

  return (data ?? []).map((row: LeaderboardEntry) => ({
    ...row,
    weekly_secs: Number(row.weekly_secs),
    is_me: row.user_id === userId,
  }));
}

// ─── Friend requests ──────────────────────────────────────────────────────────

// Search for users by username or display name.
// The % symbols make it a "contains" search, not exact match.
export async function searchUsers(query: string): Promise<SearchResult[]> {
  const userId = await getUserId();
  if (!userId || !query.trim()) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, username')
    .or(`username.ilike.%${query.trim()}%,display_name.ilike.%${query.trim()}%`)
    .neq('id', userId)
    .limit(8);

  if (error) { console.error('searchUsers error:', error.message); return []; }
  return data ?? [];
}

// Send a friend request to another user.
// Returns a message so the UI can show feedback.
export async function sendFriendRequest(addresseeId: string): Promise<{ success: boolean; message: string }> {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Not logged in.' };

  const { error } = await supabase.from('friendships').insert({
    requester_id: userId,
    addressee_id: addresseeId,
  });

  if (error) {
    if (error.code === '23505') return { success: false, message: 'Request already sent.' };
    console.error('sendFriendRequest error:', error.message);
    return { success: false, message: 'Something went wrong.' };
  }

  return { success: true, message: 'Request sent!' };
}

// Get all incoming friend requests that are still pending.
export async function getPendingRequests(): Promise<PendingRequest[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const { data: friendships, error } = await supabase
    .from('friendships')
    .select('id, requester_id')
    .eq('addressee_id', userId)
    .eq('status', 'pending');

  if (error) { console.error('getPendingRequests error:', error.message); return []; }
  if (!friendships?.length) return [];

  const requesterIds = friendships.map((f) => f.requester_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, username')
    .in('id', requesterIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return friendships.map((f) => ({
    id: f.id,
    requester_id: f.requester_id,
    display_name: profileMap.get(f.requester_id)?.display_name ?? 'Unknown',
    username: profileMap.get(f.requester_id)?.username ?? null,
  }));
}

// Accept or decline a friend request.
export async function respondToRequest(friendshipId: string, accept: boolean): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', friendshipId);

  if (error) console.error('respondToRequest error:', error.message);
}

// ─── Presence ─────────────────────────────────────────────────────────────────

// Update whether you are currently studying.
// Called when a session starts and when it ends.
export async function updatePresence(isStudying: boolean, taskId?: string | null): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase.from('presence').upsert({
    user_id: userId,
    is_studying: isStudying,
    task_id: taskId ?? null,
    updated_at: new Date().toISOString(),
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getMyProfile(): Promise<UserProfile | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const { data } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', userId)
    .maybeSingle();

  return data ?? null;
}

// Update the current user's display name.
export async function updateDisplayName(name: string): Promise<{ success: boolean; message: string }> {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Not logged in.' };

  const clean = name.trim();
  if (clean.length < 1) return { success: false, message: 'Name cannot be empty.' };

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: clean })
    .eq('id', userId);

  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Name updated!' };
}

// ─── School ───────────────────────────────────────────────────────────────────

// Search for schools by name. Used in the join school flow.
export async function searchSchools(query: string): Promise<School[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, domain')
    .ilike('name', `%${query.trim()}%`)
    .limit(8);
  if (error) { console.error('searchSchools error:', error.message); return []; }
  return data ?? [];
}

// Get the current user's school, or null if they haven't joined one.
export async function getMySchool(): Promise<School | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data } = await supabase
    .from('profiles')
    .select('schools(id, name, domain)')
    .eq('id', userId)
    .maybeSingle();
  if (!data?.schools) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = data.schools as any;
  return { id: s.id, name: s.name, domain: s.domain ?? '' };
}

// Join an existing school by ID.
export async function joinSchool(schoolId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('profiles').update({ school_id: schoolId }).eq('id', userId);
}

// Create a new school and immediately join it.
// Used when a user's school isn't in the database yet.
export async function createAndJoinSchool(name: string): Promise<{ success: boolean; message: string }> {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Not logged in.' };

  const { data, error } = await supabase
    .from('schools')
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error) return { success: false, message: error.message };

  await supabase.from('profiles').update({ school_id: data.id }).eq('id', userId);
  return { success: true, message: 'Joined!' };
}

// Leave the current school.
export async function leaveSchool(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('profiles').update({ school_id: null }).eq('id', userId);
}

// Get the school leaderboard — all users at the same school sorted by weekly time.
export async function getSchoolLeaderboard(): Promise<LeaderboardEntry[]> {
  const userId = await getUserId();
  if (!userId) return [];
  const { data, error } = await supabase.rpc('get_school_leaderboard');
  if (error) { console.error('getSchoolLeaderboard error:', error.message); return []; }
  return (data ?? []).map((row: LeaderboardEntry) => ({
    ...row,
    weekly_secs: Number(row.weekly_secs),
    is_me: row.user_id === userId,
  }));
}

// ─── Username ─────────────────────────────────────────────────────────────────

// ─── School email verification ────────────────────────────────────────────────

// If the user's primary email domain matches a school, auto-join them.
// Used as a fallback for existing users who signed up before the trigger.
export async function checkAndAutoJoinSchool(): Promise<School | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email;
  if (!email) return null;

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  const { data: school } = await supabase
    .from('schools')
    .select('id, name, domain')
    .ilike('domain', domain)
    .maybeSingle();

  if (!school) return null;

  await supabase.from('profiles').update({ school_id: school.id }).eq('id', userId);
  return { id: school.id, name: school.name, domain: school.domain };
}

// Send a 6-digit OTP to the given school email address.
export async function sendSchoolVerificationOtp(schoolEmail: string): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    email: schoolEmail.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Code sent!' };
}

// Verify the OTP for a school email and join the school on behalf of the original user.
// Saves the original session, switches to the OTP session to call the RPC, then restores.
export async function verifySchoolOtpAndJoin(
  schoolEmail: string,
  token: string,
  schoolId: string,
): Promise<{ success: boolean; message: string }> {
  const { data: { session: orig } } = await supabase.auth.getSession();
  if (!orig) return { success: false, message: 'Not logged in.' };

  const origUserId = orig.user.id;
  const origAccess = orig.access_token;
  const origRefresh = orig.refresh_token;

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    email: schoolEmail.trim().toLowerCase(),
    token,
    type: 'email',
  });

  if (verifyErr) {
    await supabase.auth.setSession({ access_token: origAccess, refresh_token: origRefresh });
    return { success: false, message: 'Invalid or expired code.' };
  }

  const { error: rpcErr } = await supabase.rpc('claim_school_membership', {
    target_user_id: origUserId,
    school_id: schoolId,
  });

  await supabase.auth.setSession({ access_token: origAccess, refresh_token: origRefresh });

  if (rpcErr) return { success: false, message: "Email domain doesn't match this school." };
  return { success: true, message: 'Joined!' };
}

// ─── Username ─────────────────────────────────────────────────────────────────

// Set or update the current user's username.
// Usernames must be unique — Supabase will reject duplicates.
export async function updateUsername(username: string): Promise<{ success: boolean; message: string }> {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Not logged in.' };

  const clean = username.toLowerCase().trim().replace(/[^a-z0-9_.]/g, '');
  if (clean.length < 3) return { success: false, message: 'Username must be at least 3 characters.' };

  const { error } = await supabase
    .from('profiles')
    .update({ username: clean })
    .eq('id', userId);

  if (error) {
    if (error.code === '23505') return { success: false, message: 'That username is taken.' };
    return { success: false, message: error.message };
  }

  return { success: true, message: 'Username set!' };
}
