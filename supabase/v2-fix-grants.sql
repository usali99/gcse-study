-- Fix (18 Nov 2026): Supabase gives signed-in users full table rights by default, so the
-- column limits below need the defaults taken away first. Safe to run more than once.
revoke all on public.people, public.schools, public.school_members, public.classes, public.class_students,
  public.guardianships, public.invites, public.courses from anon, authenticated;
grant select on public.people, public.schools, public.school_members, public.classes, public.class_students, public.guardianships to authenticated;
grant update (full_name) on public.people to authenticated;
grant update (name) on public.schools to authenticated;
grant insert, update (name) on public.classes to authenticated;
grant select, insert, delete on public.invites to authenticated;
grant select, insert, update, delete on public.courses to authenticated;
