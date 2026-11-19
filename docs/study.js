/* Lessons, quizzes, sending work, marking and weak topics in the new site.
   Uses the same tables as the original site (lessons, quiz_attempts, submissions,
   answer_sheets, weak_topics, reports), which only Hadi and the parent can open. */
(function () {
  'use strict';
  const SUBJECTS = { english: 'English', maths: 'Maths', chemistry: 'Chemistry', physics: 'Physics' };
  const TOPIC_STATUSES = ['Not yet tested', 'Weak', 'Improving', 'Secure'];
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const groupBy = (list, fn) => list.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {});
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const fmtDay = (iso, o) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', o || { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtWhen = (ts) => new Date(ts).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function supabaseData(sb) {
    const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    let uid = null;
    return {
      async access() {
        const { data } = await sb.auth.getSession(); if (!data.session) return null; uid = data.session.user.id;
        const r = await sb.from('profiles').select('role').eq('id', uid).maybeSingle();
        return r.error || !r.data ? null : (r.data.role === 'admin' ? 'admin' : 'student');
      },
      async lessons() { return must(await sb.from('lessons').select('*').order('lesson_date').order('slot')); },
      async answerSheet(id) { const r = must(await sb.from('answer_sheets').select('body_html').eq('lesson_id', id).maybeSingle()); return r && r.body_html; },
      async attempts() { return must(await sb.from('quiz_attempts').select('*').order('created_at', { ascending: false })); },
      async addAttempt(a) { must(await sb.from('quiz_attempts').insert({ ...a, user_id: uid })); },
      async subs() { return must(await sb.from('submissions').select('*').order('created_at', { ascending: false })); },
      async addSub({ lesson_id, answer_text, minutes_taken, files }) {
        const paths = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i]; const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
          const path = `${uid}/${lesson_id}/${Date.now()}-${i + 1}.${ext}`;
          must(await sb.storage.from('work').upload(path, f, { contentType: f.type || undefined })); paths.push(path);
        }
        must(await sb.from('submissions').insert({ user_id: uid, lesson_id, answer_text, minutes_taken, files: paths }));
      },
      async fileUrl(path) { return must(await sb.storage.from('work').createSignedUrl(path, 3600)).signedUrl; },
      async mark(id, m) { must(await sb.from('submissions').update({ ...m, marked_at: new Date().toISOString() }).eq('id', id)); },
      async topics() { return must(await sb.from('weak_topics').select('*').order('subject').order('sort')); },
      async updateTopic(id, patch) { must(await sb.from('weak_topics').update(patch).eq('id', id)); },
      async setWeek(week, status) { must(await sb.from('lessons').update({ status }).eq('week', week)); },
      async reports() { const r = await sb.from('reports').select('*').order('week', { ascending: false }); return r.error ? [] : r.data; },
    };
  }

  function demoData(getMeId) {
    const KEY = 'gcse-v2-study-demo';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
    const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* blocked */ } };
    const d0 = new Date(); const iso = (n) => { const d = new Date(d0.getTime() + n * 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
    const body = (t) => `<div class="header"><p><b>Example lesson</b> · about 30 minutes</p></div><h2>1. Memory quiz (5 minutes)</h2><div class="quiz-slot"></div><h2>2. Learn it</h2><p>${t}</p><h2>3. Your turn</h2><p><strong>1.</strong> Write three sentences using what you learned. <span class="marks">(3 marks)</span></p>`;
    const quiz = [{ q: 'Which century were the 1800s?', type: 'mc', options: ['18th', '19th'], answer: 1, explain: 'The 1800s are the 19th century.' }, { q: 'Spell the word for a short piece of a text: e _ _ _ _ _ t', type: 'short', accept: ['extract'], explain: 'extract' }];
    const seed = () => ({
      lessons: [
        { id: 'd1', week: 1, lesson_date: iso(-1), slot: 'a', subject: 'english', title: 'Finding information', minutes: 40, body_html: body('Question 1 asks for four facts from the given lines.'), quiz, status: 'published' },
        { id: 'd2', week: 1, lesson_date: iso(0), slot: 'a', subject: 'english', title: 'Reading old sentences', minutes: 35, body_html: body('Split long sentences at commas and semicolons.'), quiz, status: 'published' },
        { id: 'd3', week: 1, lesson_date: iso(0), slot: 'b', subject: 'maths', title: 'Percentages', minutes: 30, body_html: body('10% is one tenth. Find 10%, then build up.'), quiz, status: 'published' },
        { id: 'd4', week: 2, lesson_date: iso(6), slot: 'a', subject: 'english', title: 'Language analysis', minutes: 40, body_html: body('Technique, quote, effect.'), quiz, status: 'draft' }],
      sheets: { d1: '<h2>Answers</h2><p>Accept any four facts from lines 1 to 8.</p>', d2: '<h2>Answers</h2><p>Example answers.</p>', d3: '<h2>Answers</h2><p>1. 30 2. 45</p>', d4: '<h2>Answers</h2><p>Technique, quote, effect.</p>' },
      attempts: [{ lesson_id: 'd1', score: 1, max: 2, answers: [{ given: 1, right: true }, { given: 'extrakt', right: false }], created_at: new Date().toISOString() }],
      subs: [{ id: 1, lesson_id: 'd1', answer_text: 'It is on the north coast of Kent. You travel by steamer...', files: [], minutes_taken: 6, created_at: new Date().toISOString(), mark: 9, mark_max: 9, feedback: 'Excellent work: full marks. Next time write four short numbered points.' }],
      topics: [{ id: 1, subject: 'english', skill: 'Finding information', paper_q: 'P1 Q1', status: 'Improving', evidence: '4/4 twice', sort: 1 }, { id: 2, subject: 'english', skill: 'Sentence control', paper_q: 'Writing', status: 'Weak', evidence: 'Run-on sentences', sort: 2 }, { id: 3, subject: 'maths', skill: 'Percentages', paper_q: 'P1', status: 'Not yet tested', evidence: '', sort: 1 }],
    });
    let S = read() || seed(); const save = () => write(S);
    const role = () => (getMeId() === 'usman' ? 'admin' : getMeId() === 'hadi' ? 'student' : null);
    return {
      async access() { return role(); },
      async lessons() { return S.lessons.filter((l) => role() === 'admin' || l.status === 'published'); },
      async answerSheet(id) { return role() === 'admin' ? S.sheets[id] : null; },
      async attempts() { return S.attempts; },
      async addAttempt(a) { S.attempts.unshift({ ...a, created_at: new Date().toISOString() }); save(); },
      async subs() { return S.subs; },
      async addSub({ lesson_id, answer_text, minutes_taken }) { S.subs.unshift({ id: Date.now(), lesson_id, answer_text, minutes_taken, files: [], created_at: new Date().toISOString(), mark: null, mark_max: null, feedback: null }); save(); },
      async fileUrl() { return '#'; },
      async mark(id, m) { S.subs.forEach((s) => { if (s.id === id) Object.assign(s, m); }); save(); },
      async topics() { return S.topics; },
      async updateTopic(id, patch) { S.topics.forEach((t) => { if (t.id === id) Object.assign(t, patch); }); save(); },
      async setWeek(week, status) { S.lessons.forEach((l) => { if (l.week === week) l.status = status; }); save(); },
      async reports() { return []; },
      reset() { S = seed(); save(); },
    };
  }

  window.createStudy = function (ctx) {
    // ctx: { sb, demo, getMeId, shell, page, esc, today, ring, app }
    const { shell, page, esc, today, app } = ctx; const report = ctx.report || (() => '');
    const api = ctx.demo ? demoData(ctx.getMeId) : supabaseData(ctx.sb);
    let role = null; let D = null; let checked = false;

    async function init() { role = await api.access().catch(() => null); D = null; checked = true; return role; }
    function forget() { role = null; D = null; checked = false; }
    async function load() {
      const [lessons, attempts, subs] = await Promise.all([api.lessons(), api.attempts(), api.subs()]);
      D = { lessons, attempts, subs, byId: Object.fromEntries(lessons.map((l) => [l.id, l])) }; return D;
    }
    const prog = (id) => {
      const at = D.attempts.filter((a) => a.lesson_id === id);
      const best = at.reduce((b, a) => (!b || a.score / a.max > b.score / b.max ? a : b), null);
      const subs = D.subs.filter((s) => s.lesson_id === id); const marked = subs.find((s) => s.mark != null);
      return { best, subs, marked, sent: subs.length > 0 };
    };
    // Drafts: typed answers are kept on this device until they are sent, so a refresh or Back doesn't lose them.
    const dKey = (id, kind) => `ng-draft:${ctx.getMeId() || 'x'}:${id}:${kind}`;
    const dGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const dSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
    const pill = (id) => { const p = prog(id);
      if (p.marked) return `<span class="pill done">Marked ${p.marked.mark}/${p.marked.mark_max}</span>`;
      if (p.sent) return '<span class="pill sent">Sent, waiting for marking</span>';
      const late = ((D.byId[id] || {}).lesson_date || '9') < today();
      if (p.best) return `<span class="pill ${late ? 'missed' : 'todo'}">Quiz ${p.best.score}/${p.best.max}, work not sent</span>`;
      return late ? `<span class="pill missed">${role === 'admin' ? 'Missed' : 'Missed, please catch up'}</span>` : '<span class="pill todo">Not started</span>'; };
    const card = (l, o = {}) => `<a class="lesson-card" href="#lesson-${esc(l.id)}"><span class="stripe ${l.subject}"></span>
      <span class="lc-body"><span class="subj ${l.subject}">${SUBJECTS[l.subject] || l.subject}${o.date ? ` · ${fmtDay(l.lesson_date, { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}</span>
      <span class="lc-title">${esc(l.title)}</span><span class="muted small">About ${l.minutes} minutes${l.status === 'draft' ? ' · <span class="pill draft">Not published yet</span>' : ''}</span></span>
      <span class="lc-status">${l.status === 'draft' ? '' : pill(l.id)}</span></a>`;
    const toMark = () => (D ? D.subs.filter((s) => s.mark == null).length : 0);

    function nav() {
      if (!role) return [];
      return role === 'admin' ? [['marking', `Marking${toMark() ? ` <span class="count">${toMark()}</span>` : ''}`], ['lessons', 'Lessons'], ['topics', 'Weak topics']]
        : [['today', 'Today'], ['lessons', 'All lessons'], ['progress', 'My progress']];
    }

    // Block on the student's dashboard and the parent's child card.
    function dashBlock() {
      if (!role || !D) return '';
      const t = today();
      if (role === 'student') {
        const todays = D.lessons.filter((l) => l.lesson_date === t);
        const next = D.lessons.find((l) => l.lesson_date > t);
        const list = todays.length ? todays : next ? D.lessons.filter((l) => l.lesson_date === next.lesson_date) : [];
        return `<section class="panel"><div class="panel-head"><h2>${todays.length ? "Today's lessons" : next ? `Next lessons: ${fmtDay(next.lesson_date, { weekday: 'long', day: 'numeric', month: 'short' })}` : 'Lessons'}</h2><a class="small" href="#lessons">All lessons</a></div>
          ${list.length ? `<div class="lesson-list">${list.map((l) => card(l)).join('')}</div>` : '<p class="muted small">New lessons will appear here once they are ready.</p>'}</section>`;
      }
      const drafts = Object.keys(groupBy(D.lessons.filter((l) => l.status === 'draft'), (l) => l.week));
      const marked = D.subs.filter((s) => s.mark != null);
      const sc = D.attempts.length ? pct(D.attempts.reduce((a, b) => a + b.score, 0), D.attempts.reduce((a, b) => a + b.max, 0)) : null;
      const last = marked[0];
      return `<div class="study-strip">
        <a class="ss ${toMark() ? 'attn' : ''}" href="#marking"><span>Work to mark</span><b>${toMark()}</b></a>
        <a class="ss ${drafts.length ? 'attn' : ''}" href="#lessons"><span>Weeks to approve</span><b>${drafts.length}</b></a>
        <div class="ss"><span>Marked work</span><b>${marked.length ? pct(marked.reduce((a, s) => a + s.mark, 0), marked.reduce((a, s) => a + s.mark_max, 0)) + '%' : '–'}</b><small class="muted">${marked.length} piece${marked.length === 1 ? '' : 's'}</small></div>
        <div class="ss"><span>Memory quizzes</span><b>${sc == null ? '–' : sc + '%'}</b><small class="muted">${D.attempts.length} done</small></div></div>
        ${last ? `<div class="last-fb"><span class="muted small">Latest mark · ${esc((D.byId[last.lesson_id] || {}).title || '')}</span><b>${last.mark}/${last.mark_max}</b><a class="small" href="#marking-done">See all marked work</a></div>` : ''}
        <div class="row" style="margin:10px 0 14px"><a class="btn ghost sm" href="#lessons">Lessons and approval</a><a class="btn ghost sm" href="#topics">Weak topics</a></div>`;
    }

    function todayView() {
      const t = today(); const ls = D.lessons;
      const todays = ls.filter((l) => l.lesson_date === t); const next = ls.find((l) => l.lesson_date > t);
      const nextDay = next ? ls.filter((l) => l.lesson_date === next.lesson_date) : [];
      const catchUp = ls.filter((l) => l.lesson_date < t && !prog(l.id).sent).slice(-4);
      const main = todays.length ? `<section class="panel"><h2>Today's lessons</h2><p class="muted">Do them in order, with a 10-minute break in between.</p><div class="lesson-list">${todays.map((l) => card(l)).join('')}</div></section>`
        : nextDay.length ? `<section class="panel"><h2>No lessons today</h2><p class="muted">Next up, ${fmtDay(next.lesson_date)}:</p><div class="lesson-list">${nextDay.map((l) => card(l)).join('')}</div></section>`
        : '<section class="panel"><h2>No new lessons yet</h2><p class="muted">Next week\'s lessons will appear here once they are ready.</p></section>';
      shell('today', page(`<div class="narrow"><div class="page-head"><p class="kicker dark">${fmtDay(t)}</p><h1>Today</h1></div>${main}
        ${catchUp.length ? `<section class="panel"><h2>Still to send</h2><p class="muted">These lessons don't have any work sent yet.</p><div class="lesson-list">${catchUp.map((l) => card(l, { date: true })).join('')}</div></section>` : ''}</div>`));
    }

    function lessonsView() {
      const admin = role === 'admin'; const weeks = groupBy(D.lessons, (l) => l.week);
      const nums = Object.keys(weeks).map(Number).sort((a, b) => b - a);
      shell('lessons', page(`<div class="${admin ? '' : 'narrow'}"><div class="page-head"><p class="kicker dark">${admin ? "Hadi's lessons" : 'Lessons'}</p><h1>${admin ? 'Lessons and approval' : 'All lessons'}</h1>
        ${admin ? '<p class="muted">New weeks arrive as drafts. Open a lesson to read it with its answer sheet, then approve the week to show it to Hadi.</p>' : ''}</div>
        ${nums.map((w) => { const l = weeks[w]; const draft = l.some((x) => x.status === 'draft'); const days = groupBy(l, (x) => x.lesson_date);
          return `<section class="panel"><div class="panel-head"><div><h2>Week ${w}</h2><span class="muted small">Starts ${fmtDay(l[0].lesson_date, { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
            ${admin ? `<div class="row">${draft ? '<span class="pill draft">Waiting for your approval</span>' : '<span class="pill done">Live for Hadi</span>'}<button class="btn ${draft ? 'primary' : 'ghost'} sm" data-week="${w}" data-to="${draft ? 'published' : 'draft'}">${draft ? 'Approve and publish' : 'Hide from Hadi'}</button></div>` : ''}</div>
            ${Object.keys(days).sort().map((d) => `<div class="day-group"><h3>${fmtDay(d)}</h3><div class="lesson-list">${days[d].map((x) => card(x)).join('')}</div></div>`).join('')}</section>`; }).join('') || '<section class="panel"><p class="muted">No lessons yet.</p></section>'}</div>`));
      app.querySelectorAll('[data-week]').forEach((b) => { b.onclick = async () => { b.disabled = true; await api.setWeek(Number(b.dataset.week), b.dataset.to); await load(); lessonsView(); }; });
    }

    function quizHtml(q, l) {
      return `<form class="quiz" id="quiz" novalidate><div class="panel-head"><h3>Answer here</h3><span class="muted small">It marks itself when you press Check</span></div>
        <ol>${q.map((x, i) => `<li><div class="q">${esc(x.q)}</div>${x.type === 'mc' ? `<div class="opts" role="radiogroup">${x.options.map((o, j) => `<label><input type="radio" name="q${i}" value="${j}"> <span>${esc(o)}</span></label>`).join('')}</div>`
          : `<input type="text" inputmode="${x.type === 'num' ? 'decimal' : 'text'}" id="q${i}" autocomplete="off" aria-label="Your answer">`}<div class="fb" id="fb${i}" aria-live="polite"></div>${report({ place: 'quiz', ref: l.id, item: 'Question ' + (i + 1), context: `${l.title}: ${x.q}` }, '⚑ Report')}</li>`).join('')}</ol>
        <div class="row"><button class="btn primary" type="submit">Check my answers</button><span class="qscore" id="quiz-score" aria-live="polite"></span></div></form>`;
    }
    function markQuiz(quiz, form) {
      let score = 0;
      const answers = quiz.map((q, i) => {
        let given; let right;
        if (q.type === 'mc') { const c = form.querySelector(`input[name=q${i}]:checked`); given = c ? Number(c.value) : null; right = given === q.answer; }
        else if (q.type === 'num') { given = form.querySelector(`#q${i}`).value.trim(); const n = parseFloat(given.replace(/,/g, '').replace('−', '-').replace(/[^0-9.\-]/g, '')); right = !Number.isNaN(n) && Math.abs(n - q.answer) <= (q.tol || 1e-9); }
        else { given = form.querySelector(`#q${i}`).value.trim(); right = (q.accept || []).some((a) => norm(a) === norm(given)); }
        if (right) score++;
        const correct = q.type === 'mc' ? q.options[q.answer] : q.type === 'num' ? q.answer : (q.accept || [])[0];
        const fb = form.querySelector(`#fb${i}`); fb.className = 'fb ' + (right ? 'right' : 'wrong');
        fb.innerHTML = right ? `✓ Correct${q.explain ? ` <span class="why">${esc(q.explain)}</span>` : ''}` : `✗ The answer is ${esc(correct)}.${q.explain ? ` <span class="why">${esc(q.explain)}</span>` : ''}`;
        return { given, right };
      });
      return { score, max: quiz.length, answers };
    }
    function shrink(file) {
      if (!/^image\/(jpeg|png|webp|heic)/.test(file.type)) return Promise.resolve(file);
      return new Promise((res) => { const img = new Image(); const url = URL.createObjectURL(file);
        img.onload = () => { const s = Math.min(1, 1800 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); c.toBlob((b) => { URL.revokeObjectURL(url); res(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.82); };
        img.onerror = () => { URL.revokeObjectURL(url); res(file); }; img.src = url; });
    }
    const subView = (s, extra = '') => `<div class="sub"><div class="panel-head"><span class="muted small">Sent ${fmtWhen(s.created_at)}${s.minutes_taken != null ? ` · took ${s.minutes_taken} min` : ''}</span>
      ${s.mark != null ? `<span class="pill done">${s.mark} / ${s.mark_max}</span>` : '<span class="pill sent">Waiting for marking</span>'}</div>
      ${s.answer_text ? `<b class="small">${role === 'admin' ? "Hadi's answer" : "Your answer"}</b><div class="answer-text">${esc(s.answer_text)}</div>` : ''}
      ${(s.files || []).length ? `<div class="thumbs">${s.files.map((f) => `<a data-file="${esc(f)}" target="_blank" rel="noopener"><span class="file">Photo</span></a>`).join('')}</div>` : ''}
      ${s.feedback ? `<div class="feedback"><b>Feedback${role === 'admin' ? " for Hadi" : ""}</b>\n${esc(s.feedback)}</div>` : ''}${extra}</div>`;
    async function thumbs() {
      for (const a of app.querySelectorAll('[data-file]')) {
        try { const url = await api.fileUrl(a.dataset.file); a.href = url; a.innerHTML = /\.pdf($|\?)/i.test(a.dataset.file) ? '<span class="file">PDF</span>' : `<img src="${esc(url)}" alt="Photo of written work">`; }
        catch (e) { a.innerHTML = '<span class="file">Could not load</span>'; }
      }
    }

    function quizAnswers(l, a) {
      const q = l.quiz || []; const ans = a.answers || [];
      const right = (x) => (!x ? '' : x.type === 'mc' ? (x.options || [])[x.answer] : x.type === 'num' ? x.answer : (x.accept || [])[0]);
      const shown = (x, g) => (g == null || g === '' ? '<span class="muted">(left blank)</span>' : esc(x && x.type === 'mc' ? (x.options || [])[g] : g));
      return `<div class="qa"><div class="panel-head"><span class="muted small">Quiz ${fmtWhen(a.created_at)}</span><span class="pill ${a.score === a.max ? 'done' : 'todo'}">${a.score} / ${a.max}</span></div>
        ${ans.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>Question</th><th>Hadi's answer</th><th>Right answer</th></tr></thead><tbody>${ans.map((g, i) => `<tr><td>${esc((q[i] || {}).q || 'Question ' + (i + 1))}</td><td>${g.right ? '<span class="ok-t">✓</span>' : '<span class="err-t">✗</span>'} ${shown(q[i], g.given)}</td><td class="muted">${g.right ? '' : esc(right(q[i]))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Answers for this attempt weren\'t saved.</p>'}</div>`;
    }
    function hadiWork(l) {
      const at = D.attempts.filter((a) => a.lesson_id === l.id); const subs = D.subs.filter((s) => s.lesson_id === l.id);
      return `<section class="panel" id="work"><h2>Hadi's work</h2>
        ${!at.length && !subs.length ? '<p class="muted">Nothing done for this lesson yet.</p>' : ''}
        ${at.length ? `<h3>Memory quiz</h3>${at.map((a) => quizAnswers(l, a)).join('')}` : ''}
        ${subs.length ? `<h3 style="margin-top:14px">Work he sent</h3>${subs.map((x) => subView(x, x.mark == null ? '<a class="btn primary sm" href="#marking">Mark it</a>' : '')).join('')}` : ''}</section>`;
    }
    async function lessonView(id) {
      const l = D.byId[id]; const admin = role === 'admin';
      if (!l) return shell('home', page('<section class="panel"><h1>Lesson not found</h1><p><a href="#home">Back to your dashboard</a></p></section>'));
      const p = prog(id);
      shell(admin ? 'lessons' : 'today', page(`<div class="narrow"><div class="page-head"><a class="small" href="${admin ? '#lessons' : '#today'}">← Back</a><p class="kicker dark"><span class="subj ${l.subject}">${SUBJECTS[l.subject] || ''}</span> · ${fmtDay(l.lesson_date)}</p><h1>${esc(l.title)}</h1></div>
        ${admin && l.status === 'draft' ? '<p class="msg warn">Draft: Hadi can\'t see this lesson until you approve its week on the Lessons page.</p>' : ''}
        <article class="lesson" id="lesson-body">${l.body_html}</article>
        <p class="report-row">Spotted a mistake in this lesson? ${report({ place: 'lesson', ref: l.id, context: l.title })}</p>
        ${admin ? hadiWork(l) + '<section class="panel"><details class="other"><summary>Answer sheet for this lesson (only parents see this)</summary><p class="muted small">The right answers and marking guide. Claude uses it to mark Hadi\'s work, and you can use it to check a mark.</p><div class="lesson answers" id="answer-sheet"><p class="muted">Loading the answer sheet…</p></div></details></section>' : `
        <section class="panel" id="send"><h2>Send your work</h2>${p.subs.map((s) => subView(s)).join('')}
          <p class="muted">${p.marked ? 'Want to send a better answer after reading the feedback? Type it below and press Send again.' : p.sent ? 'Spotted a mistake, or want to add something? Type the new or extra answer below and press <b>Send again</b>. Everything you send for this lesson is marked together.' : 'Type your answers, or take photos of your page. Then press Send.'}</p>
          <form id="sendform" class="form">
            <label for="answer">Your answers<textarea id="answer" rows="8" placeholder="Q1&#10;1. ...&#10;2. ..."></textarea></label>
            <label for="photos">Photos of your written work (optional)<input id="photos" type="file" accept="image/*,application/pdf" multiple></label>
            <label for="mins">Time for the exam-style question, in minutes (optional)<input id="mins" type="number" min="0" max="180" inputmode="numeric"></label>
            <div id="send-msg"></div><button class="btn primary lg" type="submit" id="send-btn">${p.sent ? 'Send again' : 'Send my work'}</button></form></section>`}</div>`));
      const slot = app.querySelector('.quiz-slot');
      if (slot && l.quiz && l.quiz.length) {
        slot.outerHTML = quizHtml(l.quiz, l) + (p.best ? `<p class="muted small">Your best so far: ${p.best.score}/${p.best.max}.</p>` : '');
        const form = document.getElementById('quiz');
        if (!admin) { const qk = dKey(id, 'quiz'); const saved = dGet(qk) || {};
          [...form.elements].forEach((el, i) => { const k = el.name || 'f' + i; if (!(k in saved)) return;
            if (el.type === 'radio' || el.type === 'checkbox') el.checked = saved[k] === el.value; else if (el.tagName !== 'BUTTON') el.value = saved[k]; });
          form.addEventListener('input', () => { const v = {}; [...form.elements].forEach((el, i) => { const k = el.name || 'f' + i;
            if (el.type === 'radio' || el.type === 'checkbox') { if (el.checked) v[k] = el.value; } else if (el.tagName !== 'BUTTON' && el.value) v[k] = el.value; }); dSet(qk, v); }); }
        form.onsubmit = async (e) => { e.preventDefault(); const r = markQuiz(l.quiz, form); dSet(dKey(id, 'quiz'), null);
          document.getElementById('quiz-score').textContent = `${r.score} / ${r.max}${r.score === r.max ? ' Brilliant!' : ''}`;
          if (!admin) { try { await api.addAttempt({ lesson_id: id, ...r }); D.attempts.unshift({ lesson_id: id, ...r, created_at: new Date().toISOString() }); } catch (x) { document.getElementById('quiz-score').textContent += ' (score not saved: ' + x.message + ')'; } } };
      }
      if (admin) { thumbs(); const sheet = await api.answerSheet(id).catch(() => null); document.getElementById('answer-sheet').innerHTML = sheet || '<p class="muted">No answer sheet for this lesson.</p>'; return; }
      thumbs();
      const ak = dKey(id, 'answer'); const ans = document.getElementById('answer'); const minsEl = document.getElementById('mins');
      const draft = dGet(ak); if (draft) { ans.value = draft.text || ''; minsEl.value = draft.mins || ''; if (draft.text) document.getElementById('send-msg').innerHTML = '<p class="msg info">Your unsent answer was kept. Press Send when you are ready.</p>'; }
      const keep = () => dSet(ak, ans.value.trim() || minsEl.value ? { text: ans.value, mins: minsEl.value } : null);
      ans.addEventListener('input', keep); minsEl.addEventListener('input', keep);
      window.onbeforeunload = () => (document.getElementById('photos') && document.getElementById('photos').files.length ? 'Your photos have not been sent yet.' : undefined);
      document.getElementById('sendform').onsubmit = async (e) => {
        e.preventDefault(); const text = document.getElementById('answer').value.trim(); const files = [...document.getElementById('photos').files]; const msg = document.getElementById('send-msg');
        if (!text && !files.length) { msg.innerHTML = '<p class="msg err">Type your answers or add a photo first.</p>'; return; }
        const b = document.getElementById('send-btn'); b.disabled = true; b.textContent = 'Sending…';
        try { const small = await Promise.all(files.map(shrink)); const mins = parseInt(document.getElementById('mins').value, 10);
          await api.addSub({ lesson_id: id, answer_text: text, minutes_taken: Number.isNaN(mins) ? null : mins, files: small });
          dSet(ak, null); window.onbeforeunload = null; await load(); await lessonView(id); document.getElementById('send-msg').innerHTML = '<p class="msg ok">Sent. Well done! It will be marked this evening.</p>'; document.getElementById('send').scrollIntoView(); }
        catch (x) { b.disabled = false; b.textContent = p.sent ? 'Send again' : 'Send my work'; msg.innerHTML = `<p class="msg err">That didn't send: ${esc(x.message)}. Check your internet and press Send again.</p>`; }
      };
    }

    function topicsHtml(topics, admin) {
      const by = groupBy(topics, (t) => t.subject);
      return Object.keys(SUBJECTS).filter((s) => by[s]).map((s) => { const list = by[s]; const c = (st) => list.filter((t) => t.status === st).length;
        return `<section class="panel"><div class="panel-head"><h2><span class="subj ${s}">${SUBJECTS[s]}</span></h2><span class="small muted">${c('Weak')} weak · ${c('Improving')} improving · ${c('Secure')} secure</span></div>
          <div class="scroll-x"><table class="data"><thead><tr><th>Skill</th><th>Paper / question</th><th>Status</th>${admin ? '<th>Evidence</th>' : ''}</tr></thead><tbody>
          ${list.map((t) => `<tr><td>${esc(t.skill)}</td><td class="muted small">${esc(t.paper_q)}</td>
            <td>${admin ? `<select data-topic="${t.id}" aria-label="Status for ${esc(t.skill)}">${TOPIC_STATUSES.map((x) => `<option ${x === t.status ? 'selected' : ''}>${x}</option>`).join('')}</select>` : `<span class="pill st-${t.status.split(' ')[0]}">${esc(t.status)}</span>`}</td>
            ${admin ? `<td><input data-evidence="${t.id}" value="${esc(t.evidence)}" placeholder="e.g. Wk1 Mon 3/4" aria-label="Evidence"></td>` : ''}</tr>`).join('')}</tbody></table></div></section>`; }).join('');
    }
    async function progressView() {
      const topics = await api.topics(); const done = D.lessons.filter((l) => prog(l.id).sent).length;
      const best = D.lessons.map((l) => prog(l.id).best).filter(Boolean); const q = best.length ? pct(best.reduce((a, b) => a + b.score, 0), best.reduce((a, b) => a + b.max, 0)) : null;
      const marked = D.subs.filter((s) => s.mark != null);
      shell('progress', page(`<div class="narrow"><div class="page-head"><p class="kicker dark">My progress</p><h1>How it's going</h1></div>
        <div class="stats"><div class="stat"><span>Lessons with work sent</span><b>${done} of ${D.lessons.length}</b></div><div class="stat"><span>Memory quizzes</span><b>${q == null ? '–' : q + '%'}</b></div><div class="stat"><span>Work marked</span><b>${marked.length}</b></div></div>
        <section class="panel"><h2>Marked work</h2>${marked.length ? marked.map((s) => `<div class="mw"><div class="panel-head"><a href="#lesson-${esc(s.lesson_id)}">${esc((D.byId[s.lesson_id] || {}).title || s.lesson_id)}</a><span class="pill done">${s.mark} / ${s.mark_max}</span></div>${s.feedback ? `<div class="feedback">${esc(s.feedback)}</div>` : ''}</div>`).join('') : '<p class="muted">Nothing marked yet. Your marks and feedback will appear here.</p>'}</section>
        ${topicsHtml(topics, false)}</div>`));
    }
    async function topicsView() {
      const topics = await api.topics();
      shell('topics', page(`<div class="page-head"><p class="kicker dark">Hadi</p><h1>Weak topics</h1><p class="muted">Changes save straight away. Hadi sees the status but can't change it. Marking runs update these from his work.</p></div><div id="topic-msg"></div>${topicsHtml(topics, true)}`));
      const saved = (ok, t) => { document.getElementById('topic-msg').innerHTML = `<p class="msg ${ok ? 'ok' : 'err'}">${esc(t)}</p>`; };
      app.querySelectorAll('[data-topic]').forEach((s) => { s.onchange = () => api.updateTopic(Number(s.dataset.topic), { status: s.value, last_tested: today() }).then(() => saved(true, 'Saved.'), (x) => saved(false, x.message)); });
      app.querySelectorAll('[data-evidence]').forEach((i) => { i.onchange = () => api.updateTopic(Number(i.dataset.evidence), { evidence: i.value }).then(() => saved(true, 'Saved.'), (x) => saved(false, x.message)); });
    }
    function markingView(filter) {
      filter = filter || 'todo'; const list = D.subs.filter((s) => (filter === 'todo' ? s.mark == null : s.mark != null));
      shell('marking', page(`<div class="page-head"><p class="kicker dark">Hadi</p><h1>Marking</h1><p class="muted">Claude marks new work every weekday evening and at the Saturday run. You can also mark or change anything here, using the answer sheet.</p></div>
        <div class="row" style="margin-bottom:16px"><button class="btn ${filter === 'todo' ? 'primary' : 'ghost'} sm" data-filter="todo">To mark (${toMark()})</button><button class="btn ${filter === 'done' ? 'primary' : 'ghost'} sm" data-filter="done">Marked (${D.subs.length - toMark()})</button></div>
        ${list.length ? list.map((s) => { const l = D.byId[s.lesson_id] || { title: s.lesson_id, subject: '' }; return `<section class="panel"><p class="kicker dark"><span class="subj ${l.subject}">${SUBJECTS[l.subject] || ''}</span></p><h2><a href="#lesson-${esc(s.lesson_id)}">${esc(l.title)}</a></h2><p class="small"><a href="#lesson-${esc(s.lesson_id)}">Open the lesson to see his quiz answers and the full lesson</a></p>
          ${subView(s, `<details data-sheet="${esc(s.lesson_id)}" class="other"><summary>Show the answer sheet</summary><div class="lesson answers"><p class="muted">Loading…</p></div></details>
            <form class="mark-form" data-mark="${s.id}"><label for="m-${s.id}">Mark<input type="number" id="m-${s.id}" min="0" value="${s.mark ?? ''}" required></label><label for="mm-${s.id}">Out of<input type="number" id="mm-${s.id}" min="1" value="${s.mark_max ?? ''}" required></label>
            <label for="fb-${s.id}" class="grow">Feedback for Hadi<textarea id="fb-${s.id}" rows="3">${esc(s.feedback || '')}</textarea></label><button class="btn primary" type="submit">Save mark</button></form>`)}</section>`; }).join('')
          : `<section class="panel"><p class="muted">${filter === 'todo' ? 'Nothing waiting. When Hadi sends work, it appears here.' : 'Nothing marked yet.'}</p></section>`}`));
      app.querySelectorAll('[data-filter]').forEach((b) => { b.onclick = () => markingView(b.dataset.filter); });
      app.querySelectorAll('details[data-sheet]').forEach((d) => { d.addEventListener('toggle', async () => { if (d.open && !d.dataset.loaded) { d.dataset.loaded = 1; d.querySelector('.lesson').innerHTML = (await api.answerSheet(d.dataset.sheet)) || 'No answer sheet.'; } }); });
      app.querySelectorAll('form[data-mark]').forEach((f) => { f.onsubmit = async (e) => { e.preventDefault(); const id = Number(f.dataset.mark); const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Saving…';
        try { await api.mark(id, { mark: Number(f.querySelector(`#m-${id}`).value), mark_max: Number(f.querySelector(`#mm-${id}`).value), feedback: f.querySelector(`#fb-${id}`).value.trim() || null }); await load(); markingView(filter); }
        catch (x) { b.disabled = false; b.textContent = 'Save mark'; f.insertAdjacentHTML('afterend', `<p class="msg err">${esc(x.message)}</p>`); } }; });
      thumbs();
    }

    // Returns true if it handled the route.
    async function route(r) {
      if (!role) return false;
      const mine = role === 'admin' ? ['lessons', 'marking', 'marking-done', 'topics'] : ['today', 'lessons', 'progress'];
      if (!(mine.includes(r) || r.startsWith('lesson-'))) return false;
      await load();
      if (r.startsWith('lesson-')) await lessonView(r.slice(7));
      else if (r === 'today') todayView(); else if (r === 'lessons') lessonsView(); else if (r === 'progress') await progressView();
      else if (r === 'topics') await topicsView(); else if (r === 'marking') markingView('todo'); else if (r === 'marking-done') markingView('done');
      return true;
    }
    return { init, forget, load, nav, dashBlock, route, get role() { return role; }, get checked() { return checked; }, studentId: () => (D && D.subs[0] ? D.subs[0].user_id : null), reset: api.reset };
  };
})();
