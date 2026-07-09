-- ============================================================
-- Dice & Monsters — Supabase schema
-- ------------------------------------------------------------
-- Run this once in your Supabase project: SQL Editor → paste → Run.
-- It creates the tables for cross-device sync + group sharing, and
-- the Row Level Security (RLS) rules that enforce who can see what.
--
-- Sharing model:
--   * A user owns their own character sheets.
--   * A "group" is a play party. Anyone with the invite code can join.
--   * A sheet can be attached to a group and marked shared=true; then
--     every member of that group can READ it (only the owner edits).
-- ============================================================

create extension if not exists pgcrypto;

-- ---- Tables ------------------------------------------------

-- One profile row per signed-in user (for display names).
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- A group / play party.
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner       uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at  timestamptz not null default now()
);

-- Group membership (who is in which group).
create table if not exists group_members (
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Character sheets. `data` is freeform JSON so the sheet can grow
-- (HP, abilities, spells, …) without changing the schema.
create table if not exists character_sheets (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  group_id   uuid references groups(id) on delete set null,
  name       text not null,
  data       jsonb not null default '{}'::jsonb,
  shared     boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists character_sheets_owner_idx on character_sheets(owner);
create index if not exists character_sheets_group_idx on character_sheets(group_id);
create index if not exists group_members_user_idx on group_members(user_id);

-- ---- Helper: am I a member of this group? -------------------
-- SECURITY DEFINER so it bypasses RLS on group_members and avoids
-- recursive policy evaluation.
create or replace function is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- ---- Trigger: group owner is automatically a member ---------
create or replace function add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into group_members (group_id, user_id, role)
  values (new.id, new.owner, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists groups_add_owner on groups;
create trigger groups_add_owner
  after insert on groups
  for each row execute function add_owner_as_member();

-- ---- Join a group by its invite code ------------------------
create or replace function join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  select id into gid from groups where invite_code = code;
  if gid is null then
    raise exception 'Invalid invite code';
  end if;
  insert into group_members (group_id, user_id)
  values (gid, auth.uid())
  on conflict do nothing;
  return gid;
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles         enable row level security;
alter table groups           enable row level security;
alter table group_members    enable row level security;
alter table character_sheets enable row level security;

-- ---- profiles ----
-- Display names aren't secret; any signed-in user may read them.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to authenticated using (true);

drop policy if exists profiles_upsert on profiles;
create policy profiles_upsert on profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles
  for update to authenticated using (id = auth.uid());

-- ---- groups ----
drop policy if exists groups_select on groups;
create policy groups_select on groups
  for select to authenticated using (is_group_member(id));

drop policy if exists groups_insert on groups;
create policy groups_insert on groups
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists groups_update on groups;
create policy groups_update on groups
  for update to authenticated using (owner = auth.uid());

drop policy if exists groups_delete on groups;
create policy groups_delete on groups
  for delete to authenticated using (owner = auth.uid());

-- ---- group_members ----
-- You can see the membership rows of any group you belong to.
drop policy if exists members_select on group_members;
create policy members_select on group_members
  for select to authenticated using (is_group_member(group_id));

-- You may add yourself (the join_group function uses this path too).
drop policy if exists members_insert_self on group_members;
create policy members_insert_self on group_members
  for insert to authenticated with check (user_id = auth.uid());

-- You can leave a group; the owner can remove anyone.
drop policy if exists members_delete on group_members;
create policy members_delete on group_members
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from groups g where g.id = group_id and g.owner = auth.uid())
  );

-- ---- character_sheets ----
-- Read your own sheets, plus group-shared sheets in your groups.
drop policy if exists sheets_select on character_sheets;
create policy sheets_select on character_sheets
  for select to authenticated using (
    owner = auth.uid()
    or (shared = true and group_id is not null and is_group_member(group_id))
  );

-- Only the owner creates / edits / deletes a sheet.
drop policy if exists sheets_insert on character_sheets;
create policy sheets_insert on character_sheets
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists sheets_update on character_sheets;
create policy sheets_update on character_sheets
  for update to authenticated using (owner = auth.uid());

drop policy if exists sheets_delete on character_sheets;
create policy sheets_delete on character_sheets
  for delete to authenticated using (owner = auth.uid());

-- ============================================================
-- Play sessions — live game state you can save and share
-- ------------------------------------------------------------
-- One row per running/saved game. `state` is the serialized Play
-- page (combatants, HP, log, scene, AI-DM chat) — the same shape
-- the browser already autosaves locally. The DM owns and writes it;
-- when marked shared + attached to a group, group members can read
-- it live via Realtime (single-writer, so there are no conflicts).
-- ============================================================

create table if not exists play_sessions (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users(id) on delete cascade,
  group_id    uuid references groups(id) on delete set null,
  title       text not null,
  state       jsonb not null default '{}'::jsonb,
  shared      boolean not null default false,
  updated_at  timestamptz not null default now()
);

create index if not exists play_sessions_owner_idx on play_sessions(owner);
create index if not exists play_sessions_group_idx on play_sessions(group_id);

alter table play_sessions enable row level security;

-- Read your own sessions, plus shared sessions in groups you belong to.
drop policy if exists play_select on play_sessions;
create policy play_select on play_sessions
  for select to authenticated using (
    owner = auth.uid()
    or (shared = true and group_id is not null and is_group_member(group_id))
  );

-- Only the owner (the DM) creates / edits / deletes a session.
drop policy if exists play_insert on play_sessions;
create policy play_insert on play_sessions
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists play_update on play_sessions;
create policy play_update on play_sessions
  for update to authenticated using (owner = auth.uid());

drop policy if exists play_delete on play_sessions;
create policy play_delete on play_sessions
  for delete to authenticated using (owner = auth.uid());

-- Realtime: let players watch the DM's session update live.
-- (Safe to run once; if it says the table is already a member, ignore it.)
alter publication supabase_realtime add table play_sessions;

-- ============================================================
-- User collections — your characters / adventures / encounters
-- ------------------------------------------------------------
-- One row per user per collection kind. `data` is the whole
-- localStorage array as JSON, so every page can sync its list to
-- the cloud without a bespoke table each. Owner-only (private).
-- Kinds: 'characters', 'adventures', 'encounters'.
-- ============================================================

create table if not exists user_collections (
  owner       uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  data        jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (owner, kind)
);

alter table user_collections enable row level security;

drop policy if exists collections_all on user_collections;
create policy collections_all on user_collections
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());
