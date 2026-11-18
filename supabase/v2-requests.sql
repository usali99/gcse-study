-- Invite requests: anyone can ask for an invite code; only the owner can read them.
-- Safe to run more than once.
create table if not exists public.invite_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 1 and 80),
  email text not null check (length(email) between 3 and 120 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('school_admin', 'teacher', 'parent', 'student')),
  note text not null default '' check (length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now()
);

-- Spam limits: one request per email a day, and at most 30 requests an hour in total.
create or replace function public.v2_request_limits() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.status := 'new'; new.created_at := now(); new.email := lower(trim(new.email));
  if exists (select 1 from public.invite_requests where email = new.email and created_at > now() - interval '1 day') then
    raise exception 'We already have a request from this email. We''ll be in touch soon.';
  end if;
  if (select count(*) from public.invite_requests where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many requests right now. Please try again later.';
  end if;
  return new;
end $$;
drop trigger if exists v2_request_limits on public.invite_requests;
create trigger v2_request_limits before insert on public.invite_requests for each row execute function public.v2_request_limits();

alter table public.invite_requests enable row level security;
drop policy if exists v2_requests_add on public.invite_requests;
create policy v2_requests_add on public.invite_requests for insert to anon, authenticated with check (true);
drop policy if exists v2_requests_owner_read on public.invite_requests;
create policy v2_requests_owner_read on public.invite_requests for select to authenticated using (public.v2_is_platform_admin());
drop policy if exists v2_requests_owner_update on public.invite_requests;
create policy v2_requests_owner_update on public.invite_requests for update to authenticated using (public.v2_is_platform_admin()) with check (public.v2_is_platform_admin());
drop policy if exists v2_requests_owner_delete on public.invite_requests;
create policy v2_requests_owner_delete on public.invite_requests for delete to authenticated using (public.v2_is_platform_admin());

revoke all on public.invite_requests from anon, authenticated;
grant insert (full_name, email, role, note) on public.invite_requests to anon, authenticated;
grant select, delete on public.invite_requests to authenticated;
grant update (status) on public.invite_requests to authenticated;
