// Turns one week's lesson files (Markdown) into website content.
// Usage: node tools/build-content.mjs <week folder> <week number> <monday YYYY-MM-DD> [out.json]
// Needs pandoc. The week folder holds files named like 1-mon-a-english-xxx.md,
// matching *-answers.md answer sheets, and an optional quizzes.json. Slots a to e (a = first lesson of the day).
// Optional front matter "minutes: 45" sets the lesson length.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';

const [dir, weekArg, monday, outArg] = process.argv.slice(2);
if (!dir || !weekArg || !monday) {
  console.error('Usage: node tools/build-content.mjs <week folder> <week number> <monday YYYY-MM-DD> [out.json]');
  process.exit(1);
}
const week = Number(weekArg);
const out = outArg || `content-week-${String(week).padStart(2, '0')}.json`;
const quizzes = existsSync(join(dir, 'quizzes.json')) ? JSON.parse(readFileSync(join(dir, 'quizzes.json'), 'utf8')) : {};
const SUBJECTS = ['english', 'maths', 'chemistry', 'physics'];
const DAYS = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 };

function toHtml(file) {
  return execFileSync('pandoc', [file, '-f', 'markdown', '-t', 'html5', '--wrap=none'], { encoding: 'utf8' });
}
function minutesOf(file) {
  const m = readFileSync(file, 'utf8').match(/^minutes:\s*(\d+)\s*$/m);
  return m ? Number(m[1]) : null;
}
function title(file) {
  const m = readFileSync(file, 'utf8').match(/^title:\s*"?(.*?)"?\s*$/m);
  return m ? m[1] : basename(file, '.md');
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const lessons = [];
const answers = [];
for (const f of readdirSync(dir).filter(f => f.endsWith('.md') && !f.endsWith('-answers.md')).sort()) {
  const name = basename(f, '.md');
  const m = name.match(/^(\d)-(mon|tue|wed|thu|fri)-(?:([a-e])-)?([a-z]+)-/);
  if (!m || !SUBJECTS.includes(m[4])) { console.warn('Skipping', f); continue; }
  const [, , day, slot = 'a', subject] = m;
  const id = `w${String(week).padStart(2, '0')}-${name.split('-').slice(0, slot && m[3] ? 3 : 2).join('-')}`;
  const quiz = quizzes[name] || [];
  let body = toHtml(join(dir, f));
  // The memory quiz becomes the self-marking quiz on the website.
  if (quiz.length) {
    body = body.replace(/(<h2[^>]*>1\. Memory quiz[^<]*<\/h2>)[\s\S]*?(?=<h2)/, '$1\n<div class="quiz-slot"></div>\n');
  }
  // The website has its own "send your work" box, so drop the email send-back note.
  body = body.replace(/<div class="sendback">[\s\S]*?<\/div>\s*$/, '');
  lessons.push({
    id, week, lesson_date: addDays(monday, DAYS[day]), slot, subject,
    title: title(join(dir, f)),
    minutes: minutesOf(join(dir, f)) || (subject === 'english' ? 40 : 30),
    body_html: body.trim(), quiz, status: 'draft',
  });
  const ans = join(dir, name + '-answers.md');
  if (existsSync(ans)) answers.push({ lesson_id: id, body_html: toHtml(ans).trim() });
}
writeFileSync(out, JSON.stringify({ week, monday, lessons, answers }, null, 1));
console.log(`Wrote ${lessons.length} lessons and ${answers.length} answer sheets to ${out}`);
