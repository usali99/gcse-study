-- One-time setup (Usman, 20 Nov 2026): lets Ninegrade's scheduled runs apply future database updates themselves,
-- instead of the owner pasting each script into the SQL Editor.
-- Only the service role (the secret key held in the cloud environment, never in the website or the repo) can call it.
-- Signed-in users and visitors cannot. Every run is logged in ng_sql_log.
-- To switch it off at any time:  drop function public.ng_run_sql(text);
-- Safe to run more than once.

create table if not exists public.ng_sql_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  label text not null default '',
  ok boolean not null,
  error text
);
alter table public.ng_sql_log enable row level security;
revoke all on public.ng_sql_log from anon, authenticated;

create or replace function public.ng_run_sql(script text, label text default '') returns text
language plpgsql security definer set search_path = public as $$
begin
  execute script;
  insert into public.ng_sql_log (label, ok) values (left(label, 200), true);
  return 'ok';
exception when others then
  insert into public.ng_sql_log (label, ok, error) values (left(label, 200), false, left(sqlerrm, 1000));
  raise;
end $$;
revoke all on function public.ng_run_sql(text, text) from public, anon, authenticated;
grant execute on function public.ng_run_sql(text, text) to service_role;
