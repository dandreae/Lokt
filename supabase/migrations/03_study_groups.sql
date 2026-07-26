DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;
DROP FUNCTION IF EXISTS public.is_active_group_member(uuid, uuid);

-- =============================================================================
-- Study Groups
-- =============================================================================
-- Apply: Supabase Dashboard → SQL Editor → paste entire file → Run
--
-- NOTE: this file drops and recreates groups/group_members from scratch —
-- re-running it wipes any existing group data. That's intentional for now
-- since this is the single source of truth for the schema; once real group
-- data exists in production this should switch to additive migrations.
-- =============================================================================


-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.groups (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL
                             CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  created_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 10-char uppercase hex invite code (~10^12 space, easy to share verbally)
  invite_code  text        NOT NULL UNIQUE
                             DEFAULT upper(encode(gen_random_bytes(5), 'hex')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id    uuid        NOT NULL REFERENCES public.groups(id)  ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'member'
                            CHECK (role   IN ('admin', 'member')),
  -- 'invited' = pending acceptance; 'active' = full member
  status      text        NOT NULL DEFAULT 'invited'
                            CHECK (status IN ('active', 'invited')),
  invited_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);


-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Every RLS check on group_members hits (user_id, status)
CREATE INDEX IF NOT EXISTS idx_group_members_user_status
  ON public.group_members (user_id, status);

-- Roster lookups and leaderboard membership gate hit (group_id, status)
CREATE INDEX IF NOT EXISTS idx_group_members_group_status
  ON public.group_members (group_id, status);

-- Leaderboard aggregates over (user_id, created_at); safe no-op if it exists
CREATE INDEX IF NOT EXISTS idx_sessions_user_created
  ON public.sessions (user_id, created_at);


-- ─── RLS helper function ───────────────────────────────────────────────────────
-- is_active_group_member
-- Used inside group_members_select below instead of a raw self-referencing
-- subquery. A policy on group_members that queries group_members directly
-- in its own USING clause causes Postgres to re-evaluate that same policy
-- on the inner query, recursing forever ("infinite recursion detected in
-- policy for relation group_members"). SECURITY DEFINER breaks that chain
-- by running the inner query with the function owner's privileges instead
-- of re-entering RLS as the calling role.
CREATE OR REPLACE FUNCTION public.is_active_group_member(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id AND status = 'active'
  );
$$;

ALTER FUNCTION public.is_active_group_member(uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_active_group_member(uuid, uuid) TO authenticated;

-- Client reads (getMyGroups, getPendingGroupInvites, etc.) query these
-- tables directly as the `authenticated` role via PostgREST — RLS policies
-- only filter rows, they don't grant table access, so the base privilege
-- has to be explicit. Writes are unaffected: they only go through the
-- SECURITY DEFINER RPCs below, which run as the table owner regardless.
GRANT SELECT ON public.groups        TO authenticated;
GRANT SELECT ON public.group_members TO authenticated;


-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- ── groups ────────────────────────────────────────────────────────────────────

-- Active and invited members can read the group row.
-- Invited users need the group name visible before they accept.
CREATE POLICY "groups_select_for_members"
  ON public.groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id  = auth.uid()
        AND gm.status   IN ('active', 'invited')
    )
  );

-- All mutating operations go through SECURITY DEFINER RPCs.
-- Blocking direct client writes keeps authorization logic server-side only.
CREATE POLICY "groups_no_direct_insert" ON public.groups FOR INSERT  WITH CHECK (false);
CREATE POLICY "groups_no_direct_update" ON public.groups FOR UPDATE  USING     (false);
CREATE POLICY "groups_no_direct_delete" ON public.groups FOR DELETE  USING     (false);

-- ── group_members ─────────────────────────────────────────────────────────────

-- A user always sees their own rows (for pending invite notifications).
-- Active members see the full active roster of every group they belong to.
CREATE POLICY "group_members_select"
  ON public.group_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_active_group_member(group_members.group_id, auth.uid())
  );

CREATE POLICY "group_members_no_direct_insert" ON public.group_members FOR INSERT  WITH CHECK (false);
CREATE POLICY "group_members_no_direct_update" ON public.group_members FOR UPDATE  USING     (false);
CREATE POLICY "group_members_no_direct_delete" ON public.group_members FOR DELETE  USING     (false);


-- ─── Functions ────────────────────────────────────────────────────────────────
-- All functions:
--   • SECURITY DEFINER  — bypass RLS so server-side logic can write freely
--   • SET search_path = public  — prevent search_path injection attacks
--   • Use auth.uid() as the only trust anchor; never trust a caller-supplied
--     user_id for the acting user


-- create_group
-- Creates the group and adds the caller as its first admin member.
-- Returns the new group UUID.
CREATE OR REPLACE FUNCTION public.create_group(p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_group_id    uuid;
  v_admin_count int;
BEGIN
  IF char_length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Group name cannot be empty';
  END IF;
  IF char_length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'Group name must be 60 characters or fewer';
  END IF;

  -- Abuse cap: at most 10 groups where the caller is admin at once.
  SELECT count(*) INTO v_admin_count
  FROM   group_members
  WHERE  user_id = auth.uid()
    AND  role    = 'admin'
    AND  status  = 'active';

  IF v_admin_count >= 10 THEN
    RAISE EXCEPTION 'Maximum of 10 groups per user';
  END IF;

  INSERT INTO groups (name, created_by)
  VALUES (trim(p_name), auth.uid())
  RETURNING id INTO v_group_id;

  -- Creator is immediately active so they can invite others right away.
  INSERT INTO group_members (group_id, user_id, role, status)
  VALUES (v_group_id, auth.uid(), 'admin', 'active');

  RETURN v_group_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_group(text) TO authenticated;


-- invite_member
-- Admin sends an invite to an existing user (identified by their user_id).
-- The invited user sees a pending invite until they accept or decline.
CREATE OR REPLACE FUNCTION public.invite_member(p_group_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_active_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE  group_id = p_group_id
      AND  user_id  = auth.uid()
      AND  role     = 'admin'
      AND  status   = 'active'
  ) THEN
    RAISE EXCEPTION 'Only admins can invite members';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  -- Any existing row (active or pending) blocks a duplicate.
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'User is already a member or has a pending invite';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM   group_members
  WHERE  group_id = p_group_id AND status = 'active';

  IF v_active_count >= 50 THEN
    RAISE EXCEPTION 'Group is full (50 member maximum)';
  END IF;

  INSERT INTO group_members (group_id, user_id, role, status, invited_by)
  VALUES (p_group_id, p_user_id, 'member', 'invited', auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.invite_member(uuid, uuid) TO authenticated;


-- accept_invite
-- Converts the caller's pending invite to an active membership.
CREATE OR REPLACE FUNCTION public.accept_invite(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_active_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = auth.uid() AND status = 'invited'
  ) THEN
    RAISE EXCEPTION 'No pending invite for this group';
  END IF;

  -- Re-check cap to close the race between invite_member and accept_invite.
  SELECT count(*) INTO v_active_count
  FROM   group_members
  WHERE  group_id = p_group_id AND status = 'active';

  IF v_active_count >= 50 THEN
    RAISE EXCEPTION 'Group is full';
  END IF;

  UPDATE group_members
  SET    status = 'active', joined_at = now()
  WHERE  group_id = p_group_id AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_invite(uuid) TO authenticated;


-- decline_invite
-- Removes the caller's pending invite without joining the group.
CREATE OR REPLACE FUNCTION public.decline_invite(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM group_members
  WHERE  group_id = p_group_id
    AND  user_id  = auth.uid()
    AND  status   = 'invited';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending invite for this group';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decline_invite(uuid) TO authenticated;


-- leave_group
-- Removes the caller from the group.
-- Last member leaving deletes the group entirely.
-- A sole admin with remaining members must remove them first.
CREATE OR REPLACE FUNCTION public.leave_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role         text;
  v_admin_count  int;
  v_member_count int;
BEGIN
  SELECT role INTO v_role
  FROM   group_members
  WHERE  group_id = p_group_id
    AND  user_id  = auth.uid()
    AND  status   = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  SELECT count(*) INTO v_member_count
  FROM   group_members
  WHERE  group_id = p_group_id AND status = 'active';

  IF v_member_count = 1 THEN
    -- Last member: cascade delete cleans up group_members too.
    DELETE FROM groups WHERE id = p_group_id;
    RETURN;
  END IF;

  IF v_role = 'admin' THEN
    SELECT count(*) INTO v_admin_count
    FROM   group_members
    WHERE  group_id = p_group_id AND role = 'admin' AND status = 'active';

    IF v_admin_count = 1 THEN
      RAISE EXCEPTION 'You are the only admin. Remove all other members before leaving.';
    END IF;
  END IF;

  DELETE FROM group_members
  WHERE group_id = p_group_id AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO authenticated;


-- kick_member
-- Admin removes a non-admin member (active or invited).
-- Cannot kick other admins or yourself.
CREATE OR REPLACE FUNCTION public.kick_member(p_group_id uuid, p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE  group_id = p_group_id
      AND  user_id  = auth.uid()
      AND  role     = 'admin'
      AND  status   = 'active'
  ) THEN
    RAISE EXCEPTION 'Only admins can remove members';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use leave_group to leave';
  END IF;

  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_target_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Cannot remove another admin';
  END IF;

  DELETE FROM group_members
  WHERE group_id = p_group_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member of this group';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.kick_member(uuid, uuid) TO authenticated;


-- join_by_invite_code
-- Joins a group immediately using its invite code; no approval step.
-- Case-insensitive: normalises the code to uppercase before lookup.
-- Returns the group UUID so the caller can navigate to the group detail.
-- Already-a-member calls are idempotent (returns ID, no error).
CREATE OR REPLACE FUNCTION public.join_by_invite_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_group_id     uuid;
  v_active_count int;
BEGIN
  SELECT id INTO v_group_id
  FROM   groups
  WHERE  invite_code = upper(trim(p_code));

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = v_group_id AND user_id = auth.uid()
  ) THEN
    RETURN v_group_id;
  END IF;

  SELECT count(*) INTO v_active_count
  FROM   group_members
  WHERE  group_id = v_group_id AND status = 'active';

  IF v_active_count >= 50 THEN
    RAISE EXCEPTION 'Group is full (50 member maximum)';
  END IF;

  INSERT INTO group_members (group_id, user_id, role, status)
  VALUES (v_group_id, auth.uid(), 'member', 'active');

  RETURN v_group_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.join_by_invite_code(text) TO authenticated;


-- regenerate_invite_code
-- Admin rotates the group's invite code, invalidating the old one immediately.
-- Returns the new code so the admin can share it.
CREATE OR REPLACE FUNCTION public.regenerate_invite_code(p_group_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new_code text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE  group_id = p_group_id
      AND  user_id  = auth.uid()
      AND  role     = 'admin'
      AND  status   = 'active'
  ) THEN
    RAISE EXCEPTION 'Only admins can regenerate the invite code';
  END IF;

  v_new_code := upper(encode(gen_random_bytes(5), 'hex'));
  UPDATE groups SET invite_code = v_new_code WHERE id = p_group_id;
  RETURN v_new_code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.regenerate_invite_code(uuid) TO authenticated;


-- delete_group
-- Any admin can delete the group; ON DELETE CASCADE removes all member rows.
CREATE OR REPLACE FUNCTION public.delete_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE  group_id = p_group_id
      AND  user_id  = auth.uid()
      AND  role     = 'admin'
      AND  status   = 'active'
  ) THEN
    RAISE EXCEPTION 'Only admins can delete a group';
  END IF;

  DELETE FROM groups WHERE id = p_group_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_group(uuid) TO authenticated;


-- get_group_leaderboard
-- Returns ranked study totals for all active members of a group.
--
-- p_period: 'week'  = rolling 7 days
--           'month' = rolling 30 days
--           'all'   = all time
--
-- SECURITY: This is the only function that touches other users' session data.
-- It returns only SUM(secs) — no individual rows, notes, task names, or
-- timestamps are ever returned. Non-members receive an empty result set
-- rather than an error to avoid leaking group existence via timing.
CREATE OR REPLACE FUNCTION public.get_group_leaderboard(
  p_group_id uuid,
  p_period   text DEFAULT 'week'
)
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  username     text,
  period_secs  bigint,
  is_studying  boolean,
  is_me        boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = auth.uid() AND status = 'active'
  ) THEN
    RETURN;
  END IF;

  v_start := CASE p_period
    WHEN 'week'  THEN now() - interval '7 days'
    WHEN 'month' THEN now() - interval '30 days'
    ELSE '-infinity'::timestamptz
  END;

  RETURN QUERY
  SELECT
    gm.user_id,
    p.display_name,
    p.username,
    COALESCE(SUM(s.secs), 0)::bigint         AS period_secs,
    COALESCE(pres.is_studying, false)         AS is_studying,
    (gm.user_id = auth.uid())                AS is_me
  FROM   public.group_members gm
  JOIN   public.profiles      p    ON p.id        = gm.user_id
  LEFT JOIN public.sessions   s    ON s.user_id   = gm.user_id
                                  AND s.created_at >= v_start
  LEFT JOIN public.presence   pres ON pres.user_id = gm.user_id
  WHERE  gm.group_id = p_group_id
    AND  gm.status   = 'active'
  GROUP BY gm.user_id, p.display_name, p.username, pres.is_studying
  ORDER BY period_secs DESC, p.display_name ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_group_leaderboard(uuid, text) TO authenticated;
