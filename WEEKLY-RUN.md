# Weekend run

Instructions for the scheduled Claude session that runs every Saturday. It needs the project folder
`/mnt/project-files/` and admin access to Supabase. The service key is a network secret in the cloud
environment (the proxy adds `Authorization: Bearer <key>` for the Supabase host), so `tools/db.mjs`
needs no key of its own. Run it with `NODE_USE_ENV_PROXY=1` so Node's fetch goes through the proxy:
`export NODE_USE_ENV_PROXY=1` once at the start. Quick check: `node tools/db.mjs get answer_sheets "select=lesson_id&limit=1"`
must return a row; a 401 "permission denied" means the secret is missing.

Read first: `/mnt/project-files/lessons/README.md` (lesson format and timetable),
`/mnt/project-files/english-1en2/course-plan.md`, and project memory.

## 1. Collect the week

```
node tools/db.mjs get lessons "select=id,week,lesson_date,subject,title,status&order=lesson_date"
node tools/db.mjs get quiz_attempts "order=created_at"
node tools/db.mjs get submissions "order=created_at"
node tools/db.mjs get weak_topics "order=subject,sort"
```

Download any photos (`files` on a submission) with `node tools/db.mjs download <path> /tmp/work/<name>` and look at them.

## 2. Mark written work

For each submission with `mark` = null: mark it against the lesson's answer sheet
(`lessons/week-NN/*-answers.md`), using the official mark-scheme style (method marks, 1 mark per point).
Write short, encouraging feedback for Hadi: what went well and one thing to fix. 
**Several sends for one lesson** (Hadi can press "Send again" to fix or add to an answer): mark all unmarked
submissions for the same lesson together as ONE piece of work, where a later answer to the same question replaces the
earlier one. Put the mark and full feedback on the latest submission; give the earlier ones the same mark/mark_max and
the feedback "Marked together with your later answer." Then:

```
node tools/db.mjs patch submissions "id=eq.<id>" '{"mark":6,"mark_max":8,"feedback":"...","marked_at":"<now ISO>"}'
```

Do not overwrite a mark Usman has already given (mark not null).

## 3. Update weak topics

From quiz scores, marks and timing, update each skill's status (Not yet tested, Weak, Improving, Secure;
Secure = two good re-tests in a row) and evidence, e.g. "Wk1 Mon Q1 3/4, Q2 4/4, 6 min":

```
node tools/db.mjs patch weak_topics "subject=eq.english&skill=eq.Finding%20information" '{"status":"Improving","evidence":"...","last_tested":"YYYY-MM-DD"}'
```

Mirror the changes in the subject's `weak-topics.md` in `/mnt/project-files/`.

## 4. Write next week

**The plan on the site decides the timetable (Usman, 19 Nov 2026).** Before writing, read Hadi's courses
(`node tools/db.mjs get "courses?select=subject,code,tier,hours_per_week,study_days,plan&student_id=eq.<Hadi's v2 id, in project memory v2-site>"`):
each course's `study_days` (1=Mon..7=Sun) are the days that subject gets a lesson, its minutes per lesson are
`hours_per_week*60 / number of days` (round to 5; split anything over 45 min into two parts in the same lesson), and the
plan week that covers next Monday gives the topic. A course with no days ticked gets no lessons. The parent may change this
at any time, so always read it fresh. If the site and the fixed timetable below disagree, the site wins.

If next week's lessons were already written by an evening run (from an "Update next week's lessons" request), don't
rewrite them: check they match the site's courses and only add anything missing.

Write next week's lessons in `/mnt/project-files/lessons/week-NN/` in the same format as week 1
(Markdown lesson + `-answers.md` + `quizzes.json` for the self-marking memory quizzes). Follow the timetable
(Mon English + Maths, Tue English + Chemistry, Wed English + Physics, Thu English, Fri English; English is the
main focus until April 2027; no mocks unless Usman asks).

**Tutor away, w/c 23 Nov, 30 Nov and 7 Dec 2026 (Usman, 19 Nov 2026):** every weekday Hadi does all four:
English (45 min) + Maths (30 min) + Chemistry (30 min) + Physics (30 min), plus ICT (4IT1, 30 min) on Fridays only.
Slots: a = English, b = Maths, c = Chemistry, d = Physics, e = ICT. Week 2's Thu/Fri English lessons (spelling, letter)
already exist as drafts dated 26/27 Nov; keep them and add the other subjects alongside. Follow each course's plan
topics on the site for Maths/Chem/Physics/ICT. Back to the normal timetable from Mon 14 Dec unless Usman says otherwise. Bring back anything Hadi got wrong in this week's
memory quizzes and anything marked Weak. Memory quizzes (from week 2, Usman agreed 18 Nov 2026): mostly the lesson's own
subject (in English lessons 3-4 of 5 English, 1-2 from other subjects), and label every other-subject question,
e.g. "(Maths recap) What is 10% of 70?". Answer sheets say "For the parent only" and name no internal files. On the website, Hadi types answers or uploads photos, so the
"Send back" box is replaced automatically.

Then build and upload as a draft (the parent, Rizwana, approves it on the Lessons page):

```
node tools/build-content.mjs /mnt/project-files/lessons/week-NN NN <monday YYYY-MM-DD> /mnt/project-files/website/content/week-NN.json
node tools/db.mjs push-week /mnt/project-files/website/content/week-NN.json
```

Add `--publish` only if Usman has said lessons may go live without his approval.

## 5. Summary

Upsert a short report for the week (HTML, under 200 words: lessons done, quiz scores, marks, time taken,
what's weak, what next week covers):

```
node tools/db.mjs upsert reports '[{"week":NN,"body_html":"<p>...</p>"}]' week
```

Post the same summary, in a few lines, to the project thread.

## Problem reports (both the Saturday run and the weekday marking run)

Read new reports: `node tools/db.mjs get feedback "status=eq.new&order=created_at"`. Each has `place`
(quiz / lesson / plan), `ref` (lesson id or course id), `item` (e.g. "Question 2" or "Week 5"), `kind`,
`note` and `context`. For Hadi's lessons and quizzes, fix the lesson source in /mnt/project-files/lessons/
and the live row (`patch lessons "id=eq.<id>" '<json>'`; never change a lesson's status), or the
answer sheet. For a plan report, fix the topic list in docs/catalogue.js if it is wrong. Then mark it:
`patch feedback "id=eq.<id>" '{"status":"fixed"}'` (or `"not_a_problem"` with a reason in the summary).
List what was fixed in the summary.


## Lesson update requests ("Update next week's lessons" button; both runs, Sun–Fri evening and Saturday)

The parent can press **Update next week's lessons** on the Weekly timetable or Edit plan page. It adds a row to
`lesson_requests` (student_id, note, status 'new'). Each run:

1. `node tools/db.mjs get "lesson_requests?status=eq.new&order=created_at"`. If there are none, do nothing here. Several requests for the same student are handled together as one rewrite (combine their notes) and all are marked done.
2. Read the courses fresh (see section 4) and the parent's note. "Next week" = the Mon–Fri starting the coming Monday
   (on a Sunday that is tomorrow).
3. Rewrite that week's lessons to match: keep any lesson Hadi has already started (has a quiz attempt or submission) exactly
   as it is; replace or add the rest; remove lessons for subjects/days no longer ticked if not started. Build with
   build-content.mjs and push with push-week as DRAFTS (never --publish). If that week was already approved, the changed
   lessons go back to draft for the parent to approve again; say so in the reply.
4. Patch each request: `status=done`, `done_at=now`, and a short `reply` the parent will read on the page (one or two
   plain sentences, e.g. "Done. Week of 23 Nov now has Maths, Chemistry and Physics every day (30 min each). Please approve
   it on the Lessons page.").
5. Mention it in the run's summary to Usman.
