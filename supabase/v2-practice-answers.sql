-- Practice from the parent's own paper (20 Nov 2026):
--  * practice_sets.as_is: use the uploaded questions exactly as they are (otherwise Ninegrade writes similar new questions).
--  * practice_answers.given_text / given_files: the parent's own answer sheet or mark scheme. The run marks against it.
--    Like every answer sheet it is for parents and teachers only, never the student.
-- Safe to run more than once.

alter table public.practice_sets add column if not exists as_is boolean not null default false;
grant insert (student_id, subject, kind, title, source_text, source_files, note, due_date, minutes, based_on, replaces_lessons, as_is)
  on public.practice_sets to authenticated;

alter table public.practice_answers add column if not exists given_text text not null default '';
alter table public.practice_answers add column if not exists given_files text[] not null default '{}';
do $$ begin
  alter table public.practice_answers add constraint practice_answers_given_size
    check (length(given_text) <= 50000 and cardinality(given_files) <= 10);
exception when duplicate_object then null; end $$;

-- Whoever made the request (and may edit the student's plan) can attach their answer sheet once, while it is still
-- being prepared. Reading stays as before: parents and teachers only.
drop policy if exists v2_pa_add on public.practice_answers;
create policy v2_pa_add on public.practice_answers for insert to authenticated with check (
  exists (select 1 from public.practice_sets s where s.id = set_id and s.created_by = auth.uid()
          and s.status = 'requested' and public.v2_can_edit_plan(s.student_id)));
grant insert (set_id, given_text, given_files) on public.practice_answers to authenticated;
