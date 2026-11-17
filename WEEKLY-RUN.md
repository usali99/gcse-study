# Weekend run

Instructions for the scheduled Claude session that runs every Saturday. It needs `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` in its environment, and the project folder `/mnt/project-files/`.

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
Write short, encouraging feedback for Hadi: what went well and one thing to fix. Then:

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

Write next week's lessons in `/mnt/project-files/lessons/week-NN/` in the same format as week 1
(Markdown lesson + `-answers.md` + `quizzes.json` for the self-marking memory quizzes). Follow the timetable
(Mon English + Maths, Tue English + Chemistry, Wed English + Physics, Thu English, Fri English; English is the
main focus until April 2027; no mocks unless Usman asks). Bring back anything Hadi got wrong in this week's
memory quizzes and anything marked Weak. On the website, Hadi types answers or uploads photos, so the
"Send back" box is replaced automatically.

Then build and upload as a draft (Usman approves it on the Lessons page):

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
