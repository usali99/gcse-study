-- Keep Hadi's lessons, marks and weak topics private to Hadi and the parent (the two
-- accounts in public.profiles), now that invite-code sign-ups are switched on.
-- Safe to run more than once.
create or replace function public.v1_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;
grant execute on function public.v1_member() to authenticated;

drop policy if exists "published lessons, all for admin" on public.lessons;
create policy "published lessons, all for admin" on public.lessons for select
  using ((status = 'published' and public.v1_member()) or public.is_admin());

drop policy if exists "add own quiz attempt" on public.quiz_attempts;
create policy "add own quiz attempt" on public.quiz_attempts for insert
  with check (user_id = auth.uid() and public.v1_member());

drop policy if exists "add own submission" on public.submissions;
create policy "add own submission" on public.submissions for insert
  with check (user_id = auth.uid() and public.v1_member());

drop policy if exists "everyone reads topics" on public.weak_topics;
create policy "everyone reads topics" on public.weak_topics for select
  using (public.v1_member());

drop policy if exists "upload own work" on storage.objects;
create policy "upload own work" on storage.objects for insert to authenticated
  with check (bucket_id = 'work' and (storage.foldername(name))[1] = auth.uid()::text and public.v1_member());
