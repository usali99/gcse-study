-- Question bank, part 2 (Usman, 20 Nov 2026): add a paper straight to the bank (questions + answers, uploaded or
-- pasted, and where it's from). The evening run splits it into questions. Practice sets from the bank can be practice
-- questions or a mock (ready at once) or a quiz or lesson (made by the evening run from only those questions).
-- Safe to run more than once. Needs v2-bank.sql.

alter table public.bank_papers add column if not exists status text not null default 'ready';
alter table public.bank_papers add column if not exists origin text not null default 'own';
alter table public.bank_papers add column if not exists q_text text not null default '';
alter table public.bank_papers add column if not exists q_files text[] not null default '{}';
alter table public.bank_papers add column if not exists a_text text not null default '';
alter table public.bank_papers add column if not exists a_files text[] not null default '{}';
alter table public.bank_papers add column if not exists reply text not null default '';
do $$ begin
  alter table public.bank_papers add constraint bank_papers_upload_check check (
    status in ('processing', 'ready', 'failed') and origin in ('own', 'exam_board', 'publisher', 'other')
    and length(q_text) <= 50000 and length(a_text) <= 50000 and cardinality(q_files) <= 20 and cardinality(a_files) <= 20
    and length(reply) <= 1000);
exception when duplicate_object then null; end $$;

create or replace function public.v2_bank_paper_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid(); new.created_at := now(); new.share_code := null; new.reply := '';
    if new.sharing not in ('private') then new.sharing := 'private'; end if;
    new.status := case when new.q_text <> '' or cardinality(new.q_files) > 0 then 'processing' else 'ready' end;
    if (select count(*) from public.bank_papers where owner_id = auth.uid() and created_at > now() - interval '1 day') >= 50 then
      raise exception 'That is a lot of papers today. Please try again tomorrow.'; end if;
  else
    new.owner_id := old.owner_id; new.source_set := old.source_set; new.status := old.status; new.reply := old.reply;
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

grant insert (title, subject, note, origin, q_text, q_files, a_text, a_files) on public.bank_papers to authenticated;
grant update (title, subject, note, sharing, permission_confirmed, origin) on public.bank_papers to authenticated;

-- Make a set from the bank. practice / mock: ready at once. quiz / lesson: sent to the evening run (status requested),
-- which must use only these questions and the bank's answers.
drop function if exists public.v2_bank_make_set(uuid, uuid, uuid[], text, int, date, boolean);
create or replace function public.v2_bank_make_set(sid uuid, pid uuid, qids uuid[], set_title text, set_minutes int,
  set_due date, set_replaces boolean, set_kind text default 'practice') returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; body text := ''; ans text := ''; sec text := null; q record; pap record; n int := 0; total int := 0;
  esc_q text; k text := coalesce(set_kind, 'practice'); ttl text;
begin
  if k not in ('practice', 'mock', 'quiz', 'lesson') then raise exception 'Choose practice, mock, quiz or lesson.'; end if;
  if not public.v2_practice_staff(sid) then raise exception 'You can only make practice for your own students.'; end if;
  if not public.v2_bank_can_read(pid) then raise exception 'You don''t have this paper.'; end if;
  if coalesce(cardinality(qids), 0) = 0 then raise exception 'Choose at least one question.'; end if;
  if cardinality(qids) > 100 then raise exception 'Choose 100 questions or fewer.'; end if;
  if (select count(*) from public.practice_sets where created_by = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'You have made a lot of practice today. Please try again tomorrow.'; end if;
  select * into pap from public.bank_papers where id = pid;
  if pap.status <> 'ready' then raise exception 'This paper is still being added. Try again after the evening run.'; end if;
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
  ttl := replace(replace(pap.title, '&', '&amp;'), '<', '&lt;');
  body := '<div class="header"><p><b>' || ttl || '</b> · ' || n || ' question' || case when n = 1 then '' else 's' end || ' · ' || total || ' marks'
    || case when k = 'mock' and set_minutes is not null then ' · ' || set_minutes || ' minutes' else '' end || '</p></div>'
    || case when k = 'mock' then '<div class="msg info"><p><b>Mock exam.</b> Work on your own, without notes. '
         || case when set_minutes is not null then 'Time allowed: ' || set_minutes || ' minutes. ' else '' end
         || 'Total: ' || total || ' marks. Answer all questions. Show your working for calculations and include units.</p></div>'
       else '<p><i>Answer all questions. Show your working for calculations and include units.</i></p>' end || body;
  ans := '<p><b>For the parent only.</b> From the question bank: ' || ttl
    || '. The paper''s own answers are the baseline; correct answers in the student''s own words get full marks.</p>' || ans || '<p><b>Total: ' || total || ' marks.</b></p>';
  perform set_config('ng.bank_make', '1', true);
  insert into public.practice_sets (student_id, subject, kind, title, minutes, due_date, replaces_lessons, as_is, note)
    values (sid, pap.subject, k, left(coalesce(nullif(trim(set_title), ''), pap.title), 120), set_minutes, set_due, coalesce(set_replaces, false), true,
      case when k in ('quiz', 'lesson') then 'From the question bank: use ONLY these ' || n || ' questions and their bank answers.' else '' end)
    returning id into new_id;
  if k in ('practice', 'mock') then
    update public.practice_sets set status = 'draft', body_html = body, bank_question_ids = qids, bank_paper_id = pid,
      reply = 'Made straight away from the question bank: ' || n || ' question' || case when n = 1 then '' else 's' end || ', ' || total || ' marks. Check it, then assign it.'
      where id = new_id;
    insert into public.practice_answers (set_id, body_html) values (new_id, ans) on conflict (set_id) do update set body_html = excluded.body_html;
  else
    update public.practice_sets set bank_question_ids = qids, bank_paper_id = pid where id = new_id;
  end if;
  perform set_config('ng.bank_make', '', true);
  return new_id;
end $$;
revoke all on function public.v2_bank_make_set(uuid, uuid, uuid[], text, int, date, boolean, text) from public, anon;
grant execute on function public.v2_bank_make_set(uuid, uuid, uuid[], text, int, date, boolean, text) to authenticated;
