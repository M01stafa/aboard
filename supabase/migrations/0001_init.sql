-- ============================================================================
-- SPIKE S4 THROWAWAY MIGRATION
-- Minimum tables and functions required for Phase 0 Spike S4 Drive functions.
-- The full production schema (including projects, full RLS suite, and pgTAP tests)
-- belongs to Task 13 (Phase 2).
-- ============================================================================

-- ── Profiles (used by saveLink in drive-callback / drive-link-token) ────────
create table if not exists public.profiles (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  default_storage       text not null default 'local' check (default_storage in ('local','drive')),
  drive_root_folder_id  text,
  created_at            timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Google tokens (server-only: used by drive-link-token, drive-token, drive-callback)
create table if not exists public.google_drive_links (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  refresh_ct      text not null,                    -- AES-256-GCM ciphertext (base64)
  refresh_iv      text not null,                    -- 12-byte IV (base64)
  scopes          text not null,
  google_email    text,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz
);

-- ── OAuth states (server-only: used by drive-connect and drive-callback) ─────
create table if not exists public.oauth_states (
  state           text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  code_verifier   text not null,
  return_to       text not null default '/',
  expires_at      timestamptz not null
);

-- ── Rate limits (used by Edge Functions via check_rate_limit) ───────────────
create table if not exists public.rate_limits (
  key           text not null,
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
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n <= p_max;
end $$;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ── RLS: enabled on every table ─────────────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.google_drive_links enable row level security;
alter table public.oauth_states       enable row level security;
alter table public.rate_limits        enable row level security;

-- ── Least privilege: server-only tables have no policies and revoked access ─
revoke all on public.profiles, public.google_drive_links,
              public.oauth_states, public.rate_limits from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (default_storage, drive_root_folder_id) on public.profiles to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Drive status for the client ─────────────────────────────────────────────
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
