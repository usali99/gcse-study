// Small command-line helper for the weekend run. Talks to Supabase with the service key.
// Needs env SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. No packages needed (Node 18+).
//
//   node tools/db.mjs push-week <content.json> [--publish]   lessons + answer sheets (keeps the published status of existing lessons unless --publish)
//   node tools/db.mjs seed-topics <topics.json>              adds topics that are missing, never overwrites
//   node tools/db.mjs get <table> [postgrest query]          e.g. get submissions "mark=is.null&order=created_at"
//   node tools/db.mjs patch <table> <postgrest filter> '<json>'   e.g. patch submissions "id=eq.4" '{"mark":6,"mark_max":8,"feedback":"..."}'
//   node tools/db.mjs upsert <table> <json file or json> [on_conflict column]
//   node tools/db.mjs download <storage path> <out file>    a photo Hadi uploaded (bucket "work")
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rest(method, path, body, prefer) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
const readJson = (x) => JSON.parse(existsSync(x) ? readFileSync(x, 'utf8') : x);

const [cmd, a, b, c] = process.argv.slice(2);
try {
  if (cmd === 'push-week') {
    const content = readJson(a);
    const publish = process.argv.includes('--publish');
    const ids = content.lessons.map((l) => l.id);
    const existing = await rest('GET', `lessons?select=id,status&id=in.(${ids.map(encodeURIComponent).join(',')})`);
    const st = Object.fromEntries(existing.map((x) => [x.id, x.status]));
    const rows = content.lessons.map((l) => ({ ...l, status: publish ? 'published' : st[l.id] || 'draft', updated_at: new Date().toISOString() }));
    await rest('POST', 'lessons?on_conflict=id', rows, 'resolution=merge-duplicates');
    if (content.answers && content.answers.length) await rest('POST', 'answer_sheets?on_conflict=lesson_id', content.answers, 'resolution=merge-duplicates');
    console.log(`Week ${content.week}: ${rows.length} lessons, ${(content.answers || []).length} answer sheets. Status: ${[...new Set(rows.map((r) => r.status))].join(', ')}`);
  } else if (cmd === 'seed-topics') {
    const rows = readJson(a);
    await rest('POST', 'weak_topics?on_conflict=subject,skill', rows, 'resolution=ignore-duplicates');
    console.log(`Topics checked: ${rows.length}`);
  } else if (cmd === 'get') {
    console.log(JSON.stringify(await rest('GET', `${a}${b ? '?' + b : ''}`), null, 1));
  } else if (cmd === 'patch') {
    console.log(JSON.stringify(await rest('PATCH', `${a}?${b}`, readJson(c), 'return=representation'), null, 1));
  } else if (cmd === 'upsert') {
    const rows = readJson(b);
    console.log(JSON.stringify(await rest('POST', `${a}${c ? '?on_conflict=' + c : ''}`, rows, 'resolution=merge-duplicates,return=representation'), null, 1));
  } else if (cmd === 'download') {
    const r = await fetch(`${URL_}/storage/v1/object/work/${a}`, { headers: H });
    if (!r.ok) throw new Error(`download ${a}: ${r.status} ${await r.text()}`);
    writeFileSync(b, Buffer.from(await r.arrayBuffer()));
    console.log(`Saved ${b}`);
  } else {
    console.error('Commands: push-week, seed-topics, get, patch, upsert, download (see top of file).');
    process.exit(1);
  }
} catch (e) { console.error(e.message); process.exit(1); }
