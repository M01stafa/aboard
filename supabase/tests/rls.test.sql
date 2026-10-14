begin;
select plan(17);

-- 1. Insert test users into auth.users (trigger creates profiles)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');

-- 2. Act as User A
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

-- Profile visibility for User A
select is((select count(*)::int from public.profiles), 1, 'A sees own profile only');

-- Project creation and visibility for User A
insert into public.projects (id, title, storage) values ('11111111-1111-1111-1111-111111111111', 'A project', 'local');
select is((select count(*)::int from public.projects), 1, 'A sees own project');

-- 3. Act as User B
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';

-- Profile visibility for User B
select is((select count(*)::int from public.profiles), 1, 'B sees own profile only');

-- Project isolation: B cannot see, update, or delete A's project
select is((select count(*)::int from public.projects), 0, 'B sees nothing of A');
with u as (update public.projects set title = 'hacked' where id = '11111111-1111-1111-1111-111111111111' returning 1)
  select is((select count(*)::int from u), 0, 'B cannot update A project');
with d as (delete from public.projects where id = '11111111-1111-1111-1111-111111111111' returning 1)
  select is((select count(*)::int from d), 0, 'B cannot delete A project');

-- B cannot update A's profile
with up as (update public.profiles set default_storage = 'drive' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select is((select count(*)::int from up), 0, 'B cannot update A profile');

-- B cannot insert a row owned by A
select throws_ok($$insert into public.projects (id, user_id, title, storage)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 'local')$$,
  '42501', null, 'B cannot insert for A');

-- B cannot change ownership of its own row (user_id is immutable)
insert into public.projects (id, title, storage) values ('22222222-2222-2222-2222-222222222222', 'B project', 'local');
select throws_ok($$update public.projects set user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = '22222222-2222-2222-2222-222222222222'$$, '42501', null, 'user_id is immutable on projects');

-- 4. Server-only tables are unreachable for authenticated users
select throws_ok($$select * from public.google_drive_links$$, '42501', null, 'tokens table: permission denied');
select throws_ok($$select * from public.oauth_states$$,       '42501', null, 'oauth_states: permission denied');
select throws_ok($$select * from public.rate_limits$$,        '42501', null, 'rate_limits: permission denied');

-- 5. Anonymous role has no access at all
set local role anon;
select throws_ok($$select * from public.projects$$,           '42501', null, 'anon: permission denied on projects');
select throws_ok($$select * from public.profiles$$,           '42501', null, 'anon: permission denied on profiles');
select throws_ok($$select * from public.google_drive_links$$, '42501', null, 'anon: permission denied on google_drive_links');
select throws_ok($$select * from public.oauth_states$$,       '42501', null, 'anon: permission denied on oauth_states');
select throws_ok($$select * from public.rate_limits$$,        '42501', null, 'anon: permission denied on rate_limits');

select * from finish();
rollback;
