-- Students who have a parent or a teacher can SEE their course plans and timetable but not change them.
-- A student working on their own (no parent, no class) can still manage their own plans.
-- Safe to run more than once.
create or replace function public.v2_can_edit_plan(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when auth.uid() = sid then
      not exists (select 1 from public.guardianships where student_id = sid)
      and not exists (select 1 from public.class_students where student_id = sid)
    else public.v2_can_manage_student(sid) end;
$$;

drop policy if exists v2_courses_add on public.courses;
create policy v2_courses_add on public.courses for insert with check (created_by = auth.uid() and public.v2_can_edit_plan(student_id));
drop policy if exists v2_courses_edit on public.courses;
create policy v2_courses_edit on public.courses for update using (public.v2_can_edit_plan(student_id)) with check (public.v2_can_edit_plan(student_id));
drop policy if exists v2_courses_remove on public.courses;
create policy v2_courses_remove on public.courses for delete using (public.v2_can_edit_plan(student_id));
