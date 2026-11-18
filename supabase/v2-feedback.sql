-- Problem reports ("Report a problem" on quiz questions, lessons and plan weeks).
-- Anyone signed in can send one; they can read their own; only the owner reads all and marks them fixed.
-- Safe to run more than once.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('wrong_answer', 'unclear', 'typo', 'missing_topic', 'other')),
  note text not null default '' check (length(note) <= 1000),
  place text not null check (place in ('quiz', 'lesson', 'plan')),
  ref text not null default '' check (length(ref) <= 100),
  item text not null default '' check (length(item) <= 40),
  context text not null default '' check (length(context) <= 300),
  status text not null default 'new' check (status in ('new', 'fixed', 'not_a_problem')),
  created_at timestamptz not null default now()
);

-- Spam limit: at most 30 reports an hour per person.
create or replace function public.v2_feedback_limits() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.status := 'new'; new.created_at := now(); new.created_by := auth.uid();
  if new.created_by is null then raise exception 'Please sign in to send a report.'; end if;
  if (select count(*) from public.feedback where created_by = new.created_by and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'That''s a lot of reports in one go. Please try again in a while.';
  end if;
  return new;
end $$;
drop trigger if exists v2_feedback_limits on public.feedback;
create trigger v2_feedback_limits before insert on public.feedback for each row execute function public.v2_feedback_limits();

alter table public.feedback enable row level security;
drop policy if exists v2_feedback_add on public.feedback;
create policy v2_feedback_add on public.feedback for insert to authenticated with check (created_by = auth.uid());
drop policy if exists v2_feedback_read on public.feedback;
create policy v2_feedback_read on public.feedback for select to authenticated using (created_by = auth.uid() or public.v2_is_platform_admin());
drop policy if exists v2_feedback_owner_update on public.feedback;
create policy v2_feedback_owner_update on public.feedback for update to authenticated using (public.v2_is_platform_admin()) with check (public.v2_is_platform_admin());
drop policy if exists v2_feedback_owner_delete on public.feedback;
create policy v2_feedback_owner_delete on public.feedback for delete to authenticated using (public.v2_is_platform_admin());

revoke all on public.feedback from anon, authenticated;
grant insert (kind, note, place, ref, item, context) on public.feedback to authenticated;
grant select, delete on public.feedback to authenticated;
grant update (status) on public.feedback to authenticated;
