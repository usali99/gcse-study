# GCSE Study

A small private website for home-educated GCSE study: daily lessons, self-marking memory quizzes,
uploading written work, marking, weak topics and weekly approval of new lessons.

- `docs/` is the website (served by GitHub Pages from the `docs` folder). Plain HTML, CSS and JavaScript, no build step.
- `docs/config.js` holds the Supabase project URL and public (anon) key. With them empty, the site runs as a preview with example data.
- `supabase/schema.sql` creates the tables, access rules and the photo bucket. Paste it into the Supabase SQL editor and run it.
- `tools/build-content.mjs` turns a week of Markdown lessons into website content.
- `tools/db.mjs` uploads content, reads work and writes marks (needs the service key, never stored here).
- `WEEKLY-RUN.md` is what the weekend run does.

## Who can see what

| | Student | Parent (admin) |
|---|---|---|
| Published lessons and quizzes | Yes | Yes |
| Draft lessons (waiting for approval) | No | Yes |
| Answer sheets | No | Yes |
| Own quiz scores, work, marks, feedback | Yes | Yes (all) |
| Weak topics | Read only | Read and edit |
| Weekly summaries | No | Yes |

Accounts are created by the parent in Supabase (sign-ups switched off). New accounts are students;
`select public.make_admin('email');` in the SQL editor makes the parent the admin.

Note: the self-marking quiz answers are sent to the browser so it can mark instantly. They are short
recall questions; the full answer sheets never are.
