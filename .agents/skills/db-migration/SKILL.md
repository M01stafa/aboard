---
name: db-migration
description: Creates or changes Aboard's Supabase database safely (tables, columns, policies, grants, SQL functions) with RLS, least-privilege grants and pgTAP isolation tests in the same migration. Use for any change under supabase/migrations or any new table, column, policy or function.
---

# Database migration (Aboard)

Read first: `docs/specs/database.md` (§9) and `docs/specs/security.md` §14.3. Rules in `.agents/rules/security.md` §1 apply.

## Before writing SQL
1. Confirm the data belongs in Supabase at all. Only accounts, the project index, Google tokens and rate-limit counters may live there. User content (boards, circuits, PDFs, images, annotations) never does; if the request implies it, stop and ask the owner.
2. Write a short plan for the owner: table/column/policy/function, who may read/write it, and the pgTAP cases you will add. Wait for approval when an existing table's RLS, grants or policies change.

## Write the migration
Create `supabase/migrations/NNNN_short_name.sql` (next number; never edit an applied migration). For each new table, in this order:

```sql
create table public.<name> (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- columns with check constraints on lengths and enums
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.<name> (user_id);

alter table public.<name> enable row level security;
revoke all on public.<name> from anon, authenticated;

-- grant only what the app needs; column list keeps id/user_id/created_at immutable
grant select, insert, delete on public.<name> to authenticated;
grant update (<editable columns>) on public.<name> to authenticated;

create policy <name>_select on public.<name> for select to authenticated using (user_id = (select auth.uid()));
create policy <name>_insert on public.<name> for insert to authenticated with check (user_id = (select auth.uid()));
create policy <name>_update on public.<name> for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy <name>_delete on public.<name> for delete to authenticated using (user_id = (select auth.uid()));

create trigger <name>_touch before update on public.<name>
  for each row execute function public.touch_updated_at();
```

Server-only table (tokens, counters, OAuth state): enable RLS, add **no policies**, `revoke all ... from anon, authenticated`.

Functions: `security definer` only if required, always `set search_path = ''`, `revoke all on function ... from public, anon`, then grant `execute` only to the role that needs it.

## Tests (same change)
Add cases to `supabase/tests/rls.test.sql` and update `plan(n)` to the new total:
- owner can select/insert/update/delete own rows;
- another user sees 0 rows and cannot update/delete them (affected rows = 0);
- inserting a row with another user's `user_id` fails with `42501`;
- changing `user_id` fails with `42501`;
- `anon` gets `42501` on select;
- server-only tables: `authenticated` and `anon` get `42501`.

## Run
1. `supabase db reset` (applies all migrations to the local stack).
2. `supabase test db` — all green.
3. CI guard returns zero rows: `select tablename from pg_tables where schemaname = 'public' and not rowsecurity;`
4. Regenerate types if the project uses them, and run `pnpm typecheck`.

## Finish
- Update `docs/specs/database.md` (schema section) and, for a new endpoint or table class, `docs/specs/security.md` §14.2/§14.5.
- Log the change in `docs/PROGRESS.md` (decisions log if it changes a data decision).
