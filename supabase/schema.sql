-- GCSE study site: database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- Safe to run again: it only creates what is missing.

-- ---------- Who is who ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

-- Every new login gets a profile. Everyone starts as a student;
-- the parent is made admin with: select public.make_admin('their@email');
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Run from the SQL editor only (not callable from the website).
create or replace function public.make_admin(admin_email text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(admin_email);
  if uid is null then return 'No login found with that email. Add the user first.'; end if;
  insert into public.profiles (id, name, role) values (uid, split_part(admin_email, '@', 1), 'admin')
  on conflict (id) do update set role = 'admin';
  return 'Done: ' || admin_email || ' is now the admin.';
end $$;
revoke execute on function public.make_admin(text) from public, anon, authenticated;

-- ---------- Lessons ----------
create table if not exists public.lessons (
  id text primary key,                 -- e.g. w01-1-mon-a
  week int not null,
  lesson_date date not null,
  slot text not null default 'a',      -- a = first lesson of the day, b = second
  subject text not null check (subject in ('english', 'maths', 'chemistry', 'physics')),
  title text not null,
  minutes int not null default 30,
  body_html text not null,
  quiz jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now()
);

-- Answer sheets live in their own table so the student can never read them.
create table if not exists public.answer_sheets (
  lesson_id text primary key references public.lessons(id) on delete cascade,
  body_html text not null
);

-- ---------- Hadi's work ----------
create table if not exists public.quiz_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id text not null references public.lessons(id) on delete cascade,
  score int not null,
  max int not null,
  answers jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id text not null references public.lessons(id) on delete cascade,
  answer_text text not null default '',
  files text[] not null default '{}',
  minutes_taken int,
  created_at timestamptz not null default now(),
  mark int,
  mark_max int,
  feedback text,
  marked_at timestamptz
);

-- A student cannot mark their own work, whatever they send.
create or replace function public.protect_marks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.mark := null; new.mark_max := null; new.feedback := null; new.marked_at := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists submissions_protect_marks on public.submissions;
create trigger submissions_protect_marks before insert on public.submissions
  for each row execute function public.protect_marks();

-- ---------- Progress ----------
create table if not exists public.weak_topics (
  id bigint generated always as identity primary key,
  subject text not null check (subject in ('english', 'maths', 'chemistry', 'physics')),
  skill text not null,
  paper_q text not null default '',
  status text not null default 'Not yet tested'
    check (status in ('Not yet tested', 'Weak', 'Improving', 'Secure')),
  evidence text not null default '',
  last_tested date,
  sort int not null default 0,
  unique (subject, skill)
);

-- Weekly summaries written at the weekend run (admin only).
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  week int not null unique,
  body_html text not null,
  created_at timestamptz not null default now()
);

-- ---------- Access rules ----------
alter table public.profiles      enable row level security;
alter table public.lessons       enable row level security;
alter table public.answer_sheets enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.submissions   enable row level security;
alter table public.weak_topics   enable row level security;
alter table public.reports       enable row level security;

drop policy if exists "own profile or admin" on public.profiles;
create policy "own profile or admin" on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "published lessons, all for admin" on public.lessons;
create policy "published lessons, all for admin" on public.lessons for select
  using (status = 'published' or public.is_admin());
drop policy if exists "admin edits lessons" on public.lessons;
create policy "admin edits lessons" on public.lessons for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin reads answers" on public.answer_sheets;
create policy "admin reads answers" on public.answer_sheets for select
  using (public.is_admin());

drop policy if exists "own quiz attempts" on public.quiz_attempts;
create policy "own quiz attempts" on public.quiz_attempts for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "add own quiz attempt" on public.quiz_attempts;
create policy "add own quiz attempt" on public.quiz_attempts for insert
  with check (user_id = auth.uid());

drop policy if exists "own submissions" on public.submissions;
create policy "own submissions" on public.submissions for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "add own submission" on public.submissions;
create policy "add own submission" on public.submissions for insert
  with check (user_id = auth.uid());
drop policy if exists "admin marks" on public.submissions;
create policy "admin marks" on public.submissions for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "everyone reads topics" on public.weak_topics;
create policy "everyone reads topics" on public.weak_topics for select
  using (auth.uid() is not null);
drop policy if exists "admin edits topics" on public.weak_topics;
create policy "admin edits topics" on public.weak_topics for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin reads reports" on public.reports;
create policy "admin reads reports" on public.reports for select
  using (public.is_admin());

grant select on public.profiles, public.lessons, public.answer_sheets, public.reports, public.weak_topics to authenticated;
grant update (status) on public.lessons to authenticated;
grant select, insert on public.quiz_attempts, public.submissions to authenticated;
grant update (mark, mark_max, feedback, marked_at) on public.submissions to authenticated;
grant update (status, evidence, last_tested) on public.weak_topics to authenticated;
revoke all on all tables in schema public from anon;

-- ---------- Uploaded photos of written work ----------
insert into storage.buckets (id, name, public)
values ('work', 'work', false)
on conflict (id) do nothing;

drop policy if exists "upload own work" on storage.objects;
create policy "upload own work" on storage.objects for insert to authenticated
  with check (bucket_id = 'work' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "see own work or admin" on storage.objects;
create policy "see own work or admin" on storage.objects for select to authenticated
  using (bucket_id = 'work' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
