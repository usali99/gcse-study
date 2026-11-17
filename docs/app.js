/* GCSE study site. One page, two sides: the student's lessons and the parent's admin.
   Data comes from Supabase when config.js has keys, otherwise from built-in demo data. */
(function () {
  'use strict';

  const SUBJECTS = {
    english: 'English Language',
    maths: 'Maths',
    chemistry: 'Chemistry',
    physics: 'Physics',
  };
  const TOPIC_STATUSES = ['Not yet tested', 'Weak', 'Improving', 'Secure'];
  const cfg = window.APP_CONFIG || {};
  const app = document.getElementById('app');

  // ---------- small helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const fmtDay = (iso, opts) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', opts || { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtWhen = (ts) => new Date(ts).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const groupBy = (list, fn) => list.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {});
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  };

  // ---------- data: Supabase ----------
  function supabaseApi() {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    let me = null;
    return {
      demo: false,
      async session() {
        const { data } = await sb.auth.getSession();
        if (!data.session) return null;
        const p = must(await sb.from('profiles').select('*').eq('id', data.session.user.id).maybeSingle());
        me = { id: data.session.user.id, name: (p && p.name) || 'there', role: (p && p.role) || 'student' };
        return me;
      },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password do not match. Check them and try again.' : error.message);
        return this.session();
      },
      async signOut() { await sb.auth.signOut(); },
      async lessons() { return must(await sb.from('lessons').select('*').order('lesson_date').order('slot')); },
      async answerSheet(id) { const r = must(await sb.from('answer_sheets').select('body_html').eq('lesson_id', id).maybeSingle()); return r && r.body_html; },
      async quizAttempts() { return must(await sb.from('quiz_attempts').select('*').order('created_at', { ascending: false })); },
      async addQuizAttempt(a) { must(await sb.from('quiz_attempts').insert({ ...a, user_id: me.id })); },
      async submissions() { return must(await sb.from('submissions').select('*').order('created_at', { ascending: false })); },
      async addSubmission({ lesson_id, answer_text, minutes_taken, files }) {
        const paths = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
          const path = `${me.id}/${lesson_id}/${Date.now()}-${i + 1}.${ext}`;
          must(await sb.storage.from('work').upload(path, f, { contentType: f.type || undefined }));
          paths.push(path);
        }
        must(await sb.from('submissions').insert({ user_id: me.id, lesson_id, answer_text, minutes_taken, files: paths }));
      },
      async fileUrl(path) { const r = must(await sb.storage.from('work').createSignedUrl(path, 3600)); return r.signedUrl; },
      async markSubmission(id, m) { must(await sb.from('submissions').update({ ...m, marked_at: new Date().toISOString() }).eq('id', id)); },
      async topics() { return must(await sb.from('weak_topics').select('*').order('subject').order('sort')); },
      async updateTopic(id, patch) { must(await sb.from('weak_topics').update(patch).eq('id', id)); },
      async setWeekStatus(week, status) { must(await sb.from('lessons').update({ status }).eq('week', week)); },
      async reports() { return must(await sb.from('reports').select('*').order('week', { ascending: false })); },
    };
  }

  // ---------- data: demo (preview with example data, saved in this browser only) ----------
  function demoApi() {
    const C = window.DEMO_CONTENT || { lessons: [], answers: [], topics: [] };
    const KEY = 'gcse-demo-v1';
    const fresh = () => {
      const first = C.lessons[0];
      return {
        status: Object.fromEntries(C.lessons.map((l) => [l.id, 'published'])),
        attempts: first ? [{ id: 1, lesson_id: first.id, score: 4, max: (first.quiz || []).length || 5, answers: [], created_at: new Date(Date.now() - 3600e3).toISOString(), example: true }] : [],
        subs: first ? [{ id: 1, lesson_id: first.id, example: true, created_at: new Date(Date.now() - 3000e3).toISOString(), minutes_taken: 7, files: [],
          answer_text: 'EXAMPLE ANSWER (not real work)\n\nQ1\n1. It is on the north coast of Kent\n2. You can get there by steamer from London Bridge\n3. It only costs a few shillings\n4. The streets are narrow and steep\n\nQ2\n1. The sands are broad\n2. They are pale golden\n3. You can hire a donkey for sixpence\n4. The band plays until ten o\'clock\n\nQ3: "without once seeing the pavement"\n\nExit check: the hardest part was the old words.',
          mark: null, mark_max: null, feedback: null, marked_at: null }] : [],
        topics: C.topics.map((t, i) => ({ id: i + 1, evidence: '', last_tested: null, ...t })),
        nextId: 100,
      };
    };
    let S = store.get(KEY) || fresh();
    const save = () => store.set(KEY, S);
    let me = store.get(KEY + '-me');
    return {
      demo: true,
      async session() { return me; },
      async signIn(role) {
        me = role === 'admin' ? { id: 'parent', name: 'Usman', role: 'admin' } : { id: 'student', name: 'Hadi', role: 'student' };
        store.set(KEY + '-me', me); return me;
      },
      async signOut() { me = null; store.del(KEY + '-me'); },
      reset() { S = fresh(); save(); },
      async lessons() {
        return C.lessons.map((l) => ({ ...l, status: S.status[l.id] || 'draft' }))
          .filter((l) => me.role === 'admin' || l.status === 'published');
      },
      async answerSheet(id) { if (me.role !== 'admin') return null; const a = C.answers.find((x) => x.lesson_id === id); return a && a.body_html; },
      async quizAttempts() { return [...S.attempts].reverse(); },
      async addQuizAttempt(a) { S.attempts.push({ ...a, id: S.nextId++, created_at: new Date().toISOString() }); save(); },
      async submissions() { return [...S.subs].reverse(); },
      async addSubmission({ lesson_id, answer_text, minutes_taken, files }) {
        const names = [];
        for (const f of files) names.push(await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(''); r.readAsDataURL(f); }));
        S.subs.push({ id: S.nextId++, lesson_id, answer_text, minutes_taken, files: names.filter(Boolean), created_at: new Date().toISOString(), mark: null, mark_max: null, feedback: null, marked_at: null });
        save();
      },
      async fileUrl(p) { return p; },
      async markSubmission(id, m) { const s = S.subs.find((x) => x.id === id); Object.assign(s, m, { marked_at: new Date().toISOString() }); save(); },
      async topics() { return S.topics; },
      async updateTopic(id, patch) { Object.assign(S.topics.find((t) => t.id === id), patch); save(); },
      async setWeekStatus(week, status) { C.lessons.filter((l) => l.week === week).forEach((l) => { S.status[l.id] = status; }); save(); },
      async reports() { return []; },
    };
  }

  const api = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase ? supabaseApi() : demoApi();
  let user = null;
  let data = null; // cached lessons, attempts, submissions for the current render

  async function load() {
    const [lessons, attempts, subs] = await Promise.all([api.lessons(), api.quizAttempts(), api.submissions()]);
    data = { lessons, attempts, subs, lessonById: byId(lessons) };
    return data;
  }

  // Lesson progress for the student: quiz best, work sent, mark.
  function progressFor(lessonId) {
    const at = data.attempts.filter((a) => a.lesson_id === lessonId);
    const best = at.reduce((b, a) => (!b || a.score / a.max > b.score / b.max ? a : b), null);
    const subs = data.subs.filter((s) => s.lesson_id === lessonId);
    const marked = subs.find((s) => s.mark != null);
    return { best, subs, marked, sent: subs.length > 0 };
  }
  function statusPill(lessonId) {
    const p = progressFor(lessonId);
    if (p.marked) return `<span class="pill done">Marked ${p.marked.mark}/${p.marked.mark_max}</span>`;
    if (p.sent) return '<span class="pill sent">Sent, waiting for marking</span>';
    if (p.best) return `<span class="pill todo">Quiz ${p.best.score}/${p.best.max}, work not sent</span>`;
    return '<span class="pill todo">Not started</span>';
  }

  // ---------- shell ----------
  function navLinks() {
    const needs = data ? data.subs.filter((s) => s.mark == null).length : 0;
    const links = user.role === 'admin'
      ? [['overview', 'Overview'], ['marking', `Marking${needs ? ` <span class="count num">${needs}</span>` : ''}`], ['lessons', 'Lessons'], ['topics', 'Weak topics']]
      : [['today', 'Today'], ['week', 'All lessons'], ['progress', 'My progress']];
    return links;
  }
  function shell(route, inner) {
    const links = navLinks();
    app.innerHTML = `
      <header class="topbar"><div class="topbar-inner">
        <a class="brand" href="#${links[0][0]}"><span class="brand-mark">G</span>GCSE Study</a>
        <nav class="nav" aria-label="Main">${links.map(([r, t]) => `<a href="#${r}" ${route === r ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
        <div class="who"><span>${esc(user.name)}${user.role === 'admin' ? ' (parent)' : ''}${api.demo ? ' · preview' : ''}</span><button class="btn" id="signout">Sign out</button></div>
      </div></header>
      <main>${inner}</main>`;
    document.getElementById('signout').onclick = async () => { await api.signOut(); user = null; location.hash = ''; render(); };
    window.scrollTo(0, 0);
  }

  // ---------- sign in ----------
  function signInView(err) {
    app.innerHTML = `
      <main><div class="signin panel">
        <div class="page-head"><span class="eyebrow">GCSE Study</span><h1>Sign in</h1></div>
        ${api.demo ? `
          <p class="demo-note">This is a preview with week 1's real lessons and a little example work. Nothing here is saved online.</p>
          <div class="row"><button class="btn primary big" data-demo="student">Open Hadi's side</button><button class="btn big" data-demo="admin">Open parent side</button></div>
          <button class="btn small" id="demo-reset">Clear the preview's example work</button>` : `
          <form id="signin" class="panel" style="border:0;padding:0">
            <label class="field" for="email">Email<input id="email" type="email" autocomplete="username" required></label>
            <label class="field" for="password">Password<input id="password" type="password" autocomplete="current-password" required></label>
            ${err ? `<div class="msg err">${esc(err)}</div>` : ''}
            <button class="btn primary big" type="submit" id="signin-btn">Sign in</button>
          </form>`}
      </div></main>`;
    if (api.demo) {
      app.querySelectorAll('[data-demo]').forEach((b) => { b.onclick = async () => { user = await api.signIn(b.dataset.demo); location.hash = ''; render(); }; });
      document.getElementById('demo-reset').onclick = (e) => { api.reset(); e.target.textContent = 'Cleared'; };
    } else {
      document.getElementById('signin').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('signin-btn'); btn.disabled = true; btn.textContent = 'Signing in…';
        try { user = await api.signIn(document.getElementById('email').value.trim(), document.getElementById('password').value); location.hash = ''; render(); }
        catch (x) { signInView(x.message); }
      };
    }
  }

  // ---------- student: today ----------
  function lessonCard(l, opts = {}) {
    return `<a class="lesson-card" href="#lesson-${esc(l.id)}">
      <span class="stripe ${l.subject}"></span>
      <span class="body"><span class="subj ${l.subject}">${SUBJECTS[l.subject]}${opts.date ? ` · ${fmtDay(l.lesson_date, { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}</span>
        <span class="title">${esc(l.title)}</span><span class="muted small">About ${l.minutes} minutes${l.status === 'draft' ? ' · <span class="pill draft">Not published yet</span>' : ''}</span></span>
      <span class="status">${opts.admin ? '' : statusPill(l.id)}</span></a>`;
  }

  function todayView() {
    const t = todayIso();
    const lessons = data.lessons;
    const todays = lessons.filter((l) => l.lesson_date === t);
    const next = lessons.find((l) => l.lesson_date > t);
    const nextDay = next ? lessons.filter((l) => l.lesson_date === next.lesson_date) : [];
    const catchUp = lessons.filter((l) => l.lesson_date < t && !progressFor(l.id).sent).slice(-4);
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    let main;
    if (todays.length) {
      main = `<section class="panel"><h2>Today's lessons</h2><p class="muted">Do them in order, with a 10-minute break in between.</p><div class="lesson-list">${todays.map((l) => lessonCard(l)).join('')}</div></section>`;
    } else if (nextDay.length) {
      const wk = [0, 6].includes(new Date().getDay());
      main = `<section class="panel"><h2>${wk ? 'Weekend: no lessons today' : 'No lessons today'}</h2><p class="muted">Next up, ${fmtDay(next.lesson_date)}:</p><div class="lesson-list">${nextDay.map((l) => lessonCard(l)).join('')}</div></section>`;
    } else {
      main = '<section class="panel"><h2>No new lessons yet</h2><p class="muted">Next week\'s lessons will appear here once they are ready.</p></section>';
    }
    shell('today', `<div class="narrow">
      <div class="page-head"><span class="eyebrow">${fmtDay(t)}</span><h1>${hello}, ${esc(user.name)}</h1></div>
      ${main}
      ${catchUp.length ? `<section class="panel"><h2>Still to send</h2><p class="muted">These lessons don't have any work sent yet.</p><div class="lesson-list">${catchUp.map((l) => lessonCard(l, { date: true })).join('')}</div></section>` : ''}
    </div>`);
  }

  function weekListView(route, admin) {
    const weeks = groupBy(data.lessons, (l) => l.week);
    const nums = Object.keys(weeks).map(Number).sort((a, b) => b - a);
    const body = nums.map((w) => {
      const ls = weeks[w];
      const draft = ls.some((l) => l.status === 'draft');
      const days = groupBy(ls, (l) => l.lesson_date);
      return `<section class="panel">
        <div class="row spread"><div><h2>Week ${w}</h2><span class="muted small">Starts ${fmtDay(ls[0].lesson_date, { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
        ${admin ? `<div class="row">${draft ? '<span class="pill draft">Waiting for your approval</span>' : '<span class="pill done">Live for Hadi</span>'}
          <button class="btn ${draft ? 'primary' : ''}" data-week="${w}" data-to="${draft ? 'published' : 'draft'}">${draft ? 'Approve and publish' : 'Hide from Hadi'}</button></div>` : ''}</div>
        ${Object.keys(days).sort().map((d) => `<div class="day-group"><h3>${fmtDay(d)}</h3><div class="lesson-list">${days[d].map((l) => lessonCard(l, { admin })).join('')}</div></div>`).join('')}
      </section>`;
    }).join('') || '<section class="panel"><p class="muted">No lessons yet.</p></section>';
    shell(route, `<div class="${admin ? '' : 'narrow'}" style="display:grid;gap:24px">
      <div class="page-head"><span class="eyebrow">${admin ? 'Admin' : 'Lessons'}</span><h1>${admin ? 'Lessons and approval' : 'All lessons'}</h1>
      ${admin ? '<p class="muted">New weeks arrive as drafts. Open a lesson to read it with its answer sheet, then approve the week to show it to Hadi.</p>' : ''}</div>${body}</div>`);
    app.querySelectorAll('[data-week]').forEach((b) => {
      b.onclick = async () => { b.disabled = true; await api.setWeekStatus(Number(b.dataset.week), b.dataset.to); await load(); weekListView(route, admin); };
    });
  }

  // ---------- lesson page ----------
  function quizHtml(quiz) {
    return `<form class="quiz" id="quiz" novalidate>
      <div class="row spread"><h3>Answer here</h3><span class="muted small">It marks itself when you press Check</span></div>
      <ol>${quiz.map((q, i) => `<li><div class="q">${esc(q.q)}</div>
        ${q.type === 'mc'
          ? `<div class="opts" role="radiogroup">${q.options.map((o, j) => `<label><input type="radio" name="q${i}" id="q${i}-${j}" value="${j}"> <span>${esc(o)}</span></label>`).join('')}</div>`
          : `<input type="${q.type === 'num' ? 'text' : 'text'}" inputmode="${q.type === 'num' ? 'decimal' : 'text'}" id="q${i}" name="q${i}" autocomplete="off" aria-label="Your answer">`}
        <div class="fb" id="fb${i}" aria-live="polite"></div></li>`).join('')}</ol>
      <div class="row"><button class="btn primary" type="submit" id="quiz-check">Check my answers</button><span class="score" id="quiz-score" aria-live="polite"></span></div>
    </form>`;
  }
  function markQuiz(quiz, form) {
    let score = 0;
    const answers = quiz.map((q, i) => {
      let given; let right;
      if (q.type === 'mc') {
        const c = form.querySelector(`input[name=q${i}]:checked`);
        given = c ? Number(c.value) : null; right = given === q.answer;
      } else if (q.type === 'num') {
        given = form.querySelector(`#q${i}`).value.trim();
        const n = parseFloat(given.replace(/,/g, '').replace(/[^0-9.\-−]/g, '').replace('−', '-'));
        right = !Number.isNaN(n) && Math.abs(n - q.answer) <= (q.tol || 1e-9);
      } else {
        given = form.querySelector(`#q${i}`).value.trim();
        right = (q.accept || []).some((a) => norm(a) === norm(given));
      }
      if (right) score++;
      const correct = q.type === 'mc' ? q.options[q.answer] : q.type === 'num' ? q.answer : (q.accept || [])[0];
      const fb = form.querySelector(`#fb${i}`);
      fb.className = 'fb ' + (right ? 'right' : 'wrong');
      fb.innerHTML = right ? `✓ Correct${q.explain ? ` <span class="why">${esc(q.explain)}</span>` : ''}`
        : `✗ The answer is ${esc(correct)}.${q.explain ? ` <span class="why">${esc(q.explain)}</span>` : ''}`;
      return { given, right };
    });
    return { score, max: quiz.length, answers };
  }

  async function lessonView(id) {
    const l = data.lessonById[id];
    if (!l) { shell('', '<div class="narrow"><section class="panel"><h1>Lesson not found</h1><p><a href="#">Back to the start</a></p></section></div>'); return; }
    const admin = user.role === 'admin';
    const p = progressFor(id);
    shell(admin ? 'lessons' : 'week', `<div class="narrow">
      <div class="page-head"><a href="${admin ? '#lessons' : '#today'}" class="small">← Back</a><span class="subj ${l.subject}">${SUBJECTS[l.subject]} · ${fmtDay(l.lesson_date)}</span><h1>${esc(l.title)}</h1></div>
      ${admin && l.status === 'draft' ? '<div class="msg" style="background:var(--hi);color:var(--hi-ink)">Draft: Hadi can\'t see this lesson until you approve its week on the Lessons page.</div>' : ''}
      <article class="lesson" id="lesson-body">${l.body_html}</article>
      ${admin ? '<section class="lesson answers" id="answer-sheet"><p class="muted">Loading the answer sheet…</p></section>' : `
      <section class="panel" id="send">
        <h2>Send your work</h2>
        ${p.subs.map((s) => subView(s)).join('')}
        <p class="muted">${p.sent ? 'Want to add more? Send it below.' : 'Type your answers to Parts 4 and 5, or take photos of your page. Then press Send.'}</p>
        <form id="sendform" class="panel" style="border:0;padding:0">
          <label class="field" for="answer">Your answers<textarea id="answer" placeholder="Q1&#10;1. ...&#10;2. ..."></textarea></label>
          <label class="field" for="photos">Photos of your written work (optional)<input id="photos" type="file" accept="image/*,application/pdf" multiple></label>
          <label class="field" for="mins">Time for the exam-style question, in minutes (optional)<input id="mins" type="number" min="0" max="180" inputmode="numeric"></label>
          <div id="send-msg"></div>
          <button class="btn primary big" type="submit" id="send-btn">Send my work</button>
        </form>
      </section>`}
    </div>`);

    // Quiz goes where the memory quiz was in the lesson.
    const slot = app.querySelector('.quiz-slot');
    if (slot && l.quiz && l.quiz.length) {
      slot.outerHTML = quizHtml(l.quiz) + (p.best ? `<p class="muted small">Your best so far: ${p.best.score}/${p.best.max}.</p>` : '');
      const form = document.getElementById('quiz');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const r = markQuiz(l.quiz, form);
        document.getElementById('quiz-score').textContent = `${r.score} / ${r.max}${r.score === r.max ? ' Brilliant!' : ''}`;
        if (!admin) { try { await api.addQuizAttempt({ lesson_id: id, ...r }); data.attempts.unshift({ lesson_id: id, ...r, created_at: new Date().toISOString() }); } catch (x) { document.getElementById('quiz-score').textContent += ' (score not saved: ' + x.message + ')'; } }
      };
    }
    if (admin) {
      const sheet = await api.answerSheet(id).catch(() => null);
      document.getElementById('answer-sheet').innerHTML = sheet || '<p class="muted">No answer sheet for this lesson.</p>';
      return;
    }
    hydrateThumbs();
    document.getElementById('sendform').onsubmit = async (e) => {
      e.preventDefault();
      const text = document.getElementById('answer').value.trim();
      const files = [...document.getElementById('photos').files];
      const msg = document.getElementById('send-msg');
      if (!text && !files.length) { msg.innerHTML = '<div class="msg err">Type your answers or add a photo first.</div>'; return; }
      const btn = document.getElementById('send-btn'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const small = await Promise.all(files.map(shrinkImage));
        const mins = parseInt(document.getElementById('mins').value, 10);
        await api.addSubmission({ lesson_id: id, answer_text: text, minutes_taken: Number.isNaN(mins) ? null : mins, files: small });
        await load(); await lessonView(id);
        document.getElementById('send-msg').innerHTML = '<div class="msg ok">Sent. Well done!</div>';
        document.getElementById('send').scrollIntoView();
      } catch (x) {
        btn.disabled = false; btn.textContent = 'Send my work';
        msg.innerHTML = `<div class="msg err">That didn't send: ${esc(x.message)}. Check your internet and press Send again.</div>`;
      }
    };
  }

  // Phone photos can be 5 MB or more. Shrink them before upload.
  function shrinkImage(file) {
    if (!/^image\/(jpeg|png|webp|heic)/.test(file.type)) return Promise.resolve(file);
    return new Promise((resolve) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => { URL.revokeObjectURL(url); resolve(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function subView(s, opts = {}) {
    const files = s.files || [];
    return `<div class="panel" style="background:var(--bg)">
      <div class="row spread"><span class="muted small">Sent ${fmtWhen(s.created_at)}${s.minutes_taken != null ? ` · took ${s.minutes_taken} min` : ''}${s.example ? ' · example' : ''}</span>
        ${s.mark != null ? `<span class="pill done num">${s.mark} / ${s.mark_max}</span>` : '<span class="pill sent">Waiting for marking</span>'}</div>
      ${s.answer_text ? `<div class="answer-text">${esc(s.answer_text)}</div>` : ''}
      ${files.length ? `<div class="thumbs">${files.map((f) => `<a data-file="${esc(f)}" target="_blank" rel="noopener"><span class="file">Photo</span></a>`).join('')}</div>` : ''}
      ${s.feedback ? `<div class="feedback"><b>Feedback:</b> ${esc(s.feedback)}</div>` : ''}
      ${opts.markForm || ''}
    </div>`;
  }
  async function hydrateThumbs() {
    for (const a of app.querySelectorAll('[data-file]')) {
      try {
        const url = await api.fileUrl(a.dataset.file);
        a.href = url;
        if (/\.pdf($|\?)/i.test(a.dataset.file) || /^data:application\/pdf/.test(a.dataset.file)) a.innerHTML = '<span class="file">PDF</span>';
        else a.innerHTML = `<img src="${esc(url)}" alt="Photo of written work">`;
      } catch (e) { a.innerHTML = '<span class="file">Could not load</span>'; }
    }
  }

  // ---------- student: progress ----------
  async function progressView() {
    const topics = await api.topics();
    const done = data.lessons.filter((l) => progressFor(l.id).sent).length;
    const quizScored = data.lessons.map((l) => progressFor(l.id).best).filter(Boolean);
    const qPct = quizScored.length ? pct(quizScored.reduce((a, b) => a + b.score, 0), quizScored.reduce((a, b) => a + b.max, 0)) : null;
    const marked = data.subs.filter((s) => s.mark != null);
    shell('progress', `<div class="narrow">
      <div class="page-head"><span class="eyebrow">My progress</span><h1>How it's going</h1></div>
      <div class="stats">
        <div class="stat"><span class="muted small">Lessons with work sent</span><b>${done} <span class="muted small">of ${data.lessons.length}</span></b></div>
        <div class="stat"><span class="muted small">Memory quizzes (best scores)</span><b>${qPct == null ? '–' : qPct + '%'}</b></div>
        <div class="stat"><span class="muted small">Pieces of work marked</span><b>${marked.length}</b></div>
      </div>
      <section class="panel"><h2>Marked work</h2>
        ${marked.length ? marked.map((s) => `<div class="row spread"><a href="#lesson-${esc(s.lesson_id)}">${esc((data.lessonById[s.lesson_id] || {}).title || s.lesson_id)}</a><span class="pill done num">${s.mark} / ${s.mark_max}</span></div>${s.feedback ? `<div class="feedback">${esc(s.feedback)}</div>` : ''}`).join('') : '<p class="muted">Nothing marked yet. Your marks and feedback will appear here.</p>'}
      </section>
      ${topicsHtml(topics, false)}
    </div>`);
  }

  function topicsHtml(topics, admin) {
    const bySub = groupBy(topics, (t) => t.subject);
    return Object.keys(SUBJECTS).filter((s) => bySub[s]).map((s) => {
      const list = bySub[s];
      const c = (st) => list.filter((t) => t.status === st).length;
      return `<section class="panel"><div class="row spread"><h2><span class="subj ${s}">${SUBJECTS[s]}</span></h2>
        <span class="small muted">${c('Weak')} weak · ${c('Improving')} improving · ${c('Secure')} secure</span></div>
        <div class="scroll-x"><table class="data"><thead><tr><th>Skill</th><th class="hide-sm">Paper / question</th><th>Status</th>${admin ? '<th>Evidence</th>' : ''}</tr></thead><tbody>
        ${list.map((t) => `<tr><td>${esc(t.skill)}</td><td class="hide-sm muted">${esc(t.paper_q)}</td>
          <td>${admin ? `<select data-topic="${t.id}" id="ts-${t.id}" aria-label="Status">${TOPIC_STATUSES.map((x) => `<option ${x === t.status ? 'selected' : ''}>${x}</option>`).join('')}</select>` : `<span class="pill ${t.status.replace(/ /g, '')} ${t.status.split(' ')[0]}">${esc(t.status)}</span>`}</td>
          ${admin ? `<td><input type="text" data-evidence="${t.id}" id="te-${t.id}" value="${esc(t.evidence)}" placeholder="e.g. Wk1 Mon 3/4" aria-label="Evidence"></td>` : ''}</tr>`).join('')}
        </tbody></table></div></section>`;
    }).join('');
  }

  // ---------- admin: overview ----------
  async function overviewView() {
    const reports = await api.reports().catch(() => []);
    const needs = data.subs.filter((s) => s.mark == null);
    const drafts = Object.keys(groupBy(data.lessons.filter((l) => l.status === 'draft'), (l) => l.week));
    const t = todayIso();
    const pub = data.lessons.filter((l) => l.status === 'published');
    const current = pub.filter((l) => l.lesson_date <= t).pop() || pub[0];
    const week = current ? current.week : null;
    const wl = week ? data.lessons.filter((l) => l.week === week) : [];
    const sent = wl.filter((l) => progressFor(l.id).sent).length;
    shell('overview', `
      <div class="page-head"><span class="eyebrow">Parent admin · ${fmtDay(t)}</span><h1>Overview</h1></div>
      <div class="stats">
        <a class="stat ${needs.length ? 'attn' : ''}" href="#marking" style="text-decoration:none;color:inherit"><span class="muted small">Work to mark</span><b>${needs.length}</b></a>
        <a class="stat ${drafts.length ? 'attn' : ''}" href="#lessons" style="text-decoration:none;color:inherit"><span class="muted small">Weeks waiting for approval</span><b>${drafts.length}</b></a>
        <div class="stat"><span class="muted small">Week ${week || '–'}: lessons with work sent</span><b class="num">${sent} / ${wl.length}</b><div class="bar"><span style="width:${pct(sent, wl.length)}%"></span></div></div>
      </div>
      ${week ? `<section class="panel"><h2>Week ${week}, lesson by lesson</h2><div class="scroll-x"><table class="data">
        <thead><tr><th>Day</th><th>Lesson</th><th>Memory quiz</th><th>Work</th><th>Mark</th></tr></thead><tbody>
        ${wl.map((l) => { const p = progressFor(l.id); return `<tr><td class="num">${fmtDay(l.lesson_date, { weekday: 'short', day: 'numeric' })}</td>
          <td><span class="subj ${l.subject}">${SUBJECTS[l.subject]}</span><br><a href="#lesson-${esc(l.id)}">${esc(l.title)}</a></td>
          <td class="num">${p.best ? `${p.best.score}/${p.best.max}` : '<span class="muted">–</span>'}</td>
          <td>${p.sent ? `<span class="pill sent">Sent</span>${p.subs[0].minutes_taken != null ? `<br><span class="small muted">${p.subs[0].minutes_taken} min</span>` : ''}` : (l.lesson_date < t ? '<span class="pill alert">Not sent</span>' : '<span class="pill todo">Not yet</span>')}</td>
          <td class="num">${p.marked ? `${p.marked.mark}/${p.marked.mark_max}` : p.sent ? '<a href="#marking">Mark</a>' : '<span class="muted">–</span>'}</td></tr>`; }).join('')}
        </tbody></table></div></section>` : '<section class="panel"><p class="muted">No published lessons yet.</p></section>'}
      <section class="panel"><h2>Weekly summaries</h2>
        ${reports.length ? reports.map((r) => `<details ${r === reports[0] ? 'open' : ''}><summary><b>Week ${r.week}</b> <span class="muted small">${fmtWhen(r.created_at)}</span></summary><div class="lesson" style="margin-top:10px">${r.body_html}</div></details>`).join('') : '<p class="muted">After each weekend run, a short summary of Hadi\'s week appears here: what he did, his marks, and what next week focuses on.</p>'}
      </section>`);
  }

  // ---------- admin: marking ----------
  async function markingView(filter) {
    filter = filter || 'todo';
    const list = data.subs.filter((s) => (filter === 'todo' ? s.mark == null : s.mark != null));
    shell('marking', `
      <div class="page-head"><span class="eyebrow">Admin</span><h1>Marking</h1>
      <p class="muted">Claude marks written work at the weekend run. You can also mark anything here yourself, using the answer sheet.</p></div>
      <div class="row"><button class="btn ${filter === 'todo' ? 'primary' : ''}" data-filter="todo">To mark (${data.subs.filter((s) => s.mark == null).length})</button>
        <button class="btn ${filter === 'done' ? 'primary' : ''}" data-filter="done">Marked (${data.subs.filter((s) => s.mark != null).length})</button></div>
      ${list.length ? list.map((s) => { const l = data.lessonById[s.lesson_id] || { title: s.lesson_id, subject: 'english' }; return `
        <section class="panel" id="sub-${s.id}">
          <div><span class="subj ${l.subject}">${SUBJECTS[l.subject] || ''}</span><h2><a href="#lesson-${esc(s.lesson_id)}">${esc(l.title)}</a></h2></div>
          ${subView(s, { markForm: `
            <details data-sheet="${esc(s.lesson_id)}"><summary>Show the answer sheet</summary><div class="lesson answers" style="margin-top:10px"><p class="muted">Loading…</p></div></details>
            <form class="row" data-mark="${s.id}" style="align-items:flex-end">
              <label class="field" for="m-${s.id}">Mark<input type="number" id="m-${s.id}" min="0" value="${s.mark ?? ''}" required></label>
              <label class="field" for="mm-${s.id}">Out of<input type="number" id="mm-${s.id}" min="1" value="${s.mark_max ?? ''}" required></label>
              <label class="field" for="fb-${s.id}" style="flex:1;min-width:220px">Feedback for Hadi<input type="text" id="fb-${s.id}" value="${esc(s.feedback || '')}" placeholder="What went well, and one thing to fix"></label>
              <button class="btn primary" type="submit">Save mark</button>
            </form>` })}
        </section>`; }).join('') : `<section class="panel"><p class="muted">${filter === 'todo' ? 'Nothing waiting. When Hadi sends work, it appears here.' : 'Nothing marked yet.'}</p></section>`}`);
    app.querySelectorAll('[data-filter]').forEach((b) => { b.onclick = () => markingView(b.dataset.filter); });
    app.querySelectorAll('details[data-sheet]').forEach((d) => {
      d.addEventListener('toggle', async () => { if (d.open && !d.dataset.loaded) { d.dataset.loaded = 1; d.querySelector('.lesson').innerHTML = (await api.answerSheet(d.dataset.sheet)) || 'No answer sheet.'; } });
    });
    app.querySelectorAll('form[data-mark]').forEach((f) => {
      f.onsubmit = async (e) => {
        e.preventDefault();
        const id = Number(f.dataset.mark);
        const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Saving…';
        try {
          await api.markSubmission(id, { mark: Number(f.querySelector(`#m-${id}`).value), mark_max: Number(f.querySelector(`#mm-${id}`).value), feedback: f.querySelector(`#fb-${id}`).value.trim() || null });
          await load(); markingView(filter);
        } catch (x) { btn.disabled = false; btn.textContent = 'Save mark'; alertIn(f, x.message); }
      };
    });
    hydrateThumbs();
  }
  function alertIn(el, text) { const d = document.createElement('div'); d.className = 'msg err'; d.textContent = text; el.after(d); }

  // ---------- admin: topics ----------
  async function topicsView() {
    const topics = await api.topics();
    shell('topics', `<div class="page-head"><span class="eyebrow">Admin</span><h1>Weak topics</h1>
      <p class="muted">Changes save straight away. Hadi sees the status but can't edit it. Claude updates these at the weekend run from his marks.</p></div>
      <div id="topic-msg"></div>${topicsHtml(topics, true)}`);
    const saved = (ok, text) => { document.getElementById('topic-msg').innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${esc(text)}</div>`; };
    app.querySelectorAll('[data-topic]').forEach((s) => { s.onchange = () => api.updateTopic(Number(s.dataset.topic), { status: s.value, last_tested: todayIso() }).then(() => saved(true, 'Saved.'), (x) => saved(false, x.message)); });
    app.querySelectorAll('[data-evidence]').forEach((i) => { i.onchange = () => api.updateTopic(Number(i.dataset.evidence), { evidence: i.value }).then(() => saved(true, 'Saved.'), (x) => saved(false, x.message)); });
  }

  // ---------- router ----------
  async function render() {
    try {
      if (!user) user = await api.session();
      if (!user) { signInView(); return; }
      await load();
      const route = location.hash.replace(/^#/, '');
      if (route.startsWith('lesson-')) return lessonView(route.slice(7));
      if (user.role === 'admin') {
        if (route === 'marking') return markingView();
        if (route === 'lessons') return weekListView('lessons', true);
        if (route === 'topics') return topicsView();
        return overviewView();
      }
      if (route === 'week') return weekListView('week', false);
      if (route === 'progress') return progressView();
      return todayView();
    } catch (x) {
      app.innerHTML = `<main><div class="narrow"><section class="panel"><h1>Something went wrong</h1><p>${esc(x.message)}</p><p class="muted">Check your internet connection, then reload the page.</p><button class="btn" onclick="location.reload()">Reload</button></section></div></main>`;
    }
  }
  window.addEventListener('hashchange', render);
  render();
})();
