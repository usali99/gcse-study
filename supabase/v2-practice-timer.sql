-- Mock and quiz timer: how often the student left the page during a timed try, and for how long (the timer pauses then).
alter table public.practice_attempts add column if not exists away_count int check (away_count between 0 and 1000);
alter table public.practice_attempts add column if not exists away_seconds int check (away_seconds between 0 and 864000);
grant insert (away_count, away_seconds) on public.practice_attempts to authenticated;
