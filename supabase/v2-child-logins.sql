-- Child logins without an email: a parent creates a username login for their child.
-- The child's hidden login address is child-<username>@ninegrade.co.uk (no mail is ever sent to it).
-- This lets a parent set a new password for their own username child. Safe to run more than once.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.v2_set_child_password(child uuid, new_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare e text;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if length(coalesce(new_password, '')) < 8 then raise exception 'Use at least 8 characters for the password.'; end if;
  if not exists (select 1 from public.guardianships where parent_id = auth.uid() and student_id = child) then
    raise exception 'You can only change passwords for your own children.';
  end if;
  select email into e from auth.users where id = child;
  if e is null or e !~ '^child-[a-z0-9]{3,20}@ninegrade\.co\.uk$' then
    raise exception 'This child signs in with their own email, so they can use Forgot password instead.';
  end if;
  update auth.users set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')), updated_at = now() where id = child;
  return 'Password changed.';
end $$;
revoke execute on function public.v2_set_child_password(uuid, text) from public, anon;
grant execute on function public.v2_set_child_password(uuid, text) to authenticated;

-- Usernames of the signed-in parent's username children (so the dashboard can show them).
create or replace function public.v2_child_usernames() returns table (id uuid, username text)
language sql stable security definer set search_path = public as $$
  select u.id, substring(u.email from '^child-([a-z0-9]{3,20})@ninegrade\.co\.uk$')
  from auth.users u join public.guardianships g on g.student_id = u.id
  where g.parent_id = auth.uid() and u.email ~ '^child-[a-z0-9]{3,20}@ninegrade\.co\.uk$';
$$;
revoke execute on function public.v2_child_usernames() from public, anon;
grant execute on function public.v2_child_usernames() to authenticated;
