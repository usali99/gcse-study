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

Never add `--publish`. Lessons go live when the parent approves them, or on Sunday evening if the parent switched on "Publish it anyway" (see below).

## 4a. Catch-up, away days and practice "instead" (Saturday run, Usman 20 Nov 2026)

Do this before writing next week, so the new week fits around it. The point is that nothing piles up for Hadi or the parent.
These need `v2-catchup.sql`; if `away_days` or `lessons.catch_up` don't exist yet, skip this section and say so in the summary.

1. **Away days.** `node tools/db.mjs get "away_days?select=from_date,to_date,reason,note&student_id=eq.<Hadi's v2 id>&to_date=gte.<last Monday>"`.
   Write **no lessons** on away days in next week (illness, holiday or exam day). Fewer lessons that week; don't squeeze them onto other days.
   Lessons already set on an away day this week that have no work sent: set `catch_up=true` (the site already shows them as catch-up).
2. **Missed lessons** (published, date before today, no submission):
   - From **this week**: per subject, if half or more of the subject's lessons were missed, make next week a light **catch-up week**
     for that subject: carry the missed lessons into next week instead of new topics (patch `lesson_date` to a study day next week,
     `week` to next week, `catch_up=true`), and don't write new lessons for those slots. Otherwise leave them where they are with
     `catch_up=true` and bring their key skills back in next week's memory quizzes.
   - **More than 2 weeks old**: set `catch_up=true` and leave them where they are (they sit in the Catch-up list on the site, Hadi does
     them when he has time). Don't move them again. Recycle their skills into memory quizzes instead.
   - `node tools/db.mjs patch lessons "id=eq.<id>" '{"catch_up":true}'` (add `"lesson_date"`/`"week"` when carrying a lesson forward).
   - Never more than 3 carried lessons in one week, and never delete a lesson.
3. **Practice "instead of" lessons.** `node tools/db.mjs get "practice_sets?select=subject,kind,minutes,due_date,status&student_id=eq.<id>&replaces_lessons=eq.true&status=in.(draft,assigned)"`.
   For each set due next week (or with no due date and assigned in the last 7 days), cut that subject's lesson time next week by the
   set's minutes (a mock with no minutes counts as 60, a quiz as 15), dropping whole lessons from the end of the week first. Say what
   you dropped in the summary. Sets marked "on top" (`replaces_lessons=false`) don't change the week.
4. In the summary, say how many lessons are in catch-up, whether any subject has a catch-up week, and any away days.

The course card on the site shows "N weeks behind · revision time X weeks instead of Y" from missed lessons, so keep `catch_up` honest.

## Sunday evening: publish anyway (evening run, Sundays only)

Only if `node tools/db.mjs get "study_settings?select=auto_publish&student_id=eq.<Hadi's v2 id>"` returns `auto_publish: true`:
if the coming week's lessons are still `status=draft`, publish them with `"auto_published":true`:

```
node tools/db.mjs patch lessons "week=eq.NN&status=eq.draft" '{"status":"published","auto_published":true}'
```

The parent sees "Published automatically, not checked" and a "Mark as checked" button. Answer sheets stay hidden as usual. Never assign
practice sets this way; they always wait for the parent. If the setting is off (or missing), leave drafts alone. Mention it in the run summary.

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


## Practice sets (both runs, Sun–Fri evening and Saturday)

Parents, teachers and self-study students make **practice sets** on the Practice page (table `practice_sets`,
needs supabase/v2-practice.sql). Each one says the `kind` (lesson / quiz / practice / mock), `subject`, optional
`title`, `minutes`, `due_date`, `note` (instructions, and "Changes: …" when they asked for changes), and the material:
`source_text` and/or `source_files` (paths in the private "practice" storage bucket). `based_on` = "Make another like this":
make a fresh version of that set with NEW questions, same level and length, unless the note says otherwise.

### Make the requested sets
1. `node tools/db.mjs get "practice_sets?status=eq.requested&order=created_at"`. None: skip.
2. Read the material. Files: `node tools/db.mjs download "<path>" /tmp/p/<name> practice` then read it (PDF/photo/Word).
   For `based_on`, also read the earlier set (`get "practice_sets?id=eq.<id>"`) and its answers
   (`get "practice_answers?set_id=eq.<id>"`). Check the student's weak topics where it helps (Hadi: `get weak_topics`).
3. Write the set to match the kind, at the student's tier (from their courses), in UK English, short chunks:
   - **lesson**: like a weekly lesson (Learn it, worked examples, exam tip, Your turn questions with marks), 20–40 min.
   - **quiz**: a short intro or reminder in `body_html`, and 5–12 self-marking questions in `quiz` (same JSON as weekly
     quizzes: `mc` with `options` + `answer` index, `num` with `answer` (+ `tol`), `short` with `accept` list; optional `explain`).
   - **practice**: exam-style questions with marks shown, numbered, in `body_html`; 3–6 warm-up `quiz` questions optional.
   - **mock**: a full timed paper: instructions box (time allowed = `minutes`, total marks), numbered questions with marks.
     (For new questions from a real past paper, follow its structure and style.)
   **Questions: `as_is` (Usman, 20 Nov 2026).** `as_is=true` = the parent wants THEIR questions exactly as given: copy every
   question word for word, in the same order, with the same marks, numbers, diagrams described in words if they can't be shown,
   and the same time allowed. Only set it out for the site (and for kind quiz, turn the questions into self-marking `quiz`
   items without changing their wording). Don't add, drop, simplify or reword questions; if something can't be read, say so in
   `reply` and leave the set `requested`. `as_is=false` (and every `based_on` "Make another like this") = write NEW questions on the
   same topics, level and length.
   **The parent's own answers.** `get "practice_answers?set_id=eq.<id>&select=given_text,given_files"` (files: download from the
   practice bucket). If given, they ARE the mark scheme: build the answer sheet from them (tidy layout, keep their answers and
   marks exactly), and only add answers for questions they don't cover, labelled "(added by Ninegrade)". If the parent's answer
   looks wrong, keep it but add a short "Check:" note for the parent. Mark tries against the parent's answers. Never show them to the student.
   Number every question as `<p><b>1.</b> …</p>` or `<p><b>1a.</b> …</p>` (marks in brackets at the end) and use `<h2>` for sections:
   the student's answer box is pre-filled from these, so they answer under each question. In a lesson, put the questions after an `<h2>` containing "Your turn".
   Never put answers in `body_html` or `quiz` explanations of written questions. `body_html` is shown as-is: use simple
   HTML (h2, h3, p, ol, ul, table, b, i), no scripts, no images from outside.
4. Write the answer sheet (mark scheme with marks, model answers, common mistakes) "For the parent only." Keep the parent's `given_text`/`given_files` (the upsert below only changes `body_html`).
5. Save: `upsert practice_answers '[{"set_id":"<id>","body_html":"…"}]' set_id`, then
   `patch practice_sets "id=eq.<id>" '{"status":"draft","title":"…","minutes":N,"body_html":"…","quiz":[…],"reply":"…"}'`.
   `reply` = one or two sentences for the parent ("Made from your worksheet: 10 questions on fractions of amounts, about
   20 minutes. Check the mark scheme, then assign it."). If the material can't be read or isn't enough, leave the status
   `requested` and patch only `reply` saying what's needed (the parent sees it on the set's page); mention it in the summary.
   Never set status `assigned`: the parent assigns.

### Mark practice tries
1. `get "practice_attempts?mark=is.null&order=created_at"`. Quiz-only sets (kind quiz) mark themselves: patch
   `mark`=`quiz_score`, `mark_max`=`quiz_max`, short feedback only if useful, `marked_at`.
2. Otherwise mark against the answer sheet like weekly work (photos: `download "<path>" <out> practice`). Several tries
   of the same set are separate attempts: mark each, and say what improved since the last try.
3. `patch practice_attempts "id=eq.<id>" '{"mark":…,"mark_max":…,"feedback":"…","marked_at":"<now>"}'`. Feedback is
   for the student (kind, numbered, what to fix). Update weak topics from Hadi's practice like weekly work.
4. Add practice made and marked to the run's summary.
