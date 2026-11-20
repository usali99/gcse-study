-- Question bank: original and similar questions (Usman, 20 Nov 2026).
--  * Every paper added (by the owner, a bank manager or a parent) is tagged "original": the questions as uploaded.
--  * When Ninegrade writes similar NEW questions from a paper (e.g. "10 similar questions from Mock A"), they are saved
--    as a separate paper tagged "similar", linked to the original (source_paper_id), and put in the Ninegrade bank.
--  * The bank's "Make practice" gains "Similar new questions" (made by the evening run).
-- Safe to run more than once. Needs v2-elevenplus.sql.
alter table public.bank_papers add column if not exists kind text not null default 'original';
alter table public.bank_papers add column if not exists source_paper_id uuid references public.bank_papers(id) on delete set null;
do $$ begin
  alter table public.bank_papers add constraint bank_papers_kind_check check (kind in ('original', 'similar'));
exception when duplicate_object then null; end $$;
create index if not exists bank_papers_source on public.bank_papers (source_paper_id);

create or replace function public.v2_bank_make_set(sid uuid, pid uuid, qids uuid[], set_title text, set_minutes int,
  set_due date, set_replaces boolean, set_kind text default 'practice') returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; body text := ''; ans text := ''; sec text := null; q record; pap record; n int := 0; total int := 0;
  esc_q text; k text := coalesce(set_kind, 'practice'); ttl text;
begin
  if k not in ('practice', 'mock', 'quiz', 'lesson', 'similar') then raise exception 'Choose practice, mock, quiz, lesson or similar questions.'; end if;
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
    values (sid, pap.subject, case when k = 'similar' then 'practice' else k end, left(coalesce(nullif(trim(set_title), ''), pap.title), 120), set_minutes, set_due, coalesce(set_replaces, false), k <> 'similar',
      case when k in ('quiz', 'lesson') then 'From the question bank: use ONLY these ' || n || ' questions and their bank answers.'
           when k = 'similar' then 'From the question bank: write ' || n || ' SIMILAR NEW questions (same topics, style, difficulty and marks) based on these, with answers. Save them to the Ninegrade bank as similar questions of "' || pap.title || '".'
           else '' end)
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
