-- Question bank (Usman, 20 Nov 2026). A parent's or teacher's uploaded paper is saved once as separate questions with
-- their answers. They can make practice from it at any time (how many, which ones), share it with other parents or
-- teachers by a share code, or offer it to the Ninegrade library (the site owner approves). Students never see the bank
-- or the answers; each family's tries and marks stay private.
-- Safe to run more than once. Needs v2-practice.sql and v2-practice-answers.sql first.

create table if not exists public.bank_papers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  subject text not null check (length(subject) between 1 and 60),
  note text not null default '' check (length(note) <= 500),
  sharing text not null default 'private' check (sharing in ('private', 'shared', 'library_pending', 'library')),
  share_code text unique,
  permission_confirmed boolean not null default false,
  source_set uuid references public.practice_sets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.bank_questions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.bank_papers(id) on delete cascade,
  position int not null default 0,
  num text not null default '' check (length(num) <= 12),
  section text not null default '' check (length(section) <= 120),
  question text not null check (length(question) between 1 and 5000),
  marks int not null default 1 check (marks between 0 and 50),
  topic text not null default '' check (length(topic) <= 80)
);
create index if not exists bank_questions_paper on public.bank_questions (paper_id, position);
create table if not exists public.bank_answers (
  question_id uuid primary key references public.bank_questions(id) on delete cascade,
  answer text not null default '' check (length(answer) <= 5000)
);
create table if not exists public.bank_shares (
  paper_id uuid not null references public.bank_papers(id) on delete cascade,
  person_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (paper_id, person_id)
);
-- Per child, per question: the mark from the latest marked try (written by the evening/Saturday run).
create table if not exists public.bank_results (
  student_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.bank_questions(id) on delete cascade,
  mark int not null, mark_max int not null,
  marked_at timestamptz not null default now(),
  primary key (student_id, question_id)
);
alter table public.practice_sets add column if not exists bank_question_ids uuid[] not null default '{}';
alter table public.practice_sets add column if not exists bank_paper_id uuid references public.bank_papers(id) on delete set null;

-- Who may use the bank: parents, teachers, school admins and the site owner (never students).
create or replace function public.v2_bank_user() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people where id = auth.uid() and (role <> 'student' or is_platform_admin));
$$;
create or replace function public.v2_bank_can_read(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.v2_bank_user() and exists (select 1 from public.bank_papers p where p.id = pid and (
    p.owner_id = auth.uid() or p.sharing = 'library' or public.v2_is_platform_admin()
    or (p.sharing in ('shared', 'library_pending', 'library') and exists (select 1 from public.bank_shares s where s.paper_id = p.id and s.person_id = auth.uid()))));
$$;
create or replace function public.v2_bank_can_edit(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.v2_bank_user() and exists (select 1 from public.bank_papers p where p.id = pid and (p.owner_id = auth.uid() or public.v2_is_platform_admin()));
$$;

-- Papers: owner set on insert; only the site owner can approve for the library; 50 new papers a day.
create or replace function public.v2_bank_paper_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid(); new.created_at := now(); new.share_code := null;
    if new.sharing not in ('private') then new.sharing := 'private'; end if;
    if (select count(*) from public.bank_papers where owner_id = auth.uid() and created_at > now() - interval '1 day') >= 50 then
      raise exception 'That is a lot of papers today. Please try again tomorrow.'; end if;
  else
    new.owner_id := old.owner_id; new.source_set := old.source_set;
    if new.sharing = 'library' and old.sharing <> 'library' and not public.v2_is_platform_admin() then
      raise exception 'The site owner approves papers for the library.'; end if;
    if new.sharing in ('shared', 'library_pending', 'library') and not new.permission_confirmed then
      raise exception 'Please confirm you wrote this paper or have permission to share it.'; end if;
    if new.sharing = 'private' then new.share_code := null; delete from public.bank_shares where paper_id = new.id; end if;
    if new.sharing <> 'private' and new.share_code is null then new.share_code := upper(substr(md5(gen_random_uuid()::text), 1, 8)); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists v2_bank_paper_guard on public.bank_papers;
create trigger v2_bank_paper_guard before insert or update on public.bank_papers for each row execute function public.v2_bank_paper_guard();

-- Join a shared paper with its code.
create or replace function public.v2_bank_join(code text) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if not public.v2_bank_user() then raise exception 'Only parents and teachers can use the question bank.'; end if;
  select id into pid from public.bank_papers where share_code = upper(trim(code)) and sharing <> 'private';
  if pid is null then raise exception 'That code doesn''t match a shared paper. Check it with the person who shared it.'; end if;
  if (select count(*) from public.bank_shares where person_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'That is a lot of papers today. Please try again tomorrow.'; end if;
  insert into public.bank_shares (paper_id, person_id) values (pid, auth.uid()) on conflict do nothing;
  return pid;
end $$;

-- Make a practice set from chosen bank questions, ready straight away (status draft, answer sheet built from the
-- bank's answers). The parent or teacher checks it and assigns it as usual.
create or replace function public.v2_bank_make_set(sid uuid, pid uuid, qids uuid[], set_title text, set_minutes int,
  set_due date, set_replaces boolean) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; body text := ''; ans text := ''; sec text := null; q record; pap record; n int := 0; total int := 0;
  esc_q text;
begin
  if not public.v2_practice_staff(sid) then raise exception 'You can only make practice for your own students.'; end if;
  if not public.v2_bank_can_read(pid) then raise exception 'You don''t have this paper.'; end if;
  if coalesce(cardinality(qids), 0) = 0 then raise exception 'Choose at least one question.'; end if;
  if cardinality(qids) > 60 then raise exception 'Choose 60 questions or fewer.'; end if;
  if (select count(*) from public.practice_sets where created_by = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'You have made a lot of practice today. Please try again tomorrow.'; end if;
  select * into pap from public.bank_papers where id = pid;
  for q in select bq.*, coalesce(ba.answer, '') as answer from public.bank_questions bq left join public.bank_answers ba on ba.question_id = bq.id
           where bq.paper_id = pid and bq.id = any(qids) order by bq.position loop
    n := n + 1; total := total + q.marks;
    if q.section <> '' and q.section is distinct from sec then
      body := body || '<h2>' || replace(replace(replace(q.section, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</h2>'; sec := q.section; end if;
    esc_q := replace(replace(replace(replace(q.question, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), E'\n', '<br>');
    body := body || '<p><b>' || coalesce(nullif(q.num, ''), n::text) || '.</b> ' || esc_q || ' <span class="marks">(' || q.marks || ' mark' || case when q.marks = 1 then '' else 's' end || ')</span></p>';
    ans := ans || '<p><b>' || coalesce(nullif(q.num, ''), n::text) || '.</b> ' || replace(replace(replace(replace(q.answer, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), E'\n', '<br>')
      || ' <b>(' || q.marks || ')</b></p>';
  end loop;
  if n = 0 then raise exception 'Those questions are not in this paper.'; end if;
  body := '<div class="header"><p><b>' || replace(replace(pap.title, '&', '&amp;'), '<', '&lt;') || '</b> · ' || n || ' question' || case when n = 1 then '' else 's' end
    || ' · ' || total || ' marks</p></div><p><i>Answer all questions. Show your working for calculations and include units.</i></p>' || body;
  ans := '<p><b>For the parent only.</b> From the question bank: ' || replace(replace(pap.title, '&', '&amp;'), '<', '&lt;')
    || '. The paper''s own answers are the baseline; correct answers in the student''s own words get full marks.</p>' || ans || '<p><b>Total: ' || total || ' marks.</b></p>';
  perform set_config('ng.bank_make', '1', true);
  insert into public.practice_sets (student_id, subject, kind, title, minutes, due_date, replaces_lessons, as_is)
    values (sid, pap.subject, 'practice', left(coalesce(nullif(trim(set_title), ''), pap.title), 120), set_minutes, set_due, coalesce(set_replaces, false), true)
    returning id into new_id;
  update public.practice_sets set status = 'draft', body_html = body, bank_question_ids = qids, bank_paper_id = pid,
    reply = 'Made straight away from the question bank: ' || n || ' question' || case when n = 1 then '' else 's' end || ', ' || total || ' marks. Check it, then assign it.'
    where id = new_id;
  perform set_config('ng.bank_make', '', true);
  insert into public.practice_answers (set_id, body_html) values (new_id, ans) on conflict (set_id) do update set body_html = excluded.body_html;
  return new_id;
end $$;

-- Let v2_bank_make_set move its own new set straight to draft.
create or replace function public.v2_practice_edit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('ng.bank_make', true) = '1' then new.updated_at := now(); return new; end if;
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

alter table public.bank_papers enable row level security;
alter table public.bank_questions enable row level security;
alter table public.bank_answers enable row level security;
alter table public.bank_shares enable row level security;
alter table public.bank_results enable row level security;

drop policy if exists v2_bp_read on public.bank_papers;
create policy v2_bp_read on public.bank_papers for select to authenticated using ((owner_id = auth.uid() and public.v2_bank_user()) or public.v2_bank_can_read(id));
drop policy if exists v2_bp_add on public.bank_papers;
create policy v2_bp_add on public.bank_papers for insert to authenticated with check (public.v2_bank_user());
drop policy if exists v2_bp_edit on public.bank_papers;
create policy v2_bp_edit on public.bank_papers for update to authenticated using (public.v2_bank_can_edit(id)) with check (public.v2_bank_can_edit(id));
drop policy if exists v2_bp_remove on public.bank_papers;
create policy v2_bp_remove on public.bank_papers for delete to authenticated using (public.v2_bank_can_edit(id));

drop policy if exists v2_bq_read on public.bank_questions;
create policy v2_bq_read on public.bank_questions for select to authenticated using (public.v2_bank_can_read(paper_id));
drop policy if exists v2_bq_write on public.bank_questions;
create policy v2_bq_write on public.bank_questions for all to authenticated using (public.v2_bank_can_edit(paper_id)) with check (public.v2_bank_can_edit(paper_id));

drop policy if exists v2_ba_read on public.bank_answers;
create policy v2_ba_read on public.bank_answers for select to authenticated using (
  exists (select 1 from public.bank_questions q where q.id = question_id and public.v2_bank_can_read(q.paper_id)));
drop policy if exists v2_ba_write on public.bank_answers;
create policy v2_ba_write on public.bank_answers for all to authenticated using (
  exists (select 1 from public.bank_questions q where q.id = question_id and public.v2_bank_can_edit(q.paper_id)))
  with check (exists (select 1 from public.bank_questions q where q.id = question_id and public.v2_bank_can_edit(q.paper_id)));

drop policy if exists v2_bs_read on public.bank_shares;
create policy v2_bs_read on public.bank_shares for select to authenticated using (
  person_id = auth.uid() or public.v2_bank_can_edit(paper_id));
drop policy if exists v2_bs_leave on public.bank_shares;
create policy v2_bs_leave on public.bank_shares for delete to authenticated using (
  person_id = auth.uid() or public.v2_bank_can_edit(paper_id));

drop policy if exists v2_br_read on public.bank_results;
create policy v2_br_read on public.bank_results for select to authenticated using (public.v2_practice_staff(student_id) or public.v2_is_platform_admin());

revoke all on public.bank_papers, public.bank_questions, public.bank_answers, public.bank_shares, public.bank_results from anon, authenticated;
grant select on public.bank_papers, public.bank_questions, public.bank_answers, public.bank_shares, public.bank_results to authenticated;
grant insert (title, subject, note) on public.bank_papers to authenticated;
grant update (title, subject, note, sharing, permission_confirmed) on public.bank_papers to authenticated;
grant delete on public.bank_papers to authenticated;
grant insert (paper_id, position, num, section, question, marks, topic) on public.bank_questions to authenticated;
grant update (position, num, section, question, marks, topic) on public.bank_questions to authenticated;
grant delete on public.bank_questions to authenticated;
grant insert (question_id, answer), update (answer) on public.bank_answers to authenticated;
grant delete on public.bank_shares to authenticated;
revoke all on function public.v2_bank_join(text) from public, anon;
grant execute on function public.v2_bank_join(text) to authenticated;
revoke all on function public.v2_bank_make_set(uuid, uuid, uuid[], text, int, date, boolean) from public, anon;
grant execute on function public.v2_bank_make_set(uuid, uuid, uuid[], text, int, date, boolean) to authenticated;
