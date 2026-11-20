-- 11+ track, stage 1 (Usman, 20 Nov 2026).
--  * Each parent or teacher has track switches: GCSE and/or 11+. A track that is off is hidden from them.
--    Existing accounts start GCSE only. The site owner has both.
--  * Each child has one track (GCSE or 11+). Invite codes carry the tracks they give.
--  * The Ninegrade bank: papers owned by Ninegrade (not a person), so they stay when anyone leaves.
--    The owner and bank managers add to it. Parents with the paper's track can make practice from it, but can't edit it.
--  * Bank managers (given only by the owner) can add Ninegrade papers, switch 11+ on or off for parents and make
--    11+ parent invite codes. Exam board or publisher papers they add wait for the owner's approval.
--  * Parents can offer their own paper to the Ninegrade bank. The owner or a bank manager approves it, asks for
--    changes or turns it down. Once approved it becomes Ninegrade's, marked "contributed by".
--  * Every access change and every bank decision is logged in ng_admin_log.
-- Safe to run more than once. Needs v2-roles.sql, v2-bank.sql and v2-bank-upload.sql.

-- ---------- Tracks ----------
alter table public.people add column if not exists tracks text[] not null default '{gcse}';
alter table public.people add column if not exists is_bank_manager boolean not null default false;
alter table public.invites add column if not exists tracks text[] not null default '{gcse}';
do $$ begin
  alter table public.people add constraint people_tracks_check check (tracks <@ array['gcse', 'elevenplus'] and cardinality(tracks) between 1 and 2);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.invites add constraint invites_tracks_check check (tracks <@ array['gcse', 'elevenplus'] and cardinality(tracks) between 1 and 2);
exception when duplicate_object then null; end $$;
update public.people set tracks = array['gcse', 'elevenplus'] where is_platform_admin and not tracks @> array['gcse', 'elevenplus'];

create table if not exists public.ng_admin_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  done_by uuid references auth.users(id) on delete set null,
  person_id uuid references auth.users(id) on delete set null,
  paper_id uuid,
  action text not null check (length(action) <= 80),
  note text not null default '' check (length(note) <= 500)
);
alter table public.ng_admin_log enable row level security;
revoke all on public.ng_admin_log from anon, authenticated;

create or replace function public.v2_is_bank_manager() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_bank_manager from public.people where id = auth.uid()), false);
$$;
create or replace function public.v2_bank_staff() returns boolean language sql stable security definer set search_path = public as $$
  select public.v2_is_platform_admin() or public.v2_is_bank_manager();
$$;
create or replace function public.v2_my_tracks() returns text[] language sql stable security definer set search_path = public as $$
  select case when public.v2_is_platform_admin() then array['gcse', 'elevenplus']
    else coalesce((select tracks from public.people where id = auth.uid()), '{}') end;
$$;
create or replace function public.v2_has_track(t text) returns boolean language sql stable security definer set search_path = public as $$
  select t = any(public.v2_my_tracks());
$$;

drop policy if exists v2_log_read on public.ng_admin_log;
create policy v2_log_read on public.ng_admin_log for select to authenticated using (public.v2_bank_staff());
grant select on public.ng_admin_log to authenticated;

-- Parents, teachers and schools, with their switches (for the owner and bank managers; bank managers can't otherwise see other parents).
create or replace function public.v2_access_list() returns table (id uuid, full_name text, role text, tracks text[], is_bank_manager boolean, is_platform_admin boolean, children int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.v2_bank_staff() then raise exception 'Only the site owner and bank managers can see this.'; end if;
  return query select p.id, p.full_name, p.role, p.tracks, p.is_bank_manager, p.is_platform_admin,
    (select count(*)::int from public.guardianships g where g.parent_id = p.id)
    from public.people p where p.role <> 'student' order by p.is_platform_admin desc, p.full_name;
end $$;

-- Switch a track on or off for a parent, teacher or school. The owner changes either; bank managers change 11+ only.
create or replace function public.v2_set_access(pid uuid, track text, turn_on boolean) returns text[]
language plpgsql security definer set search_path = public as $$
declare p public.people; nt text[];
begin
  if track not in ('gcse', 'elevenplus') then raise exception 'Unknown track.'; end if;
  if not public.v2_bank_staff() then raise exception 'Only the site owner and bank managers can change access.'; end if;
  if track = 'gcse' and not public.v2_is_platform_admin() then raise exception 'Only the site owner can change GCSE access.'; end if;
  select * into p from public.people where id = pid;
  if p.id is null then raise exception 'Person not found.'; end if;
  if p.role = 'student' then raise exception 'A child''s track is set by their parent.'; end if;
  if p.is_platform_admin then raise exception 'The site owner always has both.'; end if;
  nt := case when turn_on then array(select distinct unnest(p.tracks || track) order by 1)
             else array_remove(p.tracks, track) end;
  if cardinality(nt) = 0 then raise exception 'Leave at least one of GCSE or 11+ switched on.'; end if;
  if nt is distinct from p.tracks then
    update public.people set tracks = nt where id = pid;
    insert into public.ng_admin_log (done_by, person_id, action) values (auth.uid(), pid,
      (case when track = 'gcse' then 'GCSE' else '11+' end) || ' access ' || case when turn_on then 'on' else 'off' end);
  end if;
  return nt;
end $$;

-- Make someone a bank manager, or stop it (owner only). A bank manager also gets 11+ access.
create or replace function public.v2_set_bank_manager(pid uuid, turn_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.people;
begin
  if not public.v2_is_platform_admin() then raise exception 'Only the site owner can choose bank managers.'; end if;
  select * into p from public.people where id = pid;
  if p.id is null or p.role = 'student' then raise exception 'Choose a parent or teacher.'; end if;
  if p.is_platform_admin then raise exception 'The site owner can already do everything.'; end if;
  if p.is_bank_manager is distinct from turn_on then
    update public.people set is_bank_manager = turn_on,
      tracks = case when turn_on then array(select distinct unnest(tracks || 'elevenplus'::text) order by 1) else tracks end where id = pid;
    insert into public.ng_admin_log (done_by, person_id, action) values (auth.uid(), pid, case when turn_on then 'Made bank manager' else 'No longer bank manager' end);
  end if;
  return turn_on;
end $$;

-- A parent sets their child's track (one of the parent's own tracks).
create or replace function public.v2_set_child_track(child uuid, track text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if track not in ('gcse', 'elevenplus') then raise exception 'Unknown track.'; end if;
  if not (public.v2_is_platform_admin() or exists (select 1 from public.guardianships where parent_id = auth.uid() and student_id = child)) then
    raise exception 'You can only change your own child.'; end if;
  if not public.v2_has_track(track) then raise exception 'That track isn''t switched on for your account.'; end if;
  update public.people set tracks = array[track] where id = child and role = 'student';
  return track;
end $$;

-- Invite codes: the tracks a code gives must be ones the maker has. Bank managers can make 11+ parent codes.
drop policy if exists v2_invites_add on public.invites;
create policy v2_invites_add on public.invites for insert with check (
  created_by = auth.uid() and uses = 0 and (
    public.v2_is_platform_admin()
    or (role = 'parent' and public.v2_is_bank_manager() and tracks = array['elevenplus'] and school_id is null and class_id is null and parent_id is null)
    or (tracks <@ public.v2_my_tracks() and (role <> 'student' or cardinality(tracks) = 1) and (
         (role = 'teacher' and school_id is not null and public.v2_in_school(school_id, true) and class_id is null and parent_id is null)
      or (role = 'student' and class_id is not null and parent_id is null and public.v2_class_manager(class_id))
      or (role = 'student' and parent_id = auth.uid() and class_id is null
            and exists (select 1 from public.people where id = auth.uid() and role = 'parent'))))
  ));

-- Sign-up: the new person gets the code's tracks (a child gets one).
create or replace function public.v2_setup_person() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invites; code_in text; sch uuid; tr text[];
begin
  code_in := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  if code_in = '' then return new; end if;
  select * into inv from public.invites where code = code_in for update;
  if inv.code is null then return new; end if;
  update public.invites set uses = uses + 1, used_by = array_append(used_by, new.id) where code = code_in;
  tr := coalesce(inv.tracks, array['gcse']);
  if inv.role = 'student' then tr := array[tr[1]]; end if;
  insert into public.people (id, full_name, role, tracks)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name', ''), 80), inv.role, tr)
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

-- ---------- The Ninegrade bank ----------
alter table public.bank_papers add column if not exists collection text not null default 'own';
alter table public.bank_papers add column if not exists track text not null default 'gcse';
alter table public.bank_papers add column if not exists added_by uuid references auth.users(id) on delete set null;
alter table public.bank_papers add column if not exists contributed_by uuid references auth.users(id) on delete set null;
alter table public.bank_papers add column if not exists review text not null default '';
alter table public.bank_papers add column if not exists review_note text not null default '';
alter table public.bank_papers alter column owner_id drop not null;
do $$ begin
  alter table public.bank_papers add constraint bank_papers_ninegrade_check check (
    collection in ('own', 'ninegrade') and track in ('gcse', 'elevenplus')
    and review in ('', 'offered', 'changes', 'declined', 'pending') and length(review_note) <= 500
    and (collection = 'ninegrade' or owner_id is not null));
exception when duplicate_object then null; end $$;
update public.bank_papers set added_by = owner_id where added_by is null and owner_id is not null;

create or replace function public.v2_bank_can_read(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.v2_bank_user() and exists (select 1 from public.bank_papers p where p.id = pid and (
    p.owner_id = auth.uid() or p.sharing = 'library' or public.v2_is_platform_admin()
    or (p.collection = 'ninegrade' and (public.v2_is_bank_manager() or (p.review = '' and public.v2_has_track(p.track))))
    or (p.review = 'offered' and public.v2_is_bank_manager())
    or (p.sharing in ('shared', 'library_pending', 'library') and exists (select 1 from public.bank_shares s where s.paper_id = p.id and s.person_id = auth.uid()))));
$$;
create or replace function public.v2_bank_can_edit(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.v2_bank_user() and exists (select 1 from public.bank_papers p where p.id = pid and (
    (p.collection = 'own' and p.owner_id = auth.uid()) or public.v2_is_platform_admin()
    or (p.collection = 'ninegrade' and public.v2_is_bank_manager())));
$$;
-- Only the site owner deletes Ninegrade papers. A parent deletes their own.
create or replace function public.v2_bank_can_delete(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.v2_bank_user() and exists (select 1 from public.bank_papers p where p.id = pid and (
    (p.collection = 'own' and p.owner_id = auth.uid()) or public.v2_is_platform_admin()));
$$;

create or replace function public.v2_bank_paper_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('ng.bank_review', true) = '1' then new.updated_at := now(); return new; end if;
  if tg_op = 'INSERT' then
    new.created_at := now(); new.share_code := null; new.reply := ''; new.sharing := 'private';
    new.added_by := auth.uid(); new.contributed_by := null; new.review_note := '';
    new.status := case when new.q_text <> '' or cardinality(new.q_files) > 0 then 'processing' else 'ready' end;
    if not public.v2_has_track(new.track) then raise exception 'That track isn''t switched on for your account.'; end if;
    if new.collection = 'ninegrade' then
      if not public.v2_bank_staff() then raise exception 'Only the site owner and bank managers add to the Ninegrade bank.'; end if;
      new.owner_id := null;
      new.review := case when new.origin in ('exam_board', 'publisher') and not public.v2_is_platform_admin() then 'pending' else '' end;
    else
      new.collection := 'own'; new.owner_id := auth.uid(); new.review := '';
    end if;
    if (select count(*) from public.bank_papers where added_by = auth.uid() and created_at > now() - interval '1 day') >= 50 then
      raise exception 'That is a lot of papers today. Please try again tomorrow.'; end if;
  else
    new.owner_id := old.owner_id; new.source_set := old.source_set; new.status := old.status; new.reply := old.reply;
    new.collection := old.collection; new.added_by := old.added_by; new.contributed_by := old.contributed_by;
    new.review := old.review; new.review_note := old.review_note;
    if new.track <> old.track and not public.v2_has_track(new.track) then raise exception 'That track isn''t switched on for your account.'; end if;
    if new.collection = 'ninegrade' then new.sharing := 'private'; end if;
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

-- A parent offers their own paper to the Ninegrade bank (or takes the offer back while it waits).
create or replace function public.v2_bank_offer(pid uuid, offer boolean, permission boolean, offer_note text default '') returns text
language plpgsql security definer set search_path = public as $$
declare p public.bank_papers;
begin
  select * into p from public.bank_papers where id = pid;
  if p.id is null or p.collection <> 'own' or p.owner_id is distinct from auth.uid() then raise exception 'You can only offer your own papers.'; end if;
  if offer then
    if p.status <> 'ready' then raise exception 'Wait until the paper has been added, then offer it.'; end if;
    if not coalesce(permission, false) then raise exception 'Tick the box to confirm you wrote this paper or have permission, and that Ninegrade may keep and share it.'; end if;
    if p.review = 'offered' then return 'offered'; end if;
  elsif p.review <> 'offered' then return p.review; end if;
  perform set_config('ng.bank_review', '1', true);
  update public.bank_papers set review = case when offer then 'offered' else '' end,
    permission_confirmed = case when offer then true else permission_confirmed end,
    review_note = case when offer then left(coalesce(offer_note, ''), 500) else '' end where id = pid;
  perform set_config('ng.bank_review', '', true);
  insert into public.ng_admin_log (done_by, paper_id, action, note) values (auth.uid(), pid, case when offer then 'Offered to the Ninegrade bank' else 'Offer taken back' end, left(coalesce(offer_note, ''), 500));
  return case when offer then 'offered' else '' end;
end $$;

-- The owner or a bank manager decides on an offer, or the owner decides on a bank manager's exam board or publisher paper.
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

-- A bank manager re-sends a Ninegrade paper the owner asked to change.
create or replace function public.v2_bank_resubmit(pid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p public.bank_papers;
begin
  select * into p from public.bank_papers where id = pid;
  if p.id is null or not public.v2_bank_can_edit(pid) then raise exception 'Not allowed.'; end if;
  if not (p.collection = 'ninegrade' and p.review = 'changes') then raise exception 'This paper isn''t waiting for changes.'; end if;
  perform set_config('ng.bank_review', '1', true);
  update public.bank_papers set review = case when public.v2_is_platform_admin() then '' else 'pending' end where id = pid;
  perform set_config('ng.bank_review', '', true);
  insert into public.ng_admin_log (done_by, paper_id, action) values (auth.uid(), pid, 'Sent again after changes');
  return 'pending';
end $$;

drop policy if exists v2_bp_read on public.bank_papers;
create policy v2_bp_read on public.bank_papers for select to authenticated using (
  (owner_id = auth.uid() and public.v2_bank_user()) or (collection = 'ninegrade' and added_by = auth.uid() and public.v2_bank_staff())
  or public.v2_bank_can_read(id));
drop policy if exists v2_bp_add on public.bank_papers;
create policy v2_bp_add on public.bank_papers for insert to authenticated with check (public.v2_bank_user());
drop policy if exists v2_bp_remove on public.bank_papers;
create policy v2_bp_remove on public.bank_papers for delete to authenticated using (public.v2_bank_can_delete(id));

grant insert (title, subject, note, origin, q_text, q_files, a_text, a_files, collection, track) on public.bank_papers to authenticated;
grant update (title, subject, note, sharing, permission_confirmed, origin, track) on public.bank_papers to authenticated;

-- Names of the people behind papers in the queue and the log (bank managers can't otherwise see other parents).
create or replace function public.v2_bank_names(ids uuid[]) returns table (id uuid, full_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.v2_bank_user() then return; end if;
  return query select p.id, p.full_name from public.people p where p.id = any(ids) and p.role <> 'student';
end $$;

revoke all on function public.v2_is_bank_manager(), public.v2_bank_staff(), public.v2_my_tracks(), public.v2_has_track(text),
  public.v2_access_list(), public.v2_set_access(uuid, text, boolean), public.v2_set_bank_manager(uuid, boolean),
  public.v2_set_child_track(uuid, text), public.v2_bank_can_delete(uuid), public.v2_bank_offer(uuid, boolean, boolean, text),
  public.v2_bank_review(uuid, text, text), public.v2_bank_resubmit(uuid), public.v2_bank_names(uuid[]) from public, anon;
grant execute on function public.v2_is_bank_manager(), public.v2_bank_staff(), public.v2_my_tracks(), public.v2_has_track(text),
  public.v2_access_list(), public.v2_set_access(uuid, text, boolean), public.v2_set_bank_manager(uuid, boolean),
  public.v2_set_child_track(uuid, text), public.v2_bank_can_delete(uuid), public.v2_bank_offer(uuid, boolean, boolean, text),
  public.v2_bank_review(uuid, text, text), public.v2_bank_resubmit(uuid), public.v2_bank_names(uuid[]) to authenticated;
