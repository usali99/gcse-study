-- GCSE Study, version 2: schools, teachers, parents, students, invite codes, course plans.
-- Adds new tables only. Hadi's current site (lessons, marking, weak topics) keeps working unchanged.
-- Paste into Supabase > SQL Editor > New query, then Run. Safe to run again.

-- ---------- People ----------
create table if not exists public.people (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null check (role in ('school_admin', 'teacher', 'parent', 'student')),
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.school_members (
  school_id uuid not null references public.schools(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher')),
  primary key (school_id, person_id)
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.people(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.class_students (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.people(id) on delete cascade,
  primary key (class_id, student_id)
);

create table if not exists public.guardianships (
  parent_id uuid not null references public.people(id) on delete cascade,
  student_id uuid not null references public.people(id) on delete cascade,
  primary key (parent_id, student_id)
);

-- ---------- Invite codes (sign-up is invite only) ----------
create table if not exists public.invites (
  code text primary key check (code ~ '^[A-Z0-9]{6,16}$'),
  role text not null check (role in ('school_admin', 'teacher', 'parent', 'student')),
  school_id uuid references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  parent_id uuid references public.people(id) on delete cascade,
  note text not null default '',
  max_uses int not null default 1 check (max_uses between 1 and 200),
  uses int not null default 0,
  expires_at timestamptz not null default now() + interval '30 days',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Courses and plans ----------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.people(id) on delete cascade,
  board text not null,
  qualification text not null,
  subject text not null,
  code text not null default '',
  tier text not null default '',
  exam_date date not null,
  start_date date not null,
  hours_per_week numeric not null default 2 check (hours_per_week > 0 and hours_per_week <= 20),
  plan jsonb not null default '[]',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- Who can see whom ----------
create or replace function public.v2_is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from public.people where id = auth.uid()), false);
$$;

-- The school a student belongs to, through their classes.
create or replace function public.v2_student_schools(sid uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct c.school_id from public.class_students cs join public.classes c on c.id = cs.class_id
  where cs.student_id = sid and c.school_id is not null;
$$;

-- Can the signed-in person look after this student (see and plan their courses)?
create or replace function public.v2_can_manage_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() = sid
    or public.v2_is_platform_admin()
    or exists (select 1 from public.guardianships where parent_id = auth.uid() and student_id = sid)
    or exists (select 1 from public.class_students cs join public.classes c on c.id = cs.class_id
               where cs.student_id = sid and c.teacher_id = auth.uid())
    or exists (select 1 from public.school_members m where m.person_id = auth.uid() and m.role = 'admin'
               and m.school_id in (select public.v2_student_schools(sid)));
$$;

create or replace function public.v2_class_manager(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes c where c.id = cid and (c.teacher_id = auth.uid()
    or exists (select 1 from public.school_members m where m.school_id = c.school_id and m.person_id = auth.uid() and m.role = 'admin')));
$$;

create or replace function public.v2_in_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_students where class_id = cid and student_id = auth.uid());
$$;

create or replace function public.v2_in_school(sch uuid, want_admin boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.school_members where school_id = sch and person_id = auth.uid()
                 and (not want_admin or role = 'admin'));
$$;

create or replace function public.v2_can_see_person(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = auth.uid() or public.v2_can_manage_student(pid)
    -- people in the same school
    or exists (select 1 from public.school_members a join public.school_members b on a.school_id = b.school_id
               where a.person_id = auth.uid() and b.person_id = pid)
    -- a student's own parents and teachers
    or exists (select 1 from public.guardianships where student_id = auth.uid() and parent_id = pid)
    or exists (select 1 from public.class_students cs join public.classes c on c.id = cs.class_id
               where cs.student_id = auth.uid() and c.teacher_id = pid);
$$;

-- ---------- Sign-up: check the invite code, then set up the new person ----------
create or replace function public.v2_check_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invites; code_in text;
begin
  code_in := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  if code_in = '' then
    -- Every new account needs an invite code, including ones added in the Supabase dashboard.
    raise exception 'An invite code is needed to sign up.';
  end if;
  select * into inv from public.invites where code = code_in for update;
  if inv.code is null or inv.uses >= inv.max_uses or inv.expires_at < now() then
    raise exception 'That invite code is not valid or has already been used.';
  end if;
  return new;
end $$;

alter table public.invites add column if not exists used_by uuid[] not null default '{}';

create or replace function public.v2_setup_person() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invites; code_in text; sch uuid;
begin
  code_in := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  if code_in = '' then return new; end if;
  select * into inv from public.invites where code = code_in for update;
  if inv.code is null then return new; end if;
  update public.invites set uses = uses + 1, used_by = array_append(used_by, new.id) where code = code_in;
  insert into public.people (id, full_name, role)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name', ''), 80), inv.role)
  on conflict (id) do nothing;
  if inv.role = 'school_admin' then
    insert into public.schools (name) values (left(coalesce(nullif(new.raw_user_meta_data->>'school_name', ''), 'My school'), 120))
    returning id into sch;
    insert into public.school_members values (sch, new.id, 'admin');
  elsif inv.role = 'teacher' and inv.school_id is not null then
    insert into public.school_members values (inv.school_id, new.id, 'teacher') on conflict do nothing;
  elsif inv.role = 'student' then
    if inv.parent_id is not null then
      insert into public.guardianships values (inv.parent_id, new.id) on conflict do nothing;
    end if;
    if inv.class_id is not null then
      insert into public.class_students values (inv.class_id, new.id) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists v2_before_signup on auth.users;
create trigger v2_before_signup before insert on auth.users
  for each row execute function public.v2_check_invite();
drop trigger if exists v2_after_signup on auth.users;
create trigger v2_after_signup after insert on auth.users
  for each row execute function public.v2_setup_person();

-- Keep new invite-code accounts out of Hadi's current site (its own profiles table).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ? 'invite_code' then return new; end if;
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

-- Run from the SQL editor: give an existing login a version-2 role, and optionally platform-admin rights.
create or replace function public.v2_add_person(person_email text, person_role text, full_name text, platform_admin boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(person_email);
  if uid is null then return 'No login found with that email.'; end if;
  insert into public.people (id, full_name, role, is_platform_admin) values (uid, full_name, person_role, platform_admin)
  on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, is_platform_admin = excluded.is_platform_admin;
  return 'Done: ' || person_email || ' is a ' || person_role || case when platform_admin then ' and the platform admin.' else '.' end;
end $$;
revoke execute on function public.v2_add_person(text, text, text, boolean) from public, anon, authenticated;

-- Link an existing student to a parent (SQL editor only), e.g. Hadi to Usman.
create or replace function public.v2_link_parent(parent_email text, student_email text) returns text
language plpgsql security definer set search_path = public as $$
declare p uuid; s uuid;
begin
  select id into p from auth.users where lower(email) = lower(parent_email);
  select id into s from auth.users where lower(email) = lower(student_email);
  if p is null or s is null then return 'Check both emails.'; end if;
  insert into public.guardianships values (p, s) on conflict do nothing;
  return 'Linked.';
end $$;
revoke execute on function public.v2_link_parent(text, text) from public, anon, authenticated;

-- ---------- Access rules ----------
alter table public.people         enable row level security;
alter table public.schools        enable row level security;
alter table public.school_members enable row level security;
alter table public.classes        enable row level security;
alter table public.class_students enable row level security;
alter table public.guardianships  enable row level security;
alter table public.invites        enable row level security;
alter table public.courses        enable row level security;

drop policy if exists v2_people_read on public.people;
create policy v2_people_read on public.people for select using (public.v2_can_see_person(id));
drop policy if exists v2_people_name on public.people;
create policy v2_people_name on public.people for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists v2_schools_read on public.schools;
create policy v2_schools_read on public.schools for select
  using (public.v2_in_school(id, false) or public.v2_is_platform_admin() or id in (select public.v2_student_schools(auth.uid())));
drop policy if exists v2_schools_rename on public.schools;
create policy v2_schools_rename on public.schools for update using (public.v2_in_school(id, true)) with check (public.v2_in_school(id, true));

drop policy if exists v2_members_read on public.school_members;
create policy v2_members_read on public.school_members for select
  using (public.v2_in_school(school_id, false) or public.v2_is_platform_admin());

drop policy if exists v2_classes_read on public.classes;
create policy v2_classes_read on public.classes for select
  using (public.v2_class_manager(id) or public.v2_in_class(id) or public.v2_is_platform_admin());
drop policy if exists v2_classes_add on public.classes;
create policy v2_classes_add on public.classes for insert
  with check (teacher_id = auth.uid() and (school_id is null or public.v2_in_school(school_id, false)));
drop policy if exists v2_classes_edit on public.classes;
create policy v2_classes_edit on public.classes for update
  using (teacher_id = auth.uid() or public.v2_in_school(school_id, true))
  with check (teacher_id = auth.uid() or public.v2_in_school(school_id, true));

drop policy if exists v2_class_students_read on public.class_students;
create policy v2_class_students_read on public.class_students for select
  using (student_id = auth.uid() or public.v2_class_manager(class_id) or public.v2_is_platform_admin());

drop policy if exists v2_guardianships_read on public.guardianships;
create policy v2_guardianships_read on public.guardianships for select
  using (parent_id = auth.uid() or student_id = auth.uid() or public.v2_is_platform_admin());

-- Who may create which invite code.
drop policy if exists v2_invites_read on public.invites;
create policy v2_invites_read on public.invites for select using (created_by = auth.uid() or public.v2_is_platform_admin());
drop policy if exists v2_invites_add on public.invites;
create policy v2_invites_add on public.invites for insert with check (
  created_by = auth.uid() and uses = 0 and (
    public.v2_is_platform_admin()
    or (role = 'teacher' and school_id is not null and public.v2_in_school(school_id, true) and class_id is null and parent_id is null)
    or (role = 'student' and class_id is not null and parent_id is null and public.v2_class_manager(class_id))
    or (role = 'student' and parent_id = auth.uid() and class_id is null
          and exists (select 1 from public.people where id = auth.uid() and role = 'parent'))
  ));
drop policy if exists v2_invites_remove on public.invites;
create policy v2_invites_remove on public.invites for delete using (created_by = auth.uid() or public.v2_is_platform_admin());

drop policy if exists v2_courses_read on public.courses;
create policy v2_courses_read on public.courses for select using (public.v2_can_manage_student(student_id));
drop policy if exists v2_courses_add on public.courses;
create policy v2_courses_add on public.courses for insert with check (created_by = auth.uid() and public.v2_can_manage_student(student_id));
drop policy if exists v2_courses_edit on public.courses;
create policy v2_courses_edit on public.courses for update using (public.v2_can_manage_student(student_id)) with check (public.v2_can_manage_student(student_id));
drop policy if exists v2_courses_remove on public.courses;
create policy v2_courses_remove on public.courses for delete using (public.v2_can_manage_student(student_id));

-- Supabase grants signed-in users full table rights by default: take them away first.
revoke all on public.people, public.schools, public.school_members, public.classes, public.class_students,
  public.guardianships, public.invites, public.courses from authenticated;
grant select on public.people, public.schools, public.school_members, public.classes, public.class_students, public.guardianships to authenticated;
grant update (full_name) on public.people to authenticated;
grant update (name) on public.schools to authenticated;
grant insert, update (name) on public.classes to authenticated;
grant select, insert, delete on public.invites to authenticated;
grant select, insert, update, delete on public.courses to authenticated;
revoke all on public.people, public.schools, public.school_members, public.classes, public.class_students,
  public.guardianships, public.invites, public.courses from anon;
