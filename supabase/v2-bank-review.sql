-- Bank approvals: check question by question (Usman, 21 Nov 2026).
-- The owner or a bank manager reads each question of a paper waiting for approval against its uploaded answer and marks
-- it "Looks correct" or fixes it (the correct answer, and the question wording or marks if needed). Every fix is logged in
-- bank_corrections (who, when, old and new). A paper can only be approved once every question is checked; asking for
-- changes or turning it down needs a reason. The runs flag doubtful questions (missing answer, answer added by Ninegrade,
-- answer that looks wrong) so reviewers see them first. Reviewers can open the uploaded pages of papers they review.
-- Safe to run more than once. Needs v2-elevenplus.sql.

alter table public.bank_questions add column if not exists check_state text not null default '';
alter table public.bank_questions add column if not exists checked_by uuid references auth.users(id) on delete set null;
alter table public.bank_questions add column if not exists checked_at timestamptz;
alter table public.bank_questions add column if not exists flag text not null default '';
do $$ begin
  alter table public.bank_questions add constraint bank_questions_check_state check (check_state in ('', 'ok', 'fixed') and length(flag) <= 200);
exception when duplicate_object then null; end $$;
-- Papers already in the bank before this change count as checked.
update public.bank_questions q set check_state = 'ok' from public.bank_papers p
  where p.id = q.paper_id and q.check_state = '' and p.review = '' and p.created_at < now();

create table if not exists public.bank_corrections (
  id bigint generated always as identity primary key,
  paper_id uuid not null references public.bank_papers(id) on delete cascade,
  question_id uuid references public.bank_questions(id) on delete set null,
  field text not null check (field in ('answer', 'question', 'marks')),
  old_value text not null default '', new_value text not null default '',
  done_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists bank_corrections_paper on public.bank_corrections (paper_id, created_at);
alter table public.bank_corrections enable row level security;
revoke all on public.bank_corrections from anon, authenticated;
grant select on public.bank_corrections to authenticated;
drop policy if exists v2_bc_read on public.bank_corrections;
create policy v2_bc_read on public.bank_corrections for select to authenticated using (public.v2_bank_staff() or public.v2_bank_can_edit(paper_id));

-- Who may check a paper: the owner or a bank manager, for a parent's offer or any Ninegrade bank paper.
create or replace function public.v2_bank_reviewable(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.v2_bank_staff() and exists (select 1 from public.bank_papers p where p.id = pid and (p.review = 'offered' or p.collection = 'ninegrade'));
$$;

-- Mark one question: ok = true "Looks correct"; ok = false with a fix (answer, and optionally question or marks); ok = null undoes.
create or replace function public.v2_bank_check(qid uuid, ok boolean, new_answer text default null, new_question text default null, new_marks int default null)
returns text language plpgsql security definer set search_path = public as $$
declare q public.bank_questions; old_ans text; changed boolean := false;
begin
  select * into q from public.bank_questions where id = qid;
  if q.id is null or not public.v2_bank_reviewable(q.paper_id) then raise exception 'Only the site owner and bank managers check papers waiting for approval.'; end if;
  perform set_config('ng.bank_check', '1', true);
  if ok is null then
    update public.bank_questions set check_state = '', checked_by = null, checked_at = null where id = qid;
  elsif ok then
    update public.bank_questions set check_state = 'ok', checked_by = auth.uid(), checked_at = now() where id = qid;
  else
    select coalesce(answer, '') into old_ans from public.bank_answers where question_id = qid;
    old_ans := coalesce(old_ans, '');
    if new_answer is not null and trim(new_answer) <> '' and trim(new_answer) <> old_ans then
      insert into public.bank_answers (question_id, answer) values (qid, left(trim(new_answer), 5000))
        on conflict (question_id) do update set answer = excluded.answer;
      insert into public.bank_corrections (paper_id, question_id, field, old_value, new_value, done_by) values (q.paper_id, qid, 'answer', old_ans, left(trim(new_answer), 5000), auth.uid());
      changed := true;
    end if;
    if new_question is not null and trim(new_question) <> '' and trim(new_question) <> q.question then
      update public.bank_questions set question = left(trim(new_question), 5000) where id = qid;
      insert into public.bank_corrections (paper_id, question_id, field, old_value, new_value, done_by) values (q.paper_id, qid, 'question', q.question, left(trim(new_question), 5000), auth.uid());
      changed := true;
    end if;
    if new_marks is not null and new_marks <> q.marks then
      if new_marks < 0 or new_marks > 50 then raise exception 'Marks must be 0 to 50.'; end if;
      update public.bank_questions set marks = new_marks where id = qid;
      insert into public.bank_corrections (paper_id, question_id, field, old_value, new_value, done_by) values (q.paper_id, qid, 'marks', q.marks::text, new_marks::text, auth.uid());
      changed := true;
    end if;
    if not changed then perform set_config('ng.bank_check', '', true); raise exception 'Type the correct answer (or fix the question or marks) first.'; end if;
    update public.bank_questions set check_state = 'fixed', checked_by = auth.uid(), checked_at = now(), flag = '' where id = qid;
  end if;
  perform set_config('ng.bank_check', '', true);
  return coalesce((select check_state from public.bank_questions where id = qid), '');
end $$;

-- If anyone else changes a question or its answer later, it needs checking again.
create or replace function public.v2_bank_q_recheck() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('ng.bank_check', true) = '1' then return new; end if;
  if tg_table_name = 'bank_questions' then
    if new.question is distinct from old.question or new.marks is distinct from old.marks then new.check_state := ''; new.checked_by := null; new.checked_at := null; end if;
    if tg_op = 'UPDATE' and (new.check_state is distinct from old.check_state or new.flag is distinct from old.flag) and not (new.question is distinct from old.question or new.marks is distinct from old.marks) then
      new.check_state := old.check_state; new.checked_by := old.checked_by; new.checked_at := old.checked_at; new.flag := old.flag; end if;
  else
    perform set_config('ng.bank_check', '1', true);
    update public.bank_questions set check_state = '', checked_by = null, checked_at = null where id = new.question_id and check_state <> '';
    perform set_config('ng.bank_check', '', true);
  end if;
  return new;
end $$;
drop trigger if exists v2_bank_q_recheck on public.bank_questions;
create trigger v2_bank_q_recheck before update on public.bank_questions for each row execute function public.v2_bank_q_recheck();
drop trigger if exists v2_bank_a_recheck on public.bank_answers;
create trigger v2_bank_a_recheck after insert or update on public.bank_answers for each row execute function public.v2_bank_q_recheck();

-- Reviewers can open the uploaded pages of papers they check.
drop policy if exists "practice read bank review" on storage.objects;
create policy "practice read bank review" on storage.objects for select to authenticated
  using (bucket_id = 'practice' and public.v2_bank_staff() and exists (select 1 from public.bank_papers p
    where (p.review = 'offered' or p.collection = 'ninegrade') and (name = any(p.q_files) or name = any(p.a_files))));

create or replace function public.v2_bank_review(pid uuid, decision text, review_text text default '') returns text
language plpgsql security definer set search_path = public as $$
declare p public.bank_papers; owner_only boolean;
begin
  if decision not in ('approve', 'changes', 'decline') then raise exception 'Choose approve, ask for changes or turn down.'; end if;
  if not public.v2_bank_staff() then raise exception 'Only the site owner and bank managers decide on Ninegrade bank papers.'; end if;
  select * into p from public.bank_papers where id = pid;
  if p.id is null then raise exception 'Paper not found.'; end if;
  owner_only := p.origin in ('exam_board', 'publisher');
  if owner_only and decision = 'approve' and not public.v2_is_platform_admin() then
    raise exception 'Exam board and publisher papers need the site owner''s approval.'; end if;
  if decision = 'approve' and exists (select 1 from public.bank_questions q where q.paper_id = pid and q.check_state = '') then
    raise exception 'Check every question first (% still to check).', (select count(*) from public.bank_questions q where q.paper_id = pid and q.check_state = ''); end if;
  if decision = 'approve' and not exists (select 1 from public.bank_questions q where q.paper_id = pid) then
    raise exception 'This paper has no questions yet.'; end if;
  if decision <> 'approve' and coalesce(trim(review_text), '') = '' then raise exception 'Add a short reason, so they know what to change.'; end if;
  perform set_config('ng.bank_review', '1', true);
  if p.collection = 'own' and p.review = 'offered' then
    if decision = 'approve' then
      delete from public.bank_shares where paper_id = pid;
      update public.bank_papers set collection = 'ninegrade', contributed_by = owner_id, owner_id = null, review = '',
        review_note = left(coalesce(review_text, ''), 500), sharing = 'private', share_code = null where id = pid;
    else
      update public.bank_papers set review = case when decision = 'changes' then 'changes' else 'declined' end,
        review_note = left(coalesce(review_text, ''), 500) where id = pid;
    end if;
  elsif p.collection = 'ninegrade' and p.review in ('pending', 'changes', 'declined') then
    if not public.v2_is_platform_admin() then raise exception 'The site owner decides on this paper.'; end if;
    update public.bank_papers set review = case decision when 'approve' then '' when 'changes' then 'changes' else 'declined' end,
      review_note = left(coalesce(review_text, ''), 500) where id = pid;
  else
    perform set_config('ng.bank_review', '', true);
    raise exception 'This paper isn''t waiting for a decision.';
  end if;
  perform set_config('ng.bank_review', '', true);
  insert into public.ng_admin_log (done_by, person_id, paper_id, action, note) values (auth.uid(), coalesce(p.owner_id, p.added_by), pid,
    case decision when 'approve' then 'Approved for the Ninegrade bank' when 'changes' then 'Asked for changes' else 'Turned down' end, left(coalesce(review_text, ''), 500));
  return decision;
end $$;


revoke all on function public.v2_bank_reviewable(uuid), public.v2_bank_check(uuid, boolean, text, text, int) from public, anon;
grant execute on function public.v2_bank_reviewable(uuid), public.v2_bank_check(uuid, boolean, text, text, int) to authenticated;
