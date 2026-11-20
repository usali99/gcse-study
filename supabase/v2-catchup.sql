-- Stop work piling up (20 Nov 2026):
--  * lessons.catch_up: a missed lesson the Saturday run has moved to the catch-up list (or into next week).
--  * lessons.auto_published: published by the Sunday evening run because the parent hadn't checked the week
--    and has "publish anyway" switched on. The parent can mark it checked.
--  * away_days: illness, holidays, exam days. No lessons are made for them.
--  * study_settings: per-student settings (auto_publish).
--  * practice_sets.replaces_lessons: practice "instead of" this week's lessons in that subject.
-- Safe to run more than once.

alter table public.lessons add column if not exists catch_up boolean not null default false;
alter table public.lessons add column if not exists auto_published boolean not null default false;
grant update (status, auto_published) on public.lessons to authenticated;

alter table public.practice_sets add column if not exists replaces_lessons boolean not null default false;
grant insert (student_id, subject, kind, title, source_text, source_files, note, due_date, minutes, based_on, replaces_lessons) on public.practice_sets to authenticated;

create table if not exists public.away_days (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text not null default 'other' check (reason in ('ill', 'holiday', 'exam', 'other')),
  note text not null default '' check (length(note) <= 200),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (to_date >= from_date and to_date - from_date <= 60)
);
create index if not exists away_days_student on public.away_days (student_id, from_date);

create or replace function public.v2_away_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid(); new.created_at := now();
  if new.created_by is null then raise exception 'Please sign in first.'; end if;
  if (select count(*) from public.away_days where created_by = new.created_by and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That is a lot of away days today. Please try again tomorrow.';
  end if;
  return new;
end $$;
drop trigger if exists v2_away_new on public.away_days;
create trigger v2_away_new before insert on public.away_days for each row execute function public.v2_away_new();

alter table public.away_days enable row level security;
drop policy if exists v2_away_read on public.away_days;
create policy v2_away_read on public.away_days for select to authenticated
  using (public.v2_can_manage_student(student_id) or public.v2_is_platform_admin());
drop policy if exists v2_away_add on public.away_days;
create policy v2_away_add on public.away_days for insert to authenticated with check (public.v2_can_edit_plan(student_id));
drop policy if exists v2_away_remove on public.away_days;
create policy v2_away_remove on public.away_days for delete to authenticated using (public.v2_can_edit_plan(student_id));
revoke all on public.away_days from anon, authenticated;
grant select, delete on public.away_days to authenticated;
grant insert (student_id, from_date, to_date, reason, note) on public.away_days to authenticated;

create table if not exists public.study_settings (
  student_id uuid primary key references auth.users(id) on delete cascade,
  auto_publish boolean not null default false,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create or replace function public.v2_settings_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_by := auth.uid(); new.updated_at := now(); return new; end $$;
drop trigger if exists v2_settings_touch on public.study_settings;
create trigger v2_settings_touch before insert or update on public.study_settings for each row execute function public.v2_settings_touch();

alter table public.study_settings enable row level security;
drop policy if exists v2_set_read on public.study_settings;
create policy v2_set_read on public.study_settings for select to authenticated
  using (public.v2_can_manage_student(student_id) or public.v2_is_platform_admin());
drop policy if exists v2_set_add on public.study_settings;
create policy v2_set_add on public.study_settings for insert to authenticated with check (public.v2_can_edit_plan(student_id));
drop policy if exists v2_set_edit on public.study_settings;
create policy v2_set_edit on public.study_settings for update to authenticated
  using (public.v2_can_edit_plan(student_id)) with check (public.v2_can_edit_plan(student_id));
revoke all on public.study_settings from anon, authenticated;
grant select on public.study_settings to authenticated;
grant insert (student_id, auto_publish) on public.study_settings to authenticated;
grant update (student_id, auto_publish) on public.study_settings to authenticated;
