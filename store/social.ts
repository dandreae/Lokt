import { supabase, getUserId } from '../utils/supabase';
import { PREVIEW, PREVIEW_LEADERBOARD } from '../utils/previewData';

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
  avatar_color: string | null;
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

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  if (PREVIEW) return [...PREVIEW_LEADERBOARD];
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

// The % wildcards make this a contains search, not a prefix match.
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

export async function respondToRequest(friendshipId: string, accept: boolean): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', friendshipId);

  if (error) console.error('respondToRequest error:', error.message);
}

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

export async function getMyProfile(): Promise<UserProfile | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, username, avatar_color')
    .eq('id', userId)
    .maybeSingle();

  // avatar_color may not exist yet if that migration hasn't been applied —
  // fall back to the columns that have always existed rather than failing
  // the whole profile fetch over one missing column.
  if (error) {
    const { data: fallback } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', userId)
      .maybeSingle();
    return fallback ? { ...fallback, avatar_color: null } : null;
  }

  return data ?? null;
}

// Read-only existence check used for live "is this username available"
// feedback while typing — updateUsername() below still does the real
// write and is the source of truth (DB unique constraint wins any race).
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const clean = username.toLowerCase().trim().replace(/[^a-z0-9_.]/g, '');
  if (clean.length < 3) return false;

  const userId = await getUserId();
  let query = supabase.from('profiles').select('id').eq('username', clean).limit(1);
  if (userId) query = query.neq('id', userId);

  const { data, error } = await query.maybeSingle();
  if (error) { console.error('isUsernameAvailable error:', error.message); return false; }
  return !data;
}

export async function updateAvatarColor(color: string): Promise<{ success: boolean; message: string }> {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Not logged in.' };

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_color: color })
    .eq('id', userId);

  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Avatar updated!' };
}

// Contact info only — not used for authentication (no SMS/phone-auth
// provider is configured on this project).
export async function updatePhone(phone: string): Promise<{ success: boolean; message: string }> {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Not logged in.' };

  const { error } = await supabase
    .from('profiles')
    .update({ phone: phone.trim() || null })
    .eq('id', userId);

  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Phone saved!' };
}

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

export async function joinSchool(schoolId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('profiles').update({ school_id: schoolId }).eq('id', userId);
}

export async function leaveSchool(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('profiles').update({ school_id: null }).eq('id', userId);
}

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

// Checks the user's primary email domain against the schools table and auto-joins
// if there's a match. Fallback for users who signed up before the DB trigger existed.
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

export async function sendSchoolVerificationOtp(schoolEmail: string): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    email: schoolEmail.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Code sent!' };
}

// Verifies a school email OTP on behalf of the currently logged-in user.
// Flow: save original session tokens → verify OTP (replaces active session) →
// call RPC to update original user's school_id → restore original session.
// The school email is never stored; it is only used for domain verification.
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

// Usernames must be unique across all profiles — the DB enforces this with a unique constraint.
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
