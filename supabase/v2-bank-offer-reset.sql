-- A newly offered paper starts with every question unchecked, so a bank manager reads each one before approving.
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
  if offer then
    perform set_config('ng.bank_check', '1', true);
    update public.bank_questions set check_state = '', checked_by = null, checked_at = null where paper_id = pid;
    perform set_config('ng.bank_check', '', true);
  end if;
  insert into public.ng_admin_log (done_by, paper_id, action, note) values (auth.uid(), pid, case when offer then 'Offered to the Ninegrade bank' else 'Offer taken back' end, left(coalesce(offer_note, ''), 500));
  return case when offer then 'offered' else '' end;
end $$;
