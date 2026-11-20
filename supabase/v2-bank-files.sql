-- Bank uploads clean-up (Usman chose 20 Nov 2026): once a paper's questions and answers are saved as text, the evening
-- run deletes its uploaded question/answer files 30 days after it became ready. The text stays. Safe to run again.
alter table public.bank_papers add column if not exists ready_at timestamptz;
alter table public.bank_papers add column if not exists files_removed_at timestamptz;
update public.bank_papers set ready_at = coalesce(updated_at, created_at) where status = 'ready' and ready_at is null;
-- Stamp ready_at whenever a paper becomes ready (the runs set status with the service role).
create or replace function public.v2_bank_ready_at() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ready' and (tg_op = 'INSERT' or old.status is distinct from 'ready') then new.ready_at := now(); end if;
  return new;
end $$;
drop trigger if exists v2_bank_ready_at on public.bank_papers;
create trigger v2_bank_ready_at before insert or update on public.bank_papers for each row execute function public.v2_bank_ready_at();
