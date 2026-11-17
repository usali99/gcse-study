/* GCSE Study, version 2: landing page, invite-only sign-up, four roles, course plans. */
(function () {
  'use strict';
  const C = window.CATALOGUE;
  const cfg = window.APP_CONFIG || {};
  const app = document.getElementById('app');
  const ROLE = { school_admin: 'School', teacher: 'Teacher', parent: 'Parent', student: 'Student' };

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const fmt = (iso, o) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', o || { day: 'numeric', month: 'long', year: 'numeric' });
  const weeksUntil = (iso) => Math.max(0, Math.ceil((new Date(iso + 'T12:00:00') - new Date()) / (7 * 864e5)));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  const newCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(8)); return [...r].map((x) => a[x % a.length]).join(''); };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } },
  };
  const initials = (n) => (n || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();

  // ---------- data: Supabase ----------
  function supabaseApi() {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    const all = async (t, q) => must(await (q ? q(sb.from(t).select('*')) : sb.from(t).select('*')));
    return {
      demo: false,
      async me() {
        const { data } = await sb.auth.getSession();
        if (!data.session) return null;
        const p = must(await sb.from('people').select('*').eq('id', data.session.user.id).maybeSingle());
        return p ? { ...p, email: data.session.user.email } : { id: data.session.user.id, full_name: data.session.user.email, role: null, email: data.session.user.email };
      },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(/Invalid login/.test(error.message) ? 'That email and password do not match.' : /confirm/i.test(error.message) ? 'Please confirm your email first: check your inbox for the link.' : error.message);
      },
      async signUp({ email, password, full_name, invite_code, school_name }) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { v2: true, full_name, invite_code, school_name }, emailRedirectTo: location.href.split('#')[0] } });
        if (error) throw new Error(/Database error|invite/i.test(error.message) ? 'That invite code is not valid or has already been used.' : error.message);
        return { needsConfirm: !data.session };
      },
      async signOut() { await sb.auth.signOut(); },
      async load() {
        const [people, schools, members, classes, classStudents, guardianships, courses, invites] = await Promise.all([
          all('people'), all('schools'), all('school_members'), all('classes'), all('class_students'), all('guardianships'),
          all('courses', (q) => q.order('exam_date')), all('invites', (q) => q.order('created_at', { ascending: false })),
        ]);
        return { people, schools, members, classes, classStudents, guardianships, courses, invites };
      },
      async addCourse(c) { must(await sb.from('courses').insert(c)); },
      async deleteCourse(id) { must(await sb.from('courses').delete().eq('id', id)); },
      async addInvite(i) { must(await sb.from('invites').insert(i)); },
      async deleteInvite(code) { must(await sb.from('invites').delete().eq('code', code)); },
      async addClass(c) { must(await sb.from('classes').insert(c)); },
    };
  }

  // ---------- data: preview (example accounts, saved in this browser only) ----------
  function demoApi() {
    const KEY = 'gcse-v2-demo';
    const seed = () => {
      const P = (id, full_name, role, extra) => ({ id, full_name, role, is_platform_admin: false, email: id + '@example.com', ...extra });
      const school = { id: 'sch1', name: 'Oakfield Academy (example)' };
      const plan = (code, tier, start, exam, hours) => { const s = C.SPECS.find((x) => x.code === code); return C.buildPlan({ start, exam, topics: C.topicsFor(s, tier), hoursPerWeek: hours }); };
      const course = (id, student_id, code, tier, exam, hours) => { const s = C.SPECS.find((x) => x.code === code); return { id, student_id, board: s.board, qualification: s.qual, subject: s.subject, code, tier: tier || '', exam_date: exam, start_date: '2026-11-18', hours_per_week: hours, plan: plan(code, tier, '2026-11-18', exam, hours), created_at: '2026-11-17T20:00:00Z' }; };
      return {
        people: [P('usman', 'Usman', 'parent', { is_platform_admin: true }), P('hadi', 'Hadi', 'student'), P('head', 'Mrs Okafor', 'school_admin'),
          P('teacher', 'Mr Patel', 'teacher'), P('amira', 'Amira Khan', 'student'), P('leo', 'Leo Brown', 'student'), P('sam', 'Sam Taylor', 'student')],
        schools: [school],
        members: [{ school_id: 'sch1', person_id: 'head', role: 'admin' }, { school_id: 'sch1', person_id: 'teacher', role: 'teacher' }],
        classes: [{ id: 'cls1', school_id: 'sch1', teacher_id: 'teacher', name: '10X Maths' }],
        classStudents: [{ class_id: 'cls1', student_id: 'amira' }, { class_id: 'cls1', student_id: 'leo' }],
        guardianships: [{ parent_id: 'usman', student_id: 'hadi' }],
        courses: [course('c1', 'hadi', '1MA1', 'Foundation', '2028-05-15', 1), course('c2', 'hadi', '1EN2', '', '2028-05-15', 3),
          course('c3', 'hadi', '1PH0', 'Foundation', '2028-05-15', 1), course('c4', 'hadi', '1CH0', 'Foundation', '2028-05-15', 1),
          course('c5', 'amira', '8300', 'Higher', '2027-05-15', 2), course('c6', 'leo', '8300', 'Foundation', '2027-05-15', 2), course('c7', 'sam', '8463', 'Higher', '2028-05-15', 2)],
        invites: [{ code: 'TRYPARENT', role: 'parent', note: 'Example code', max_uses: 50, uses: 0, created_by: 'usman', expires_at: '2027-12-31T00:00:00Z', created_at: '2026-11-17T20:00:00Z' },
          { code: 'TRYSCHOOL', role: 'school_admin', note: 'Example code', max_uses: 50, uses: 0, created_by: 'usman', expires_at: '2027-12-31T00:00:00Z', created_at: '2026-11-17T20:00:00Z' }],
      };
    };
    let S = store.get(KEY) || seed();
    const save = () => store.set(KEY, S);
    let meId = store.get(KEY + '-me');
    const me = () => S.people.find((p) => p.id === meId) || null;
    const schoolsOf = (sid) => S.classStudents.filter((x) => x.student_id === sid).map((x) => (S.classes.find((c) => c.id === x.class_id) || {}).school_id).filter(Boolean);
    const canManage = (sid) => { const m = me(); if (!m) return false; return m.id === sid || m.is_platform_admin
      || S.guardianships.some((g) => g.parent_id === m.id && g.student_id === sid)
      || S.classStudents.some((x) => x.student_id === sid && (S.classes.find((c) => c.id === x.class_id) || {}).teacher_id === m.id)
      || S.members.some((x) => x.person_id === m.id && x.role === 'admin' && schoolsOf(sid).includes(x.school_id)); };
    const canSee = (pid) => { const m = me(); return pid === m.id || canManage(pid)
      || S.members.some((a) => a.person_id === m.id && S.members.some((b) => b.school_id === a.school_id && b.person_id === pid))
      || S.guardianships.some((g) => g.student_id === m.id && g.parent_id === pid)
      || S.classStudents.some((x) => x.student_id === m.id && (S.classes.find((c) => c.id === x.class_id) || {}).teacher_id === pid); };
    return {
      demo: true,
      reset() { S = seed(); save(); },
      accounts: () => S.people.filter((p) => ['usman', 'hadi', 'head', 'teacher', 'sam'].includes(p.id)),
      async me() { return me(); },
      async signIn(id) { meId = id; store.set(KEY + '-me', id); },
      async signUp({ email, full_name, invite_code, school_name }) {
        const inv = S.invites.find((i) => i.code === String(invite_code || '').trim().toUpperCase());
        if (!inv || inv.uses >= inv.max_uses) throw new Error('That invite code is not valid or has already been used.');
        inv.uses++;
        const id = uid();
        S.people.push({ id, full_name, role: inv.role, is_platform_admin: false, email });
        if (inv.role === 'school_admin') { const sid = uid(); S.schools.push({ id: sid, name: school_name || 'My school' }); S.members.push({ school_id: sid, person_id: id, role: 'admin' }); }
        if (inv.role === 'teacher' && inv.school_id) S.members.push({ school_id: inv.school_id, person_id: id, role: 'teacher' });
        if (inv.role === 'student' && inv.parent_id) S.guardianships.push({ parent_id: inv.parent_id, student_id: id });
        if (inv.role === 'student' && inv.class_id) S.classStudents.push({ class_id: inv.class_id, student_id: id });
        save(); meId = id; store.set(KEY + '-me', id);
        return { needsConfirm: false };
      },
      async signOut() { meId = null; store.del(KEY + '-me'); },
      async load() {
        const m = me();
        const myClasses = S.classes.filter((c) => c.teacher_id === m.id || m.is_platform_admin || S.members.some((x) => x.person_id === m.id && x.role === 'admin' && x.school_id === c.school_id) || S.classStudents.some((x) => x.class_id === c.id && x.student_id === m.id));
        return {
          people: S.people.filter((p) => canSee(p.id)),
          schools: S.schools.filter((s) => m.is_platform_admin || S.members.some((x) => x.person_id === m.id && x.school_id === s.id) || schoolsOf(m.id).includes(s.id)),
          members: S.members.filter((x) => m.is_platform_admin || S.members.some((y) => y.person_id === m.id && y.school_id === x.school_id)),
          classes: myClasses,
          classStudents: S.classStudents.filter((x) => x.student_id === m.id || myClasses.some((c) => c.id === x.class_id && c.teacher_id !== undefined && (c.teacher_id === m.id || m.is_platform_admin || S.members.some((y) => y.person_id === m.id && y.role === 'admin' && y.school_id === c.school_id)))),
          guardianships: S.guardianships.filter((g) => g.parent_id === m.id || g.student_id === m.id || m.is_platform_admin),
          courses: S.courses.filter((c) => canManage(c.student_id)).sort((a, b) => a.exam_date.localeCompare(b.exam_date)),
          invites: S.invites.filter((i) => i.created_by === m.id || m.is_platform_admin),
        };
      },
      async addCourse(c) { if (!canManage(c.student_id)) throw new Error('You can only plan courses for your own students.'); S.courses.push({ ...c, id: uid(), created_at: new Date().toISOString() }); save(); },
      async deleteCourse(id) { S.courses = S.courses.filter((c) => c.id !== id); save(); },
      async addInvite(i) { S.invites.unshift({ ...i, uses: 0, created_by: meId, created_at: new Date().toISOString() }); save(); },
      async deleteInvite(code) { S.invites = S.invites.filter((i) => i.code !== code); save(); },
      async addClass(c) { S.classes.push({ ...c, id: uid() }); save(); },
    };
  }

  const api = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && !/[?&]preview/.test(location.search) ? supabaseApi() : demoApi();
  let me = null; let D = null;

  // Derived lookups over the loaded data.
  const person = (id) => D.people.find((p) => p.id === id) || { id, full_name: 'Someone', role: 'student' };
  const coursesOf = (sid) => D.courses.filter((c) => c.student_id === sid);
  const childrenOf = (pid) => D.guardianships.filter((g) => g.parent_id === pid).map((g) => person(g.student_id));
  const classStudents = (cid) => D.classStudents.filter((x) => x.class_id === cid).map((x) => person(x.student_id));
  const mySchool = () => { const m = D.members.find((x) => x.person_id === me.id); return m ? { ...D.schools.find((s) => s.id === m.school_id), myRole: m.role } : null; };
  const thisWeek = (c) => { const t = today(); const p = c.plan || []; return p.filter((w) => w.start <= t).pop() || p[0]; };

  // ---------- shell ----------
  function navFor() {
    if (!me || !me.role) return [];
    const n = [['home', 'Dashboard']];
    if (me.is_platform_admin || ['school_admin', 'teacher', 'parent'].includes(me.role)) n.push(['invites', 'Invite codes']);
    if (me.is_platform_admin) n.push(['everyone', 'Everyone']);
    return n;
  }
  function shell(route, inner, opts = {}) {
    const nav = navFor();
    app.innerHTML = `
      <header class="bar ${opts.dark ? 'bar-dark' : ''}"><div class="bar-in">
        <a class="logo" href="#${me ? 'home' : ''}"><span class="logo-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 18V7l8-4 8 4v11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 21v-6h6v6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg></span>GCSE Study</a>
        ${nav.length ? `<nav class="nav" aria-label="Main">${nav.map(([r, t]) => `<a href="#${r}" ${route === r ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>` : '<span class="grow"></span>'}
        ${me ? `<div class="me"><span class="avatar" aria-hidden="true">${esc(initials(me.full_name))}</span><span class="me-name">${esc(me.full_name)}<small>${me.role ? ROLE[me.role] : ''}${me.is_platform_admin ? ' · owner' : ''}${api.demo ? ' · preview' : ''}</small></span><button class="btn ghost sm" id="signout">Sign out</button></div>`
          : `<div class="me"><a class="btn ghost sm" href="#signin">Sign in</a><a class="btn accent sm" href="#signup">Get started</a></div>`}
      </div></header>
      ${inner}
      <footer class="foot"><div class="foot-in"><span>GCSE Study · invite-only beta</span><span>Plans follow the exam boards' published specifications. Always check dates with your exam centre.</span></div></footer>`;
    const so = document.getElementById('signout');
    if (so) so.onclick = async () => { await api.signOut(); me = null; location.hash = ''; render(); };
    window.scrollTo(0, 0);
  }
  const page = (inner, cls = '') => `<main class="page ${cls}">${inner}</main>`;

  // ---------- landing ----------
  function landing() {
    const sample = C.buildPlan({ start: today(), exam: C.examSeries(today())[2].date, topics: C.topicsFor(C.SPECS[0], 'Foundation'), hoursPerWeek: 2 }).filter((w) => w.kind !== 'break').slice(0, 5);
    shell('', `
      <section class="hero"><div class="hero-in">
        <div class="hero-copy">
          <p class="kicker">GCSE and IGCSE study, planned week by week</p>
          <h1>A clear plan from today to the exam hall.</h1>
          <p class="lede">Pick the exam board, subject and specification code. GCSE Study builds a week-by-week plan to the exam, then turns each week into short lessons, self-marking quizzes and marked practice.</p>
          <div class="cta"><a class="btn accent lg" href="#signup">Get started</a><a class="btn outline-light lg" href="#signin">Sign in</a></div>
          <p class="fine">Invite-only beta. You need an invite code to create an account.</p>
        </div>
        <div class="hero-card" aria-label="Example plan">
          <div class="hc-head"><span class="chip">Pearson Edexcel · 1MA1 Foundation</span><span class="countdown"><b>${weeksUntil(C.examSeries(today())[2].date)}</b> weeks to go</span></div>
          <ol class="hc-weeks">${sample.map((w, i) => `<li class="${i === 0 ? 'now' : ''}"><span class="wk">Wk ${w.n}</span><span class="wt">${esc(w.title)}</span>${i === 0 ? '<span class="tag">This week</span>' : ''}</li>`).join('')}</ol>
          <div class="hc-foot"><span>Memory quiz</span><span class="score">4 / 5</span></div>
        </div>
      </div></section>
      ${page(`
      <section class="band">
        <h2 class="section-title">Everything a GCSE year needs, in one place</h2>
        <div class="features">
          ${[['plan', 'Course plans in minutes', 'Exam board, subject, code and exam date in. A week-by-week plan to the exam out, with review weeks and revision built in.'],
            ['quiz', 'Quizzes that mark themselves', 'Every lesson opens with a quick memory quiz. Answers are checked instantly, so gaps show up the same day.'],
            ['mark', 'Written work, properly marked', 'Students type answers or upload a photo of their page. Work is marked to the board\'s mark scheme style, with feedback.'],
            ['track', 'Progress everyone can see', 'Weak topics, scores and time taken, by subject. Parents and teachers see the same picture as the student.']]
            .map(([i, t, d]) => `<article class="feature"><span class="ficon ficon-${i}" aria-hidden="true"></span><h3>${t}</h3><p>${d}</p></article>`).join('')}
        </div>
      </section>
      <section class="band">
        <h2 class="section-title">Made for four kinds of account</h2>
        <div class="roles">
          ${[['school_admin', 'Schools', 'Add teachers, see every class and student, and keep plans consistent across a year group.'],
            ['teacher', 'Teachers', 'Create classes, invite students with one code, and plan courses for each student.'],
            ['parent', 'Parents', 'Manage your child\'s courses, approve each week\'s lessons, and see marks and weak topics.'],
            ['student', 'Students', 'See this week\'s focus for every subject, do the lessons, and track your own progress.']]
            .map(([r, t, d]) => `<article class="role role-${r}"><h3>${t}</h3><p>${d}</p></article>`).join('')}
        </div>
      </section>
      <section class="band how">
        <h2 class="section-title">How it works</h2>
        <ol class="steps">
          <li><b>Join with an invite code</b><span>Choose School, Teacher, Parent or Student.</span></li>
          <li><b>Create a course plan</b><span>Answer five questions: board, qualification, subject, code and exam date.</span></li>
          <li><b>Work through it weekly</b><span>Short lessons, quizzes and marked practice, adjusted to what was hard last week.</span></li>
        </ol>
        <div class="cta center"><a class="btn primary lg" href="#signup">Create an account</a></div>
      </section>`)}`, { dark: true });
  }

  // ---------- sign in ----------
  function signInView(err) {
    shell('signin', page(`<div class="auth">
      <div class="auth-card">
        <p class="kicker dark">Welcome back</p><h1>Sign in</h1>
        ${api.demo ? `<p class="note">This is a preview with example accounts. Pick one to look around. Nothing is saved online.</p>
          <div class="acct-list">${api.accounts().map((p) => `<button class="acct" data-acct="${p.id}"><span class="avatar">${esc(initials(p.full_name))}</span><span><b>${esc(p.full_name)}</b><small>${ROLE[p.role]}${p.is_platform_admin ? ' and owner' : ''}${p.id === 'hadi' ? ', managed by a parent' : p.id === 'sam' ? ', studying on their own' : ''}</small></span></button>`).join('')}</div>
          <button class="btn ghost sm" id="reset">Reset the preview</button>` : `
          <form id="f" class="form">
            <label for="email">Email<input id="email" type="email" autocomplete="username" required></label>
            <label for="pw">Password<input id="pw" type="password" autocomplete="current-password" required></label>
            ${err ? `<p class="msg err">${esc(err)}</p>` : ''}
            <button class="btn primary lg" id="go">Sign in</button>
          </form>`}
        <p class="small muted">New here? <a href="#signup">Create an account with an invite code</a></p>
      </div></div>`));
    if (api.demo) {
      app.querySelectorAll('[data-acct]').forEach((b) => { b.onclick = async () => { await api.signIn(b.dataset.acct); location.hash = '#home'; render(); }; });
      document.getElementById('reset').onclick = (e) => { api.reset(); e.target.textContent = 'Preview reset'; };
    } else {
      document.getElementById('f').onsubmit = async (e) => {
        e.preventDefault(); const b = document.getElementById('go'); b.disabled = true; b.textContent = 'Signing in…';
        try { await api.signIn(document.getElementById('email').value.trim(), document.getElementById('pw').value); me = null; location.hash = '#home'; render(); }
        catch (x) { signInView(x.message); }
      };
    }
  }

  // ---------- sign up ----------
  function signUpView(state = {}) {
    const role = state.role;
    const roleCards = [['school_admin', 'School', 'Set up your school, then invite teachers.'], ['teacher', 'Teacher', 'Run classes and plan courses for students.'],
      ['parent', 'Parent', 'Manage your child\'s studies, like a home-educating family.'], ['student', 'Student', 'Study on your own, or join a class or a parent.']];
    shell('signup', page(`<div class="auth wide">
      <div class="auth-card">
        <ol class="progress" aria-label="Steps"><li class="${role ? 'done' : 'on'}">Who are you?</li><li class="${role ? 'on' : ''}">Your details</li></ol>
        ${!role ? `<h1>Create your account</h1><p class="muted">Choose the account that fits you. Your invite code must match this choice.</p>
          <div class="role-pick">${roleCards.map(([r, t, d]) => `<button class="pick role-${r}" data-role="${r}"><b>${t}</b><span>${d}</span></button>`).join('')}</div>`
        : `<h1>${ROLE[role]} account</h1><p class="muted"><a href="#signup" id="back">Change account type</a></p>
          <form id="f" class="form">
            <label for="code">Invite code<input id="code" required autocomplete="off" placeholder="e.g. 7KQ2MXRP" value="${esc(state.code || '')}" style="text-transform:uppercase"></label>
            ${role === 'school_admin' ? '<label for="school">School name<input id="school" required maxlength="120"></label>' : ''}
            <label for="name">${role === 'school_admin' ? 'Your name' : 'Full name'}<input id="name" required maxlength="80" autocomplete="name"></label>
            <label for="email">Email<input id="email" type="email" required autocomplete="email"></label>
            <label for="pw">Password <small>at least 8 characters</small><input id="pw" type="password" minlength="8" required autocomplete="new-password"></label>
            ${state.err ? `<p class="msg err">${esc(state.err)}</p>` : ''}
            <button class="btn primary lg" id="go">Create account</button>
            <p class="small muted">${role === 'student' ? 'Joining a class or a parent? Use the code they gave you.' : 'Don\'t have a code? This beta is invite only.'}</p>
          </form>`}
      </div></div>`));
    app.querySelectorAll('[data-role]').forEach((b) => { b.onclick = () => signUpView({ role: b.dataset.role }); });
    const back = document.getElementById('back'); if (back) back.onclick = (e) => { e.preventDefault(); signUpView(); };
    const f = document.getElementById('f');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault(); const b = document.getElementById('go'); b.disabled = true; b.textContent = 'Creating…';
      const v = (id) => (document.getElementById(id) || {}).value || '';
      try {
        const r = await api.signUp({ email: v('email').trim(), password: v('pw'), full_name: v('name').trim(), invite_code: v('code').trim().toUpperCase(), school_name: v('school').trim(), role });
        if (r.needsConfirm) {
          shell('signup', page(`<div class="auth"><div class="auth-card"><h1>Check your email</h1><p>We've sent a link to <b>${esc(v('email'))}</b>. Open it to finish creating your account, then sign in.</p><a class="btn primary" href="#signin">Go to sign in</a></div></div>`));
        } else { me = null; location.hash = '#home'; render(); }
      } catch (x) { signUpView({ role, code: v('code'), err: x.message }); }
    };
  }

  // ---------- course cards and plan ----------
  function courseCard(c, showStudent) {
    const w = thisWeek(c); const total = (c.plan || []).filter((x) => x.kind !== 'break').length;
    const done = (c.plan || []).filter((x) => x.kind !== 'break' && x.start <= today()).length;
    return `<a class="course" href="#course-${esc(c.id)}">
      <div class="course-top"><span class="subject">${esc(c.subject)}</span><span class="wk-left"><b>${weeksUntil(c.exam_date)}</b> wks</span></div>
      <div class="course-meta">${esc(c.board)} · ${esc(c.qualification)}${c.code ? ' · ' + esc(c.code) : ''}${c.tier ? ' · ' + esc(c.tier) : ''}${showStudent ? ` · <b>${esc(person(c.student_id).full_name)}</b>` : ''}</div>
      ${w ? `<div class="course-now"><span class="kind kind-${w.kind}">${w.kind === 'teach' ? 'This week' : w.kind === 'review' ? 'Review week' : w.kind === 'revision' ? 'Revision' : 'Break'}</span>${esc(w.title)}</div>` : ''}
      <div class="meter" role="img" aria-label="${done} of ${total} weeks done"><span style="width:${total ? Math.round(done / total * 100) : 0}%"></span></div>
    </a>`;
  }
  function coursesBlock(sid, title, canAdd) {
    const cs = coursesOf(sid);
    return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${canAdd ? `<a class="btn primary sm" href="#plan-for-${esc(sid)}">Add a course</a>` : ''}</div>
      ${cs.length ? `<div class="course-grid">${cs.map((c) => courseCard(c)).join('')}</div>` : `<div class="empty"><b>No courses yet.</b><span>A course plan takes about a minute: board, subject, code and exam date.</span>${canAdd ? `<a class="btn primary sm" href="#plan-for-${esc(sid)}">Create the first plan</a>` : ''}</div>`}
    </section>`;
  }
  function thisWeekBlock(sid) {
    const cs = coursesOf(sid).map((c) => ({ c, w: thisWeek(c) })).filter((x) => x.w);
    if (!cs.length) return '';
    return `<section class="panel"><div class="panel-head"><h2>This week</h2><span class="muted small">Week of ${fmt(cs[0].w.start, { day: 'numeric', month: 'long' })}</span></div>
      <ul class="week-list">${cs.map(({ c, w }) => `<li><span class="dot kind-${w.kind}"></span><span><b>${esc(c.subject)}</b> ${esc(w.title)}</span><span class="muted small">${w.hours ? `${w.hours} h` : ''}</span></li>`).join('')}</ul></section>`;
  }

  function coursePage(id) {
    const c = D.courses.find((x) => x.id === id);
    if (!c) return shell('home', page('<section class="panel"><h1>Course not found</h1><p><a href="#home">Back to your dashboard</a></p></section>'));
    const st = person(c.student_id); const t = today();
    const plan = c.plan || [];
    const byMonth = plan.reduce((m, w) => { const k = w.start.slice(0, 7); (m[k] = m[k] || []).push(w); return m; }, {});
    shell('home', page(`
      <div class="page-head"><a class="small" href="#home">← Dashboard</a>
        <p class="kicker dark">${esc(c.board)} · ${esc(c.qualification)}${c.code ? ' · ' + esc(c.code) : ''}${c.tier ? ' · ' + esc(c.tier) : ''}</p>
        <h1>${esc(c.subject)}${st.id !== me.id ? ` <span class="for">for ${esc(st.full_name)}</span>` : ''}</h1></div>
      <div class="stats">
        <div class="stat"><span>Exam</span><b>${fmt(c.exam_date, { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>
        <div class="stat"><span>Weeks to go</span><b>${weeksUntil(c.exam_date)}</b></div>
        <div class="stat"><span>Study time</span><b>${c.hours_per_week} h/week</b></div>
        <div class="stat"><span>Plan</span><b>${plan.filter((w) => w.kind === 'teach').length} teaching · ${plan.filter((w) => w.kind === 'review').length} review · ${plan.filter((w) => w.kind === 'revision').length} revision</b></div>
      </div>
      <section class="panel"><div class="panel-head"><h2>Week-by-week plan</h2><div class="legend"><span><i class="dot kind-teach"></i>Teaching</span><span><i class="dot kind-review"></i>Review</span><span><i class="dot kind-revision"></i>Revision</span><span><i class="dot kind-break"></i>Break</span></div></div>
        <div class="timeline">${Object.keys(byMonth).map((k) => `<div class="month"><h3>${fmt(k + '-15', { month: 'long', year: 'numeric' })}</h3>
          <ol>${byMonth[k].map((w) => { const now = w.start <= t && t < new Date(new Date(w.start + 'T12:00:00').getTime() + 7 * 864e5).toISOString().slice(0, 10); return `<li class="wk-row kind-${w.kind} ${now ? 'now' : ''}"><span class="wk-n">Wk ${w.n}</span><span class="wk-d">${fmt(w.start, { day: 'numeric', month: 'short' })}</span><span class="wk-t">${esc(w.title)}${now ? ' <span class="tag">This week</span>' : ''}</span></li>`; }).join('')}</ol></div>`).join('')}</div>
      </section>
      <section class="panel danger-zone"><div class="panel-head"><div><h2>Remove this course</h2><p class="muted small">This deletes the plan. It can't be undone.</p></div><button class="btn danger sm" id="del">Remove course</button></div><div id="confirm"></div></section>`));
    document.getElementById('del').onclick = () => {
      document.getElementById('confirm').innerHTML = '<div class="row"><span>Remove this course for good?</span><button class="btn danger sm" id="yes">Yes, remove it</button><button class="btn ghost sm" id="no">Keep it</button></div>';
      document.getElementById('no').onclick = () => { document.getElementById('confirm').innerHTML = ''; };
      document.getElementById('yes').onclick = async () => { await api.deleteCourse(c.id); location.hash = '#home'; };
    };
  }

  // ---------- course plan wizard ----------
  function wizard(studentId, st) {
    st = st || { step: 1 };
    const student = person(studentId);
    const specs = C.SPECS.filter((s) => (!st.board || s.board === st.board) && (!st.qual || s.qual === st.qual));
    const spec = C.SPECS.find((s) => s.code === st.code && s.board === st.board);
    const series = C.examSeries(today());
    const steps = ['Exam board', 'Qualification', 'Subject and code', 'Exam date', 'Check and create'];
    const quals = [...new Set(C.SPECS.filter((s) => s.board === st.board).map((s) => s.qual))];
    let body = '';
    if (st.step === 1) body = `<h2>Which exam board?</h2><div class="opt-grid">${C.BOARDS.map((b) => `<button class="opt" data-k="board" data-v="${esc(b)}">${esc(b)}</button>`).join('')}</div>`;
    if (st.step === 2) body = `<h2>Which qualification?</h2><div class="opt-grid">${(quals.length ? quals : C.QUALS).map((q) => `<button class="opt" data-k="qual" data-v="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
    if (st.step === 3) body = `<h2>Which subject?</h2>
      <div class="opt-grid">${specs.map((s) => `<button class="opt" data-k="code" data-v="${esc(s.code)}"><b>${esc(s.subject)}</b><small>${esc(s.code)}</small></button>`).join('')}</div>
      <details class="other"><summary>My subject isn't listed</summary><form id="other" class="form">
        <label for="osub">Subject name<input id="osub" required maxlength="60"></label>
        <label for="ocode">Exam code (from the board's website)<input id="ocode" maxlength="12"></label>
        <label for="otopics">Topics, one per line (optional, you can add them later)<textarea id="otopics" rows="5"></textarea></label>
        <button class="btn primary">Continue</button></form></details>`;
    if (st.step === 4) body = `<h2>When is the exam?</h2>
      ${spec && spec.tiers ? `<fieldset class="tiers"><legend>Tier</legend>${spec.tiers.map((t) => `<label class="radio"><input type="radio" name="tier" value="${esc(t)}" ${st.tier === t ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</fieldset>` : ''}
      <form id="when" class="form">
        <label for="series">Exam series<select id="series">${series.map((s) => `<option value="${s.date}" ${st.exam === s.date ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}<option value="custom" ${st.exam && !series.some((s) => s.date === st.exam) ? 'selected' : ''}>Another date</option></select></label>
        <label for="exam">First exam date <small>use the board's timetable when it's published</small><input id="exam" type="date" value="${st.exam || series[2].date}" required></label>
        <label for="start">Start studying on<input id="start" type="date" value="${st.start || today()}" required></label>
        <label for="hours">Study time per week (hours)<input id="hours" type="number" min="0.5" max="20" step="0.5" value="${st.hours || 2}" required></label>
        <button class="btn primary">Continue</button></form>`;
    if (st.step === 5) {
      const topics = spec ? C.topicsFor(spec, st.tier) : (st.topics || []);
      const plan = C.buildPlan({ start: st.start, exam: st.exam, topics, hoursPerWeek: Number(st.hours) });
      st.plan = plan;
      body = `<h2>Check and create</h2>
        <dl class="summary"><dt>Student</dt><dd>${esc(student.full_name)}</dd><dt>Course</dt><dd>${esc(st.board)} ${esc(st.qual)} ${esc(spec ? spec.subject : st.subject)}${st.code ? ` (${esc(st.code)})` : ''}${st.tier ? `, ${esc(st.tier)}` : ''}</dd>
          <dt>Dates</dt><dd>${fmt(st.start)} to ${fmt(st.exam)} · ${st.hours} h a week</dd>
          <dt>Plan</dt><dd>${plan.filter((w) => w.kind === 'teach').length} teaching weeks covering ${topics.length || 'your'} topics, ${plan.filter((w) => w.kind === 'review').length} review weeks, ${plan.filter((w) => w.kind === 'revision').length} weeks of revision and past papers</dd></dl>
        <div class="preview-weeks">${plan.filter((w) => w.kind !== 'break').slice(0, 6).map((w) => `<div class="wk-row kind-${w.kind}"><span class="wk-n">Wk ${w.n}</span><span class="wk-t">${esc(w.title)}</span></div>`).join('')}<p class="muted small">…and ${Math.max(0, plan.length - 6)} more weeks.</p></div>
        <div id="err"></div><button class="btn accent lg" id="create">Create course plan</button>`;
    }
    shell('home', page(`<div class="wizard">
      <div class="page-head"><a class="small" href="#home">← Cancel</a><p class="kicker dark">New course plan${student.id !== me.id ? ' for ' + esc(student.full_name) : ''}</p><h1>Create a course plan</h1></div>
      <ol class="stepper">${steps.map((s, i) => `<li class="${i + 1 < st.step ? 'done' : i + 1 === st.step ? 'on' : ''}"><button ${i + 1 < st.step ? '' : 'disabled'} data-step="${i + 1}"><span>${i + 1}</span>${s}</button></li>`).join('')}</ol>
      <section class="panel">${body}</section></div>`));
    const go = (patch) => wizard(studentId, { ...st, ...patch });
    app.querySelectorAll('[data-step]').forEach((b) => { b.onclick = () => go({ step: Number(b.dataset.step) }); });
    app.querySelectorAll('.opt').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.k; const v = b.dataset.v;
        if (k === 'board') go({ board: v, qual: null, code: null, step: 2 });
        if (k === 'qual') go({ qual: v, code: null, step: 3 });
        if (k === 'code') { const s = C.SPECS.find((x) => x.code === v); go({ code: v, subject: s.subject, tier: s.tiers ? s.tiers[0] : '', step: 4 }); }
      };
    });
    const other = document.getElementById('other');
    if (other) other.onsubmit = (e) => { e.preventDefault(); go({ code: document.getElementById('ocode').value.trim().toUpperCase(), subject: document.getElementById('osub').value.trim(), topics: document.getElementById('otopics').value.split('\n').map((x) => x.trim()).filter(Boolean), custom: true, tier: '', step: 4 }); };
    const when = document.getElementById('when');
    if (when) {
      const ser = document.getElementById('series'); ser.onchange = () => { if (ser.value !== 'custom') document.getElementById('exam').value = ser.value; };
      when.onsubmit = (e) => {
        e.preventDefault();
        const exam = document.getElementById('exam').value; const start = document.getElementById('start').value;
        if (exam <= start) { alertIn(when, 'The exam date must be after the start date.'); return; }
        const t = app.querySelector('input[name=tier]:checked');
        go({ exam, start, hours: Number(document.getElementById('hours').value), tier: t ? t.value : st.tier, step: 5 });
      };
    }
    const create = document.getElementById('create');
    if (create) create.onclick = async () => {
      create.disabled = true; create.textContent = 'Creating…';
      try {
        await api.addCourse({ student_id: studentId, board: st.board, qualification: st.qual, subject: spec ? spec.subject : st.subject, code: st.code || '', tier: st.tier || '', exam_date: st.exam, start_date: st.start, hours_per_week: st.hours, plan: st.plan });
        await load(); const c = D.courses.filter((x) => x.student_id === studentId && x.subject === (spec ? spec.subject : st.subject)).pop();
        location.hash = c ? '#course-' + c.id : '#home';
      } catch (x) { create.disabled = false; create.textContent = 'Create course plan'; document.getElementById('err').innerHTML = `<p class="msg err">${esc(x.message)}</p>`; }
    };
  }
  function alertIn(el, text) { const p = document.createElement('p'); p.className = 'msg err'; p.textContent = text; el.append(p); }

  // ---------- invite codes ----------
  function inviteBox(opts) {
    // opts: {title, desc, role, extra, maxUses, id}
    return `<div class="invite-box"><div><b>${opts.title}</b><span class="muted small">${opts.desc}</span></div><button class="btn primary sm" data-invite='${esc(JSON.stringify({ role: opts.role, max_uses: opts.maxUses || 1, note: opts.note || '', ...(opts.extra || {}) }))}'>Make a code</button></div>`;
  }
  function codeList(filter) {
    const list = D.invites.filter(filter || (() => true));
    if (!list.length) return '<p class="muted small">No codes yet.</p>';
    return `<div class="scroll-x"><table class="data"><thead><tr><th>Code</th><th>For</th><th>Used</th><th>Expires</th><th></th></tr></thead><tbody>
      ${list.map((i) => `<tr><td><code class="code">${esc(i.code)}</code> <button class="btn ghost xs" data-copy="${esc(i.code)}">Copy</button></td>
        <td>${ROLE[i.role]}${i.class_id ? ` · ${esc((D.classes.find((c) => c.id === i.class_id) || {}).name || 'class')}` : ''}${i.parent_id ? ' · linked to you' : ''}${i.school_id ? ' · your school' : ''}${i.note ? `<br><span class="muted small">${esc(i.note)}</span>` : ''}</td>
        <td class="num">${i.uses} / ${i.max_uses}</td><td>${fmt(i.expires_at.slice(0, 10), { day: 'numeric', month: 'short' })}</td>
        <td><button class="btn ghost xs" data-del-code="${esc(i.code)}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function wireInvites(rerender) {
    app.querySelectorAll('[data-invite]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        const inv = { ...JSON.parse(b.dataset.invite), code: newCode(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString() };
        const noteEl = document.getElementById('inv-note'); if (noteEl && noteEl.value.trim()) inv.note = noteEl.value.trim().slice(0, 80);
        try { await api.addInvite(inv); await load(); rerender(); flash(`New code: ${inv.code}. Give it to the person who will sign up.`); }
        catch (x) { b.disabled = false; flash(x.message, true); }
      };
    });
    app.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = 'Copied'; }, () => { b.textContent = 'Select it'; }); }; });
    app.querySelectorAll('[data-del-code]').forEach((b) => { b.onclick = async () => { await api.deleteInvite(b.dataset.delCode); await load(); rerender(); }; });
  }
  function flash(text, bad) { const f = document.getElementById('flash'); if (f) { f.innerHTML = `<p class="msg ${bad ? 'err' : 'ok'}">${esc(text)}</p>`; f.scrollIntoView({ block: 'nearest' }); } }

  function invitesPage() {
    const school = mySchool();
    let boxes = '';
    if (me.is_platform_admin) {
      boxes += inviteBox({ title: 'School', desc: 'Sets up a new school. They then invite their own teachers.', role: 'school_admin' })
        + inviteBox({ title: 'Teacher (no school)', desc: 'A private tutor or teacher working on their own.', role: 'teacher' })
        + inviteBox({ title: 'Parent', desc: 'A parent who will manage their child\'s courses.', role: 'parent' })
        + inviteBox({ title: 'Student (on their own)', desc: 'A student who plans and studies by themselves.', role: 'student' });
    }
    if (school && school.myRole === 'admin') boxes += inviteBox({ title: 'Teacher at ' + esc(school.name), desc: 'Joins your school as a teacher.', role: 'teacher', extra: { school_id: school.id } });
    if (me.role === 'parent') boxes += inviteBox({ title: 'Your child', desc: 'Your child signs up with this code and is linked to you.', role: 'student', extra: { parent_id: me.id } });
    D.classes.filter((c) => c.teacher_id === me.id).forEach((c) => { boxes += inviteBox({ title: 'Students for ' + esc(c.name), desc: 'One code for the whole class (up to 40 students).', role: 'student', extra: { class_id: c.id }, maxUses: 40 }); });
    shell('invites', page(`
      <div class="page-head"><p class="kicker dark">Invite only</p><h1>Invite codes</h1><p class="muted">Each code works for one kind of account and expires after 30 days. Nobody can join without one.</p></div>
      <section class="panel"><h2>Make a code</h2>
        <label class="inline" for="inv-note">Note to remember who it's for (optional)<input id="inv-note" maxlength="80" placeholder="e.g. Test teacher account"></label>
        <div class="invite-grid">${boxes || '<p class="muted">Your account type can\'t invite anyone.</p>'}</div><div id="flash"></div></section>
      <section class="panel"><h2>Codes you've made</h2>${codeList()}</section>`));
    wireInvites(invitesPage);
  }

  // ---------- dashboards ----------
  function hello() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  function head(sub) { return `<div class="page-head"><p class="kicker dark">${fmt(today(), { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>${hello()}, ${esc(/^(mr|mrs|ms|miss|dr)\.?$/i.test((me.full_name || '').split(' ')[0]) ? me.full_name : (me.full_name || '').split(' ')[0])}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>`; }

  function studentHome() {
    const parents = D.guardianships.filter((g) => g.student_id === me.id).map((g) => person(g.parent_id).full_name);
    const classes = D.classes.filter((c) => D.classStudents.some((x) => x.class_id === c.id && x.student_id === me.id));
    shell('home', page(`${head(parents.length ? `Your courses are managed with ${esc(parents.join(' and '))}.` : classes.length ? `You're in ${esc(classes.map((c) => c.name).join(', '))}.` : '')}
      ${thisWeekBlock(me.id)}${coursesBlock(me.id, 'My courses', true)}`));
  }
  function childCard(ch) {
    const cs = coursesOf(ch.id);
    return `<article class="person-card"><div class="pc-head"><span class="avatar lg">${esc(initials(ch.full_name))}</span><div><h3>${esc(ch.full_name)}</h3><span class="muted small">${cs.length} course${cs.length === 1 ? '' : 's'}</span></div><a class="btn primary sm" href="#plan-for-${esc(ch.id)}">Add a course</a></div>
      ${cs.length ? `<div class="course-grid">${cs.map((c) => courseCard(c)).join('')}</div>` : '<p class="muted small">No courses yet.</p>'}</article>`;
  }
  function parentHome() {
    const kids = childrenOf(me.id);
    shell('home', page(`${head(kids.length ? `You manage ${kids.length} ${kids.length === 1 ? 'child' : 'children'}.` : '')}
      ${kids.map(childCard).join('') || '<section class="panel"><div class="empty"><b>Add your child</b><span>Make a code on the Invite codes page. Your child signs up with it and appears here.</span><a class="btn primary sm" href="#invites">Make a code</a></div></section>'}
      ${kids.length ? `<section class="panel slim"><div class="panel-head"><div><h2>Add another child</h2><p class="muted small">Make a code for them to sign up with.</p></div><a class="btn ghost sm" href="#invites">Invite codes</a></div></section>` : ''}`));
  }
  function teacherHome() {
    const mine = D.classes.filter((c) => c.teacher_id === me.id);
    const school = mySchool();
    shell('home', page(`${head(school ? esc(school.name) : 'Independent teacher')}
      <section class="panel"><div class="panel-head"><h2>My classes</h2></div>
        ${mine.map((c) => { const st = classStudents(c.id); return `<article class="class-card"><div class="pc-head"><div><h3>${esc(c.name)}</h3><span class="muted small">${st.length} student${st.length === 1 ? '' : 's'}</span></div><a class="btn ghost sm" href="#invites">Invite students</a></div>
          ${st.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>Student</th><th>Courses</th><th>This week</th><th></th></tr></thead><tbody>${st.map((s) => { const cs = coursesOf(s.id); return `<tr><td><b>${esc(s.full_name)}</b></td><td>${cs.map((x) => esc(x.subject)).join(', ') || '<span class="muted">None</span>'}</td><td class="small">${cs.map((x) => { const w = thisWeek(x); return w ? esc(w.title) : ''; }).filter(Boolean).slice(0, 2).join('<br>') || '–'}</td><td><a class="btn primary xs" href="#plan-for-${esc(s.id)}">Add course</a></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted small">No students yet. Make a class code on the Invite codes page and share it.</p>'}</article>`; }).join('') || '<div class="empty"><b>No classes yet</b><span>Create your first class below.</span></div>'}
        <form id="newclass" class="row form-row"><label for="cname">New class name<input id="cname" required maxlength="60" placeholder="e.g. 10X Maths"></label><button class="btn primary">Create class</button></form>
      </section>
      ${D.courses.length ? `<section class="panel"><h2>All your students' courses</h2><div class="course-grid">${D.courses.filter((c) => c.student_id !== me.id).map((c) => courseCard(c, true)).join('')}</div></section>` : ''}`));
    document.getElementById('newclass').onsubmit = async (e) => {
      e.preventDefault();
      try { await api.addClass({ name: document.getElementById('cname').value.trim(), teacher_id: me.id, school_id: school ? school.id : null }); await load(); teacherHome(); }
      catch (x) { alertIn(e.target, x.message); }
    };
  }
  function schoolHome() {
    const school = mySchool();
    if (!school) return shell('home', page(`${head()}<section class="panel"><p>Your school isn't set up yet.</p></section>`));
    const staff = D.members.filter((m) => m.school_id === school.id);
    const classes = D.classes.filter((c) => c.school_id === school.id);
    const students = [...new Set(D.classStudents.filter((x) => classes.some((c) => c.id === x.class_id)).map((x) => x.student_id))].map(person);
    shell('home', page(`${head(esc(school.name))}
      <div class="stats"><div class="stat"><span>Teachers</span><b>${staff.filter((s) => s.role === 'teacher').length}</b></div><div class="stat"><span>Classes</span><b>${classes.length}</b></div><div class="stat"><span>Students</span><b>${students.length}</b></div><div class="stat"><span>Course plans</span><b>${D.courses.length}</b></div></div>
      <div class="two">
        <section class="panel"><div class="panel-head"><h2>Staff</h2><a class="btn primary sm" href="#invites">Invite a teacher</a></div>
          <ul class="people">${staff.map((s) => `<li><span class="avatar">${esc(initials(person(s.person_id).full_name))}</span><span><b>${esc(person(s.person_id).full_name)}</b><small>${s.role === 'admin' ? 'School admin' : 'Teacher'}</small></span></li>`).join('')}</ul></section>
        <section class="panel"><div class="panel-head"><h2>Classes</h2></div>
          ${classes.length ? `<ul class="people">${classes.map((c) => `<li><span class="avatar sq">${esc(initials(c.name))}</span><span><b>${esc(c.name)}</b><small>${esc(person(c.teacher_id).full_name)} · ${classStudents(c.id).length} students</small></span></li>`).join('')}</ul>` : '<p class="muted small">Teachers create classes from their dashboard.</p>'}</section>
      </div>
      <section class="panel"><h2>Students' courses</h2>${D.courses.length ? `<div class="course-grid">${D.courses.map((c) => courseCard(c, true)).join('')}</div>` : '<p class="muted small">No course plans yet.</p>'}</section>`));
  }
  function everyonePage() {
    shell('everyone', page(`<div class="page-head"><p class="kicker dark">Owner</p><h1>Everyone</h1><p class="muted">All accounts in the beta.</p></div>
      <section class="panel"><div class="scroll-x"><table class="data"><thead><tr><th>Name</th><th>Account</th><th>Courses</th><th>Linked to</th></tr></thead><tbody>
      ${D.people.map((p) => `<tr><td><b>${esc(p.full_name)}</b></td><td>${ROLE[p.role] || ''}${p.is_platform_admin ? ' · owner' : ''}</td><td>${coursesOf(p.id).map((c) => esc(c.subject)).join(', ') || '–'}</td>
        <td class="small">${[...D.guardianships.filter((g) => g.student_id === p.id).map((g) => 'Parent: ' + esc(person(g.parent_id).full_name)), ...D.classStudents.filter((x) => x.student_id === p.id).map((x) => 'Class: ' + esc((D.classes.find((c) => c.id === x.class_id) || {}).name || '')), ...D.members.filter((m) => m.person_id === p.id).map((m) => esc((D.schools.find((s) => s.id === m.school_id) || {}).name || ''))].join('<br>') || '–'}</td></tr>`).join('')}
      </tbody></table></div></section>`));
  }

  // ---------- router ----------
  async function load() { D = await api.load(); return D; }
  async function render() {
    try {
      const route = location.hash.replace(/^#/, '');
      if (!me) me = await api.me();
      if (!me) {
        if (route === 'signin') return signInView();
        if (route === 'signup') return signUpView();
        return landing();
      }
      if (!me.role) return shell('', page('<section class="panel"><h1>Almost there</h1><p>This login isn\'t set up for the new site yet. Ask the site owner to add it.</p></section>'));
      await load();
      if (route === '' || route === 'signin' || route === 'signup') { location.replace('#home'); return; }
      if (route === 'welcome') return landing();
      if (route.startsWith('course-')) return coursePage(route.slice(7));
      if (route.startsWith('plan-for-')) return wizard(route.slice(9));
      if (route === 'invites') return invitesPage();
      if (route === 'everyone' && me.is_platform_admin) return everyonePage();
      if (me.role === 'student') return studentHome();
      if (me.role === 'parent') return parentHome();
      if (me.role === 'teacher') return teacherHome();
      if (me.role === 'school_admin') return schoolHome();
    } catch (x) {
      app.innerHTML = `<main class="page"><section class="panel"><h1>Something went wrong</h1><p>${esc(x.message)}</p><button class="btn primary" onclick="location.reload()">Reload</button></section></main>`;
    }
  }
  window.addEventListener('hashchange', render);
  render();
})();
