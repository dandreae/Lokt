-- =============================================================================
-- Presence + friends leaderboard
-- =============================================================================
-- Apply: Supabase Dashboard → SQL Editor → paste entire file → Run
--
-- Captured from an ad hoc bootstrap script that also created an early
-- version of groups/group_members. That version (no invite_code, no
-- role/status, and a self-referencing group_members SELECT policy with the
-- same recursion bug fixed in 20260712000000_study_groups.sql) is already
-- superseded — that migration drops and recreates both tables with the
-- current schema, so it's intentionally omitted here. Only the still-live
-- parts (presence, get_friends_leaderboard) are captured.
-- =============================================================================

create table if not exists presence (
  user_id uuid references auth.users(id) on delete cascade primary key,
  is_studying boolean default false,
  task_id uuid references tasks(id) on delete set null,
  updated_at timestamptz default now()
);

alter table presence enable row level security;

drop policy if exists "presence readable" on presence;
drop policy if exists "own presence write" on presence;

create policy "presence readable" on presence for select using (true);
create policy "own presence write" on presence for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on presence to authenticated;

-- get_friends_leaderboard
-- Weekly study totals for the caller and their accepted friends.
drop function if exists get_friends_leaderboard();

create or replace function get_friends_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  username text,
  weekly_secs bigint,
  is_studying boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.display_name,
    p.username,
    coalesce(sum(s.secs), 0)::bigint as weekly_secs,
    coalesce(pr.is_studying, false) as is_studying
  from profiles p
  left join sessions s
    on s.user_id = p.id
    and s.created_at >= now() - interval '7 days'
  left join presence pr on pr.user_id = p.id
  where
    p.id = auth.uid()
    or p.id in (
      select
        case
          when f.requester_id = auth.uid() then f.addressee_id
          else f.requester_id
        end
      from friendships f
      where
        (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
        and f.status = 'accepted'
    )
  group by p.id, p.display_name, p.username, pr.is_studying
  order by weekly_secs desc;
$$;

grant execute on function get_friends_leaderboard() to authenticated;
