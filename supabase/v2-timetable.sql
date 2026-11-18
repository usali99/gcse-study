-- Weekly timetable: which days each course is studied (1 = Monday ... 7 = Sunday).
-- Safe to run more than once. Existing table grants already cover the new column.
alter table public.courses add column if not exists study_days smallint[] not null default '{}';
alter table public.courses drop constraint if exists courses_study_days_ok;
alter table public.courses add constraint courses_study_days_ok check (study_days <@ array[1,2,3,4,5,6,7]::smallint[]);
