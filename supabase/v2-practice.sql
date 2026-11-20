-- Practice sets: a parent, teacher or self-study student pastes text or uploads a file and asks for a
-- lesson, quiz, practice questions or a mock. The evening run turns each request into a draft, the parent
-- checks it and assigns it, the student does it (any number of tries) and the evening run marks it.
-- Answer sheets live in their own table that students can never read.
-- Safe to run more than once.

create table if not exists public.practice_sets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null check (length(subject) between 1 and 60),
  kind text not null check (kind in ('lesson', 'quiz', 'practice', 'mock')),
  title text not null default '' check (length(title) <= 120),
  source_text text not null default '' check (length(source_text) <= 50000),
  source_files text[] not null default '{}' check (cardinality(source_files) <= 10),
  note text not null default '' check (length(note) <= 1000),
  due_date date,
  minutes int check (minutes between 5 and 240),
  based_on uuid references public.practice_sets(id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'draft', 'assigned', 'archived')),
  body_html text not null default '',
  quiz jsonb not null default '[]',
  reply text not null default '' check (length(reply) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists practice_sets_student on public.practice_sets (student_id, created_at desc);

create table if not exists public.practice_answers (
  set_id uuid primary key references public.practice_sets(id) on delete cascade,
  body_html text not null default ''
);

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.practice_sets(id) on delete cascade,
  student_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  answer_text text not null default '' check (length(answer_text) <= 20000),
  files text[] not null default '{}' check (cardinality(files) <= 12),
  quiz_answers jsonb not null default '[]',
  quiz_score int, quiz_max int,
  minutes_taken int check (minutes_taken between 0 and 600),
  mark int, mark_max int,
  feedback text check (length(feedback) <= 5000),
  marked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists practice_attempts_set on public.practice_attempts (set_id, created_at desc);

-- Who can make and manage practice for a student: their parent or teacher (or school admin), or the
-- student themselves only when nobody manages them (same rule as editing plans).
-- "Staff" below means managing someone else's practice, which is what lets you see answer sheets and mark.
create or replace function public.v2_practice_staff(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() <> sid and public.v2_can_manage_student(sid);
$$;

-- New requests: fill in who and when, force a clean starting state, and allow at most 30 a day per person.
create or replace function public.v2_practice_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid(); new.status := 'requested'; new.body_html := ''; new.quiz := '[]'; new.reply := '';
  new.created_at := now(); new.updated_at := now();
  if new.created_by is null then raise exception 'Please sign in first.'; end if;
  if (select count(*) from public.practice_sets where created_by = new.created_by and created_at > now() - interval '1 day') >= 30 then
    raise exception 'You have asked for a lot of practice today. Please try again tomorrow.';
  end if;
  return new;
end $$;
drop trigger if exists v2_practice_new on public.practice_sets;
create trigger v2_practice_new before insert on public.practice_sets for each row execute function public.v2_practice_new();

-- Changes from the website: only these status moves are allowed (the evening run uses the service key and
-- is not limited): draft -> assigned, anything -> requested (ask for changes), anything -> archived,
-- assigned -> draft (take it back).
create or replace function public.v2_practice_edit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if;
  if new.status <> old.status and not (
       (old.status = 'draft' and new.status = 'assigned')
    or new.status in ('requested', 'archived')
    or (old.status = 'assigned' and new.status = 'draft')
    or (old.status = 'archived' and new.status in ('assigned', 'draft') and old.body_html <> '')) then
    raise exception 'That change is not allowed.';
  end if;
  if new.status = 'assigned' and old.body_html = '' then raise exception 'This set is not ready yet.'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists v2_practice_edit on public.practice_sets;
create trigger v2_practice_edit before update on public.practice_sets for each row execute function public.v2_practice_edit();

-- Attempts: the student sends work only for a set assigned to them. 40 a day at most.
create or replace function public.v2_practice_attempt_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.student_id := auth.uid(); new.mark := null; new.mark_max := null; new.feedback := null; new.marked_at := null; new.created_at := now();
  if not exists (select 1 from public.practice_sets s where s.id = new.set_id and s.student_id = auth.uid() and s.status = 'assigned') then
    raise exception 'This practice set is not open for answers.';
  end if;
  if (select count(*) from public.practice_attempts where student_id = new.student_id and created_at > now() - interval '1 day') >= 40 then
    raise exception 'That is a lot of tries today. Please try again tomorrow.';
  end if;
  return new;
end $$;
drop trigger if exists v2_practice_attempt_new on public.practice_attempts;
create trigger v2_practice_attempt_new before insert on public.practice_attempts for each row execute function public.v2_practice_attempt_new();

alter table public.practice_sets enable row level security;
alter table public.practice_answers enable row level security;
alter table public.practice_attempts enable row level security;

drop policy if exists v2_ps_read on public.practice_sets;
create policy v2_ps_read on public.practice_sets for select to authenticated using (
  public.v2_can_edit_plan(student_id) or public.v2_is_platform_admin()
  or (student_id = auth.uid() and status in ('assigned', 'archived')));
drop policy if exists v2_ps_add on public.practice_sets;
create policy v2_ps_add on public.practice_sets for insert to authenticated
  with check (public.v2_can_edit_plan(student_id));
drop policy if exists v2_ps_edit on public.practice_sets;
create policy v2_ps_edit on public.practice_sets for update to authenticated
  using (public.v2_can_edit_plan(student_id)) with check (public.v2_can_edit_plan(student_id));
drop policy if exists v2_ps_remove on public.practice_sets;
create policy v2_ps_remove on public.practice_sets for delete to authenticated
  using (public.v2_can_edit_plan(student_id) and status in ('requested', 'draft'));

-- Answer sheets: parents and teachers only, never the student (not even a student working on their own).
drop policy if exists v2_pa_read on public.practice_answers;
create policy v2_pa_read on public.practice_answers for select to authenticated using (
  exists (select 1 from public.practice_sets s where s.id = set_id and (public.v2_practice_staff(s.student_id) or public.v2_is_platform_admin())));

drop policy if exists v2_pt_read on public.practice_attempts;
create policy v2_pt_read on public.practice_attempts for select to authenticated using (
  student_id = auth.uid() or public.v2_practice_staff(student_id) or public.v2_is_platform_admin());
drop policy if exists v2_pt_add on public.practice_attempts;
create policy v2_pt_add on public.practice_attempts for insert to authenticated with check (student_id = auth.uid());
drop policy if exists v2_pt_mark on public.practice_attempts;
create policy v2_pt_mark on public.practice_attempts for update to authenticated
  using (public.v2_practice_staff(student_id)) with check (public.v2_practice_staff(student_id));

revoke all on public.practice_sets, public.practice_answers, public.practice_attempts from anon, authenticated;
grant select on public.practice_sets, public.practice_answers, public.practice_attempts to authenticated;
grant insert (student_id, subject, kind, title, source_text, source_files, note, due_date, minutes, based_on) on public.practice_sets to authenticated;
grant update (title, note, due_date, status) on public.practice_sets to authenticated;
grant delete on public.practice_sets to authenticated;
grant insert (set_id, answer_text, files, quiz_answers, quiz_score, quiz_max, minutes_taken) on public.practice_attempts to authenticated;
grant update (mark, mark_max, feedback, marked_at) on public.practice_attempts to authenticated;

-- Files: uploads go in a private "practice" bucket under the uploader's own folder.
-- A parent or teacher can also open files in their student's folder (the student's photos of their work).
insert into storage.buckets (id, name, public, file_size_limit)
values ('practice', 'practice', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

drop policy if exists "practice upload own" on storage.objects;
create policy "practice upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'practice' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "practice read" on storage.objects;
create policy "practice read" on storage.objects for select to authenticated
  using (bucket_id = 'practice' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.v2_practice_staff(((storage.foldername(name))[1])::uuid))));
