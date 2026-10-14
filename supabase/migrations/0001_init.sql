-- ============================================================================
-- 0001_init.sql — Aboard Production Database Schema
--
-- This migration supersedes the Phase 0 throwaway migration (which contained
-- only the minimum objects needed for Spike S4).
-- Changes from the Phase 0 throwaway:
-- 1. Added public.projects table with client-generated UUID primary key,
--    drive_needs_folder check constraint, char_length constraints on title
--    and subject, item_count constraint, and projects_user_updated index.
-- 2. Added public.touch_updated_at() trigger function and projects_touch
--    trigger on public.projects.
-- 3. Configured complete Row Level Security (RLS) on public.projects with
--    least-privilege grants (select, insert, delete, and restricted update
--    preventing mutation of id, user_id, created_at).
-- 4. Added four RLS policies on public.projects (projects_select,
--    projects_insert, projects_update, projects_delete) scoped to auth.uid().
-- 5. Standardized production table DDL without temporary "if not exists"
--    guards, strictly adhering to docs/specs/database.md §9.1.
-- ============================================================================

-- ── Profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  default_storage       text not null default 'local' check (default_storage in ('local','drive')),
  drive_root_folder_id  text,                       -- My Drive/Aboard folder id (cache)
  created_at            timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Project index (no content) ──────────────────────────────────────────────
create table public.projects (
  id               uuid primary key,                -- generated on the client
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  subject          text check (char_length(subject) <= 100),
  storage          text not null check (storage in ('local','drive')),
  drive_folder_id  text,
  local_device_id  text,                            -- which browser holds a local project
  item_count       integer not null default 0 check (item_count >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint drive_needs_folder check (storage <> 'drive' or drive_folder_id is not null)
);
create index projects_user_updated on public.projects (user_id, updated_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ── Google tokens (server-only) ─────────────────────────────────────────────
create table public.google_drive_links (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  refresh_ct      text not null,                    -- AES-256-GCM ciphertext (base64)
  refresh_iv      text not null,                    -- 12-byte IV (base64)
  scopes          text not null,
  google_email    text,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz
);

create table public.oauth_states (
  state           text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  code_verifier   text not null,
  return_to       text not null default '/',
  expires_at      timestamptz not null
);

-- ── Rate limits (used by Edge Functions) ────────────────────────────────────
create table public.rate_limits (
  key           text not null,                      -- e.g. '<user_id>:drive-token' or 'ip:<addr>:drive-callback'
  window_start  timestamptz not null,
  hits          integer not null default 1,
  primary key (key, window_start)
);

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';   -- cheap housekeeping
  end if;
  return n <= p_max;
end $$;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ── RLS: enabled on EVERY table in the public schema ────────────────────────
alter table public.profiles           enable row level security;
alter table public.projects           enable row level security;
alter table public.google_drive_links enable row level security;   -- no policies: clients get nothing
alter table public.oauth_states       enable row level security;   -- no policies: clients get nothing
alter table public.rate_limits        enable row level security;   -- no policies: clients get nothing

-- ── Least privilege: start from zero, grant only what the app needs ─────────
revoke all on public.profiles, public.projects, public.google_drive_links,
              public.oauth_states, public.rate_limits from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (default_storage, drive_root_folder_id) on public.profiles to authenticated;   -- user_id/created_at immutable

grant select, insert, delete on public.projects to authenticated;
grant update (title, subject, storage, drive_folder_id, local_device_id, item_count, deleted_at)
  on public.projects to authenticated;                                                       -- id/user_id/created_at immutable

-- ── Policies: one per command, each tied to the signed-in user ──────────────
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy projects_select on public.projects for select to authenticated
  using (user_id = (select auth.uid()));
create policy projects_insert on public.projects for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy projects_delete on public.projects for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── Drive status for the client (never returns the token) ───────────────────
create or replace function public.get_drive_status()
returns table (connected boolean, google_email text, linked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select true, l.google_email, l.created_at
  from public.google_drive_links l
  where l.user_id = (select auth.uid()) and l.revoked_at is null
  union all
  select false, null::text, null::timestamptz
  where not exists (
    select 1 from public.google_drive_links l
    where l.user_id = (select auth.uid()) and l.revoked_at is null);
$$;
revoke all on function public.get_drive_status() from public, anon;
grant execute on function public.get_drive_status() to authenticated;
