-- "Update next week's lessons": a parent (or anyone who manages the student) asks for next week's
-- lessons to be rewritten after changing the plan or timetable. The evening run picks up new requests.
-- Safe to run more than once.
create table if not exists public.lesson_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note text not null default '' check (length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'done')),
  reply text not null default '' check (length(reply) <= 500),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

-- Fill in who and when on the server, and allow at most 10 requests a day per person.
create or replace function public.v2_lesson_request_limits() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.requested_by := auth.uid(); new.status := 'new'; new.reply := ''; new.created_at := now(); new.done_at := null;
  if new.requested_by is null then raise exception 'Please sign in first.'; end if;
  if (select count(*) from public.lesson_requests where requested_by = new.requested_by and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have asked a lot of times today. Please try again tomorrow.';
  end if;
  return new;
end $$;
drop trigger if exists v2_lesson_request_limits on public.lesson_requests;
create trigger v2_lesson_request_limits before insert on public.lesson_requests for each row execute function public.v2_lesson_request_limits();

alter table public.lesson_requests enable row level security;
drop policy if exists v2_lr_add on public.lesson_requests;
create policy v2_lr_add on public.lesson_requests for insert to authenticated
  with check (requested_by = auth.uid() and public.v2_can_manage_student(student_id));
drop policy if exists v2_lr_read on public.lesson_requests;
create policy v2_lr_read on public.lesson_requests for select to authenticated
  using (public.v2_can_manage_student(student_id) or public.v2_is_platform_admin());

revoke all on public.lesson_requests from anon, authenticated;
grant insert (student_id, note) on public.lesson_requests to authenticated;
grant select on public.lesson_requests to authenticated;
