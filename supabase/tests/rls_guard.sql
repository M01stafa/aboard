begin;
select plan(1);

select is_empty(
  $$select tablename from pg_tables where schemaname = 'public' and not rowsecurity$$,
  'Every public table must have row-level security enabled'
);

select * from finish();
rollback;
