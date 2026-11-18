-- Invite codes: remember who used each code, and let the maker add or change its note later.
-- Safe to run more than once.
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

-- Codes already used before this change: fill in who used them where the link shows it.
update public.invites i set used_by = array(select g.student_id from public.guardianships g where g.parent_id = i.parent_id)
  where i.uses > 0 and i.parent_id is not null and i.used_by = '{}';
update public.invites i set used_by = array(select cs.student_id from public.class_students cs where cs.class_id = i.class_id)
  where i.uses > 0 and i.class_id is not null and i.used_by = '{}';

drop policy if exists v2_invites_edit on public.invites;
create policy v2_invites_edit on public.invites for update using (created_by = auth.uid() or public.v2_is_platform_admin())
  with check (created_by = auth.uid() or public.v2_is_platform_admin());
revoke update, truncate, references, trigger on public.invites from authenticated, anon;
grant update (note) on public.invites to authenticated;
