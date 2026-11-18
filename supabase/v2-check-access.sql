-- Read-only check: signs in as each account in turn (inside the database) and counts
-- what that account can see. It also tries two things that should be refused, and
-- undoes them if they ever succeed. Safe to run any time; changes nothing.
create or replace function pg_temp.v2_check()
returns table (account text, account_type text, people_seen int, schools_seen int, classes_seen int,
  class_links_seen int, parent_links_seen int, courses_seen int, codes_seen int,
  can_make_self_owner text, can_add_course_for_hadi text, can_make_school_code text)
language plpgsql as $$
declare
  p record; hadi uuid; t1 text; t2 text; t3 text;
begin
  select g.student_id into hadi from public.guardianships g
    join public.people pp on pp.id = g.parent_id where pp.is_platform_admin limit 1;
  for p in select * from public.people order by created_at loop
    perform set_config('request.jwt.claims', json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p.id::text, true);
    execute 'set local role authenticated';
    account := p.full_name; account_type := p.role || case when p.is_platform_admin then ' (owner)' else '' end;
    select count(*) into people_seen from public.people;
    select count(*) into schools_seen from public.schools;
    select count(*) into classes_seen from public.classes;
    select count(*) into class_links_seen from public.class_students;
    select count(*) into parent_links_seen from public.guardianships;
    select count(*) into courses_seen from public.courses;
    select count(*) into codes_seen from public.invites;
    t1 := 'no'; t2 := 'no'; t3 := 'no';
    begin
      update public.people set is_platform_admin = true, role = 'school_admin' where id = p.id;
      if found then t1 := 'YES'; end if; raise exception 'undo';
    exception when others then null; end;
    begin
      insert into public.courses (student_id, board, qualification, subject, exam_date, start_date)
      values (hadi, 'Check', 'GCSE', 'Check', '2028-05-15', '2026-11-18');
      t2 := 'YES'; raise exception 'undo';
    exception when others then null; end;
    begin
      insert into public.invites (code, role, note) values ('CHECK0001', 'school_admin', 'check');
      t3 := 'YES'; raise exception 'undo';
    exception when others then null; end;
    can_make_self_owner := t1; can_add_course_for_hadi := t2; can_make_school_code := t3;
    execute 'reset role';
    return next;
  end loop;
end $$;

select * from pg_temp.v2_check();
