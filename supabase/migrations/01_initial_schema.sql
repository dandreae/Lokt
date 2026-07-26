-- =============================================================================
-- Initial schema
-- =============================================================================
-- Apply: Supabase Dashboard → SQL Editor → paste entire file → Run
--
-- Captured from the original ad hoc bootstrap script (predates the
-- supabase/migrations/ convention) so the full schema history lives in the
-- repo. Already applied to the live project — this file is a record, not
-- something that needs re-running unless setting up a fresh project.
-- =============================================================================

NOTIFY pgrst, 'reload schema';

create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text,
  username text unique,
  created_at timestamptz default now()
);

create table if not exists schools (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  domain text,
  country text
);

alter table profiles add column if not exists school_id uuid references schools(id) on delete set null;

create table if not exists tasks (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  label text not null,
  color text not null default '#7c6ff7',
  weekly_goal_secs integer,
  created_at timestamptz default now()
);

create table if not exists sessions (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  task_id uuid references tasks(id) on delete set null,
  secs integer not null default 0,
  note text default '',
  created_at timestamptz default now()
);

create table if not exists settings (
  user_id uuid references auth.users(id) on delete cascade primary key,
  weekly_goal_secs integer not null default 28800
);

create table if not exists notification_prefs (
  user_id uuid references auth.users(id) on delete cascade primary key,
  friend_passed_you boolean default true,
  streak_at_risk boolean default true,
  friend_started_studying boolean default false,
  close_to_goal boolean default true
);

create table if not exists friendships (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references auth.users(id) on delete cascade not null,
  addressee_id uuid references auth.users(id) on delete cascade not null,
  status text check (status in ('pending', 'accepted', 'declined')) default 'pending',
  created_at timestamptz default now(),
  unique(requester_id, addressee_id)
);

alter table tasks enable row level security;
alter table sessions enable row level security;
alter table settings enable row level security;
alter table notification_prefs enable row level security;
alter table friendships enable row level security;
alter table profiles enable row level security;
alter table schools enable row level security;

drop policy if exists "own tasks" on tasks;
drop policy if exists "own sessions" on sessions;
drop policy if exists "own settings" on settings;
drop policy if exists "own notif prefs" on notification_prefs;
drop policy if exists "own friendships read" on friendships;
drop policy if exists "own friendships insert" on friendships;
drop policy if exists "own friendships update" on friendships;
drop policy if exists "own friendships delete" on friendships;
drop policy if exists "profiles readable" on profiles;
drop policy if exists "own profile write" on profiles;
drop policy if exists "own profile update" on profiles;
drop policy if exists "schools readable" on schools;

create policy "own tasks" on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions" on sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own settings" on settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notif prefs" on notification_prefs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own friendships read" on friendships for select using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "own friendships insert" on friendships for insert with check (auth.uid() = requester_id);
create policy "own friendships update" on friendships for update using (auth.uid() = addressee_id);
create policy "own friendships delete" on friendships for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "profiles readable" on profiles for select using (true);
create policy "own profile write" on profiles for insert with check (auth.uid() = id);
create policy "own profile update" on profiles for update using (auth.uid() = id);
create policy "schools readable" on schools for select using (true);

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'New User')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
