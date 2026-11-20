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

Accounts for this site are created by the parent in Supabase. New accounts are students;
`select public.make_admin('email');` in the SQL editor makes the parent the admin.

Note: the self-marking quiz answers are sent to the browser so it can mark instantly. They are short
recall questions; the full answer sheets never are.

## Version 2 (test): schools, teachers, parents and students

The main site (`docs/`) is the invite-only multi-role version, served at the site root (https://ninegrade.co.uk). The original single-family site is at `docs/classic/` (`/classic/`); `/app/` redirects to the root. It uses the same Supabase project
with its own tables, so the site above is unaffected.

- Landing page, sign in, sign up as School, Teacher, Parent or Student, and My account (name, email, password, forgotten password).
- Child logins without email: a parent creates a username login (hidden address child-<username>@ninegrade.co.uk) and can set a new password (`supabase/v2-child-logins.sql`).
- Report a problem on quiz questions, lessons and plan weeks; owner Feedback page (`supabase/v2-feedback.sql`).
- Edit a plan (dates, tier, hours rebuild it; rename, move, retype or tick weeks done) and a weekly timetable (study days per subject; run `supabase/v2-timetable.sql` once).
- Course plans: choose exam board, qualification, subject and code, tier and exam date; `docs/catalogue.js`
  holds the specifications and builds the week-by-week plan (review weeks, revision, school holidays).
- Dashboards: students see this week and their courses; parents manage their children; teachers run classes;
  school admins see staff, classes and students; the owner sees everyone.
- `?preview` on the URL (or empty config) runs it with example accounts saved only in the browser.

### Setup

1. Run `supabase/v2-roles.sql` in the SQL editor (safe to run again).
2. Make the owner and link a child:
   `select public.v2_add_person('email', 'parent', 'Name', true);`
   `select public.v2_add_person('child-email', 'student', 'Name');`
   `select public.v2_link_parent('email', 'child-email');`
3. Authentication: turn on "Allow new users to sign up". Every sign-up still needs a valid invite code,
   checked in the database. Set Site URL and Redirect URLs to the site root for email links.
4. Invite codes are made on the Invite codes page: the owner can invite any account type; a school admin
   invites teachers; a teacher makes one code per class; a parent invites their child. Codes expire after 30 days.

### Who can see what

| | Owner | School admin | Teacher | Parent | Student |
|---|---|---|---|---|---|
| People | Everyone | Own school's staff and students | Own school's staff, own classes' students | Own children | Self, own parents and teachers |
| Courses | All | Students in the school's classes | Students in own classes | Own children's | Own |
| Create course plans | Anyone | School's students | Own classes' students | Own children | Self |

Users can change only their own name; roles and owner status can't be changed from the website.
`supabase/v2-check-access.sql` (read-only) shows what each account can see and confirms that escalation is refused.
Run it after any change to the access rules.

## Tests

Automated browser tests (Playwright) live in `tests/`. They open the site in **preview mode** (`?preview`), which uses made-up demo accounts and lessons stored in the browser, so they never touch the real database.

```
npm install
npx playwright install chromium   # first time only
npm test                          # all tests, desktop and phone sizes
npm run test:phone                # phone size only
```

GitHub runs them on every push to `main` (Actions tab, "Website tests"). If a test fails, the run turns red and a report with screenshots is attached to it.

When you change a feature, update or add a test in the matching file: `student.spec.js`, `parent.spec.js`, `accounts.spec.js` or `landing.spec.js`.
