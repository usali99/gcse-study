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
  const CHILD_DOMAIN = 'ninegrade.co.uk';
  const childEmail = (u) => `child-${u}@${CHILD_DOMAIN}`;
  const childUser = (e) => { const m = /^child-([a-z0-9]{3,20})@ninegrade\.co\.uk$/.exec(e || ''); return m ? m[1] : null; };
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
      demo: false, sb,
      async me() {
        const { data } = await sb.auth.getSession();
        if (!data.session) return null;
        const p = must(await sb.from('people').select('*').eq('id', data.session.user.id).maybeSingle());
        return p ? { ...p, email: data.session.user.email } : { id: data.session.user.id, full_name: data.session.user.email, role: null, email: data.session.user.email };
      },
      async signIn(email, password) {
        const isUser = !email.includes('@');
        const { error } = await sb.auth.signInWithPassword({ email: isUser ? childEmail(email.toLowerCase()) : email, password });
        if (error) throw new Error(/Invalid login/.test(error.message) ? (isUser ? 'That username and password do not match.' : 'That email and password do not match.') : /confirm/i.test(error.message) ? 'Please confirm your email first: check your inbox for the link.' : error.message);
      },
      async signUp({ email, password, full_name, invite_code, school_name }) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { v2: true, full_name, invite_code, school_name }, emailRedirectTo: location.href.split('#')[0] } });
        if (error) throw new Error(/Database error|invite/i.test(error.message) ? 'That invite code is not valid or has already been used.' : error.message);
        return { needsConfirm: !data.session };
      },
      async signOut() { await sb.auth.signOut(); },
      async updateName(id, full_name) { must(await sb.from('people').update({ full_name }).eq('id', id)); },
      async updateEmail(email) { const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: location.href.split('#')[0] }); if (error) throw new Error(error.message); return { needsConfirm: true }; },
      async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw new Error(/different from the old/i.test(error.message) ? 'The new password must be different from the old one.' : error.message); },
      async resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] }); if (error) throw new Error(/rate limit/i.test(error.message) ? 'Too many emails sent. Please try again in an hour.' : error.message); },
      async load() {
        const [people, schools, members, classes, classStudents, guardianships, courses, invites] = await Promise.all([
          all('people'), all('schools'), all('school_members'), all('classes'), all('class_students'), all('guardianships'),
          all('courses', (q) => q.order('exam_date')), all('invites', (q) => q.order('created_at', { ascending: false })),
        ]);
        let requests = []; let feedback = [];
        const { data: ses } = await sb.auth.getSession(); if (people.some((x) => x.is_platform_admin && ses.session && x.id === ses.session.user.id)) { try { requests = await all('invite_requests', (q) => q.order('created_at', { ascending: false })); } catch (e) { requests = []; } try { feedback = await all('feedback', (q) => q.order('created_at', { ascending: false })); } catch (e) { feedback = []; } }
        let usernames = []; if (guardianships.some((g) => ses.session && g.parent_id === ses.session.user.id)) { const u = await sb.rpc('v2_child_usernames'); usernames = u.error ? [] : u.data; }
        return { people, schools, members, classes, classStudents, guardianships, courses, invites, requests, feedback, usernames };
      },
      async addCourse(c) { must(await sb.from('courses').insert(c)); },
      async lessonRequests(sid) { const r = await sb.from('lesson_requests').select('*').eq('student_id', sid).order('created_at', { ascending: false }).limit(3); return r.error ? null : r.data; },
      async requestLessons(sid, note) { const { error } = await sb.from('lesson_requests').insert({ student_id: sid, note }); if (error) throw new Error(/does not exist|schema cache/.test(error.message) ? 'This needs a quick database update first. Ask the site owner to run v2-lesson-requests.sql.' : /a lot of times|sign in/i.test(error.message) ? error.message : 'Sorry, that did not send. Please try again.'); },
      async updateCourse(id, patch) { const r = await sb.from('courses').update(patch).eq('id', id); if (r.error) throw new Error(/study_days/.test(r.error.message) ? 'Study days need a quick database update first. Ask the site owner to run v2-timetable.sql.' : r.error.message); },
      async deleteCourse(id) { must(await sb.from('courses').delete().eq('id', id)); },
      async addInvite(i) { must(await sb.from('invites').insert(i)); },
      async setInviteNote(code, note) { const r = await sb.from('invites').update({ note }).eq('code', code); if (r.error) throw new Error(/permission|denied/i.test(r.error.message) ? 'Notes need a quick database update first (v2-invite-names.sql).' : r.error.message); },
      async createChild({ full_name, username, password, parent_id }) {
        const code = newCode();
        must(await sb.from('invites').insert({ code, role: 'student', parent_id, max_uses: 1, note: 'Login for ' + full_name.slice(0, 60), expires_at: new Date(Date.now() + 864e5).toISOString() }));
        // A separate client, so creating the child doesn't sign the parent out.
        const tmp = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gcse-child-signup' } });
        const { error } = await tmp.auth.signUp({ email: childEmail(username), password, options: { data: { v2: true, full_name, invite_code: code } } });
        await tmp.auth.signOut({ scope: 'local' }).catch(() => {});
        if (error) { await sb.from('invites').delete().eq('code', code); throw new Error(/already|registered|exists/i.test(error.message) ? 'That username is taken. Try another one.' : /password/i.test(error.message) ? error.message : 'That login could not be created: ' + error.message); }
      },
      async childUsernames() { const r = await sb.rpc('v2_child_usernames'); return r.error ? [] : r.data; },
      async setChildPassword(child, new_password) { const r = await sb.rpc('v2_set_child_password', { child, new_password }); if (r.error) throw new Error(/does not exist|schema cache/.test(r.error.message) ? 'This needs a quick database update first (v2-child-logins.sql).' : r.error.message); },
      async deleteInvite(code) { must(await sb.from('invites').delete().eq('code', code)); },
      async addClass(c) { must(await sb.from('classes').insert(c)); },
      async requestInvite(r) { const { error } = await sb.from('invite_requests').insert(r); if (error) throw new Error(/already have a request|Too many/.test(error.message) ? error.message : /does not exist|schema cache/.test(error.message) ? 'Requests are not switched on yet. Please try again later.' : 'Something went wrong. Please check your details and try again.'); },
      async setRequest(id, status) { must(await sb.from('invite_requests').update({ status }).eq('id', id)); },
      async deleteRequest(id) { must(await sb.from('invite_requests').delete().eq('id', id)); },
      async sendFeedback(f) { const { error } = await sb.from('feedback').insert(f); if (error) throw new Error(/a lot of reports|sign in/.test(error.message) ? error.message : /does not exist|schema cache/.test(error.message) ? 'Reports are not switched on yet. Please try again later.' : error.message); },
      async setFeedback(id, status) { must(await sb.from('feedback').update({ status }).eq('id', id)); },
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
        requests: [{ id: 'rq1', full_name: 'Jo Example', email: 'jo@example.com', role: 'parent', note: 'Home-educating two children, GCSE in 2028.', status: 'new', created_at: '2026-11-18T09:00:00Z' }],
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
      accounts: () => S.people.filter((p) => ['usman', 'hadi', 'head', 'teacher', 'sam'].includes(p.id) || childUser(p.email)),
      async me() { return me(); },
      async signIn(id) { meId = id; store.set(KEY + '-me', id); },
      async signUp({ email, full_name, invite_code, school_name }) {
        const inv = S.invites.find((i) => i.code === String(invite_code || '').trim().toUpperCase());
        if (!inv || inv.uses >= inv.max_uses) throw new Error('That invite code is not valid or has already been used.');
        inv.uses++;
        const id = uid(); inv.used_by = [...(inv.used_by || []), id];
        S.people.push({ id, full_name, role: inv.role, is_platform_admin: false, email });
        if (inv.role === 'school_admin') { const sid = uid(); S.schools.push({ id: sid, name: school_name || 'My school' }); S.members.push({ school_id: sid, person_id: id, role: 'admin' }); }
        if (inv.role === 'teacher' && inv.school_id) S.members.push({ school_id: inv.school_id, person_id: id, role: 'teacher' });
        if (inv.role === 'student' && inv.parent_id) S.guardianships.push({ parent_id: inv.parent_id, student_id: id });
        if (inv.role === 'student' && inv.class_id) S.classStudents.push({ class_id: inv.class_id, student_id: id });
        save(); meId = id; store.set(KEY + '-me', id);
        return { needsConfirm: false };
      },
      async signOut() { meId = null; store.del(KEY + '-me'); },
      async updateName(id, full_name) { me().full_name = full_name; save(); },
      async updateEmail(email) { me().email = email; save(); return { needsConfirm: false }; },
      async updatePassword() { },
      async resetPassword() { },
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
          requests: m.is_platform_admin ? (S.requests || []) : [],
          feedback: m.is_platform_admin ? (S.feedback || []) : [],
          usernames: S.guardianships.filter((g) => g.parent_id === m.id).map((g) => ({ id: g.student_id, username: childUser((S.people.find((p) => p.id === g.student_id) || {}).email) })).filter((x) => x.username),
        };
      },
      async lessonRequests(sid) { return (S.lessonRequests || []).filter((r) => r.student_id === sid).slice(0, 3); },
      async requestLessons(sid, note) { if (!canManage(sid)) throw new Error('You can only ask for your own students.'); S.lessonRequests = S.lessonRequests || []; S.lessonRequests.unshift({ id: uid(), student_id: sid, requested_by: meId, note, status: 'new', reply: '', created_at: new Date().toISOString() }); save(); },
      async updateCourse(id, patch) { const c = S.courses.find((x) => x.id === id); if (!c || !canManage(c.student_id)) throw new Error('You can only change courses for your own students.'); Object.assign(c, patch); save(); },
      async addCourse(c) { if (!canManage(c.student_id)) throw new Error('You can only plan courses for your own students.'); S.courses.push({ ...c, id: uid(), created_at: new Date().toISOString() }); save(); },
      async deleteCourse(id) { S.courses = S.courses.filter((c) => c.id !== id); save(); },
      async createChild({ full_name, username, parent_id }) {
        if (S.people.some((p) => p.email === childEmail(username))) throw new Error('That username is taken. Try another one.');
        const id = uid(); S.people.push({ id, full_name, role: 'student', is_platform_admin: false, email: childEmail(username) }); S.guardianships.push({ parent_id, student_id: id }); save();
      },
      async setChildPassword() { },
      async setInviteNote(code, note) { S.invites.forEach((x) => { if (x.code === code) x.note = note; }); save(); },
      async addInvite(i) { S.invites.unshift({ ...i, uses: 0, created_by: meId, created_at: new Date().toISOString() }); save(); },
      async deleteInvite(code) { S.invites = S.invites.filter((i) => i.code !== code); save(); },
      async addClass(c) { S.classes.push({ ...c, id: uid() }); save(); },
      async requestInvite(r) { S.requests = S.requests || []; if (S.requests.some((x) => x.email === r.email.toLowerCase())) throw new Error('We already have a request from this email. We\'ll be in touch soon.'); S.requests.unshift({ ...r, email: r.email.toLowerCase(), id: uid(), status: 'new', created_at: new Date().toISOString() }); save(); },
      async setRequest(id, status) { (S.requests || []).forEach((x) => { if (x.id === id) x.status = status; }); save(); },
      async deleteRequest(id) { S.requests = (S.requests || []).filter((x) => x.id !== id); save(); },
      async sendFeedback(f) { S.feedback = S.feedback || []; S.feedback.unshift({ ...f, id: uid(), created_by: meId, status: 'new', created_at: new Date().toISOString() }); save(); },
      async setFeedback(id, status) { (S.feedback || []).forEach((x) => { if (x.id === id) x.status = status; }); save(); },
    };
  }

  const recovering = /type=recovery/.test(location.hash);
  const api = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && !/[?&]preview/.test(location.search) ? supabaseApi() : demoApi();
  let me = null; let D = null;
  // ---------- Report a problem ----------
  const KIND = { wrong_answer: 'The answer or marking is wrong', unclear: "It's unclear or confusing", typo: 'Typo or spelling mistake', missing_topic: 'A topic is missing or wrong', other: 'Something else' };
  const PLACE = { quiz: 'Quiz question', lesson: 'Lesson', plan: 'Course plan' };
  function report(o, label) {
    return `<button type="button" class="report-btn" data-report="${esc(JSON.stringify(o))}" aria-label="Report a problem${o.item ? ' with ' + esc(o.item) : ''}">${label === undefined ? '⚑ Report a problem' : label}</button>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-report]'); if (!b) return;
    e.preventDefault(); let o; try { o = JSON.parse(b.dataset.report); } catch (x) { return; }
    const kinds = o.place === 'plan' ? ['missing_topic', 'unclear', 'typo', 'other'] : o.place === 'quiz' ? ['wrong_answer', 'unclear', 'typo', 'other'] : ['unclear', 'typo', 'wrong_answer', 'other'];
    const wrap = document.createElement('div'); wrap.className = 'modal-back';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="rp-h"><h2 id="rp-h">Report a problem</h2>
      <p class="muted small">${esc(PLACE[o.place] || '')}${o.item ? ' · ' + esc(o.item) : ''}${o.context ? '<br>' + esc(o.context) : ''}</p>
      <form class="form" id="rp-form"><fieldset class="kinds"><legend>What's wrong?</legend>${kinds.map((k, i) => `<label class="radio"><input type="radio" name="rp-kind" value="${k}" ${i === 0 ? 'checked' : ''}> ${KIND[k]}</label>`).join('')}</fieldset>
        <label for="rp-note">Tell us more (optional)<textarea id="rp-note" rows="3" maxlength="1000" placeholder="${o.place === 'quiz' ? 'e.g. My answer “1800s” should count as right' : o.place === 'plan' ? 'e.g. This week should cover spreadsheets' : 'e.g. Step 3 uses a word that isn’t explained'}"></textarea></label>
        <div id="rp-msg"></div><div class="row"><button class="btn primary" type="submit">Send report</button><button class="btn ghost" type="button" id="rp-cancel">Cancel</button></div></form></div>`;
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); b.focus(); };
    wrap.addEventListener('click', (x) => { if (x.target === wrap) close(); });
    wrap.addEventListener('keydown', (x) => { if (x.key === 'Escape') close(); });
    wrap.querySelector('#rp-cancel').onclick = close; wrap.querySelector('input').focus();
    wrap.querySelector('#rp-form').onsubmit = async (x) => {
      x.preventDefault(); const btn = wrap.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Sending…';
      try { await api.sendFeedback({ kind: wrap.querySelector('input[name=rp-kind]:checked').value, note: wrap.querySelector('#rp-note').value.trim(), place: o.place, ref: String(o.ref || '').slice(0, 100), item: String(o.item || '').slice(0, 40), context: String(o.context || '').slice(0, 300) });
        wrap.querySelector('.modal').innerHTML = '<h2>Thank you</h2><p>Your report has been sent. We\'ll check it and fix it if needed.</p><div class="row"><button class="btn primary" id="rp-ok">Close</button></div>';
        wrap.querySelector('#rp-ok').onclick = close; wrap.querySelector('#rp-ok').focus(); b.textContent = '✓ Reported'; b.disabled = true; }
      catch (y) { btn.disabled = false; btn.textContent = 'Send report'; wrap.querySelector('#rp-msg').innerHTML = `<p class="msg err">${esc(y.message)}</p>`; }
    };
  });
  const study = window.createStudy({ sb: api.sb, demo: api.demo, getMeId: () => me && me.id, shell: (...a) => shell(...a), page: (...a) => page(...a), esc, today, app, report });

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
    const n = [['home', 'Dashboard'], ...study.nav()];
    if (me.is_platform_admin || ['school_admin', 'teacher', 'parent'].includes(me.role)) n.push(['invites', 'Invite codes']);
    n.push(['boards', 'Exam boards']);
    if (me.is_platform_admin) { const nf = D && D.feedback ? D.feedback.filter((f) => f.status === 'new').length : 0; n.push(['everyone', 'Everyone'], ['feedback', `Feedback${nf ? ` <span class="count">${nf}</span>` : ''}`]); }
    return n;
  }
  function shell(route, inner, opts = {}) {
    const nav = navFor();
    app.innerHTML = `
      <header class="bar ${opts.dark ? 'bar-dark' : ''}"><div class="bar-in">
        <a class="logo" href="#${me ? 'home' : ''}"><span class="logo-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 18V7l8-4 8 4v11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 21v-6h6v6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg></span>GCSE Study</a>
        ${nav.length ? `<nav class="nav" aria-label="Main">${nav.map(([r, t]) => `<a href="#${r}" ${route === r ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>` : '<span class="grow"></span>'}
        ${me ? `<div class="me"><a class="me-link" href="#account" title="My account" ${route === 'account' ? 'aria-current="page"' : ''}><span class="avatar" aria-hidden="true">${esc(initials(me.full_name))}</span><span class="me-name">${esc(me.full_name)}<small>${me.is_platform_admin && D && !childrenOf(me.id).length ? 'Owner' : `${me.role ? ROLE[me.role] : ''}${me.is_platform_admin ? ' · owner' : ''}`}${api.demo ? ' · preview' : ''}</small></span></a><button class="btn ghost sm" id="signout">Sign out</button></div>`
          : `<div class="me"><a class="btn ghost sm" href="#signin">Sign in</a><a class="btn accent sm" href="#signup">Get started</a></div>`}
      </div></header>
      ${inner}
      <footer class="foot"><div class="foot-in"><span>GCSE Study · invite-only beta</span><span>Plans follow the exam boards' published specifications. Always check dates with your exam centre.</span></div></footer>`;
    const so = document.getElementById('signout');
    if (so) so.onclick = async () => { await api.signOut(); study.forget(); me = null; location.hash = ''; render(); };
    window.scrollTo(0, 0);
  }
  const page = (inner, cls = '') => `<main class="page ${cls}">${inner}</main>`;

  // ---------- illustrations (landing page) ----------
  const ICON = {
    english: '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M8 8h6M8 11h6"/>',
    maths: '<path d="M6 7h5M8.5 4.5v5M13 7h5M6 16.5l4 4M10 16.5l-4 4M13 15h5M13 19h5"/>',
    physics: '<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-60 12 12)"/>',
    chemistry: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
    biology: '<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15z"/><path d="M5 19 13 11"/>',
    history: '<path d="M4 20h16M6 20V10M10 20V10M14 20V10M18 20V10M3 10l9-6 9 6z"/>',
    geography: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    computing: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const ring = (pct, size = 44, label = '') => `<span class="ring" style="--p:${Math.max(0, Math.min(100, pct))};--s:${size}px" role="img" aria-label="${label || pct + '%'}"><span>${Math.round(pct)}%</span></span>`;
  function illoSubjects() {
    const subs = [['english', 'English Language', 1, 'c1'], ['maths', 'Maths', 1, 'c2'], ['physics', 'Physics', 1, 'c3'], ['chemistry', 'Chemistry', 1, 'c4'],
      ['biology', 'Biology', 1, 'c5'], ['history', 'History', 0, 'c6'], ['geography', 'Geography', 0, 'c7'], ['computing', 'Computer Science', 0, 'c8']];
    return `<div class="illo illo-subjects" aria-hidden="true">${subs.map(([k, n, on, c], i) => `<div class="tile ${on ? 'on' : ''}" style="--r:${[-3, 2, -1, 3, 1, -2, 2, -1][i]}deg"><span class="ti ${c}">${icon(k)}</span><span class="tn">${n}</span><span class="tick">${on ? '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</span></div>`).join('')}</div>`;
  }
  function illoPlan() {
    const rows = [['english', 'c1', 'English Language', 'Paper 1 Q4: evaluation', 72], ['maths', 'c2', 'Maths', 'Fractions and percentages', 58], ['physics', 'c3', 'Physics', 'Energy stores', 40], ['chemistry', 'c4', 'Chemistry', 'Atomic structure', 85]];
    return `<div class="illo illo-plan" aria-hidden="true"><div class="rows">${rows.map(([k, c, n, t, p]) => `<div class="prow"><span class="ti ${c}">${icon(k)}</span><span class="pt"><b>${n}</b><small>${t}</small><span class="pbar"><span style="width:${p}%"></span></span></span><span class="pp">${p}%</span></div>`).join('')}</div>
      <div class="float-card"><div class="fc-top"><span class="flame">●</span><b>12</b><span>day streak</span></div><div class="fc-big">3h 20m</div><div class="fc-sub">studied this week</div>
        <div class="mini-bars">${[40, 65, 30, 80, 55, 0, 0].map((h, i) => `<span style="height:${Math.max(h, 6)}%" class="${h ? '' : 'off'}"></span>`).join('')}</div><div class="mini-days"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div></div></div>`;
  }
  function illoFeedback() {
    return `<div class="illo illo-feedback" aria-hidden="true"><div class="fb-card">
      <div class="fb-q"><span class="chip-s">Physics · Q4</span><span class="mark">4 / 6</span></div>
      <p class="fb-text">Describe how the energy from a falling object is transferred when it hits the ground.</p>
      <div class="fb-ans">The kinetic energy store <mark class="good">decreases</mark> and energy is transferred to the <mark class="good">thermal store</mark> of the ground and <mark class="miss">by sound</mark>…</div>
      <div class="fb-pt good"><b>+2</b> Named both energy stores correctly</div>
      <div class="fb-pt miss"><b>−2</b> Say that energy is dissipated, so less is usefully transferred</div></div></div>`;
  }
  function illoProgress() {
    return `<div class="illo illo-progress" aria-hidden="true"><div class="pg-card"><div class="rings">
      <div>${ring(78, 64)}<small>English</small></div><div>${ring(64, 64)}<small>Maths</small></div><div>${ring(52, 64)}<small>Science</small></div></div>
      <div class="pg-sub">Weak topics</div><div class="chips"><span class="wchip red">Simultaneous equations</span><span class="wchip amber">Comma splices</span><span class="wchip green">Atomic structure ✓</span></div></div></div>`;
  }

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
          <p class="fine">Invite-only beta. No code yet? <a class="light-link" href="#request">Request an invite</a> · <a class="light-link" href="#boards">Not sure of your exam board?</a></p>
        </div>
        <div class="hero-card" aria-label="Example plan">
          <div class="hc-head"><span class="chip">Pearson Edexcel · 1MA1 Foundation</span><span class="countdown"><b>${weeksUntil(C.examSeries(today())[2].date)}</b> weeks to go</span></div>
          <ol class="hc-weeks">${sample.map((w, i) => `<li class="${i === 0 ? 'now' : ''}"><span class="wk">Wk ${w.n}</span><span class="wt">${esc(w.title)}</span>${i === 0 ? '<span class="tag">This week</span>' : ''}</li>`).join('')}</ol>
          <div class="hc-foot"><span>Memory quiz</span><span class="score">4 / 5</span></div>
        </div>
      </div></section>
      ${page(`
      <div class="trust-strip"><span><b>5</b> exam boards</span><span><b>${C.SPECS.length}</b> ready-made specifications</span><span><b>GCSE</b> and International GCSE</span><span><b>&lt; 1 min</b> to build a plan</span></div>
      <section class="band">
        <h2 class="section-title">Everything a GCSE year needs, in one place</h2>
        <div class="showcase">
          <article class="show show-blue"><p class="show-k">Build your plan</p><p class="show-t">Pick the board and specification for each subject, and GCSE Study builds a week-by-week plan to the exam.</p>${illoSubjects()}</article>
          <article class="show show-green"><p class="show-k">Study week by week</p><p class="show-t">Each week shows what to study in every subject, with progress you can see building towards the exam.</p>${illoPlan()}</article>
          <article class="show show-amber"><p class="show-k">Marking you learn from</p><p class="show-t">Written answers are marked mark-scheme style: where marks were gained, where they were lost, and how to fix it.</p>${illoFeedback()}</article>
          <article class="show show-violet"><p class="show-k">Progress, shared</p><p class="show-t">Scores, weak topics and time spent by subject, shared with the parent or teacher who supports you.</p>${illoProgress()}</article>
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
          <li><b>Create a course plan</b><span>Answer five questions: board, qualification, subject, specification code and exam date.</span></li>
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
            <label for="email">Email or username<input id="email" type="text" inputmode="email" autocapitalize="none" spellcheck="false" autocomplete="username" required></label>
            <label for="pw">Password<input id="pw" type="password" autocomplete="current-password" required></label>
            ${err ? `<p class="msg err">${esc(err)}</p>` : ''}
            <button class="btn primary lg" id="go">Sign in</button>
          </form>`}
        ${api.demo ? '' : '<p class="small"><a href="#forgot">Forgot your password?</a></p>'}
        <p class="small muted">New here? <a href="#signup">Create an account with an invite code</a></p>
      </div></div>`));
    if (api.demo) {
      app.querySelectorAll('[data-acct]').forEach((b) => { b.onclick = async () => { await api.signIn(b.dataset.acct); location.hash = '#home'; render(); }; });
      document.getElementById('reset').onclick = (e) => { api.reset(); if (study.reset) study.reset(); e.target.textContent = 'Preview reset'; };
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
            <p class="small muted">${role === 'student' ? 'Joining a class or a parent? Use the code they gave you. Studying on your own and don\'t have a code? <a href="#request">Request an invite</a>.' : 'Don\'t have a code? <a href="#request">Request an invite</a>.'}</p>
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
  const weekEnd = (start) => new Date(new Date(start + 'T12:00:00').getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const isBehind = (w) => w.kind !== 'break' && !w.done && weekEnd(w.start) <= today();
  const behindCount = (c) => (c.plan || []).filter(isBehind).length;
  function courseCard(c, showStudent) {
    const late = behindCount(c);
    const w = thisWeek(c); const total = (c.plan || []).filter((x) => x.kind !== 'break').length;
    const done = (c.plan || []).filter((x) => x.kind !== 'break' && x.start <= today()).length;
    return `<a class="course" href="#course-${esc(c.id)}">
      <div class="course-top">${ring(total ? done / total * 100 : 0, 46, `${done} of ${total} weeks done`)}<span class="subject">${esc(c.subject)}</span></div>
      <div class="course-meta">${esc(c.board)} · ${esc(c.qualification)}${c.code ? ' · ' + esc(c.code) : ''}${c.tier ? ' · ' + esc(c.tier) : ''}${showStudent ? ` · <b>${esc(person(c.student_id).full_name)}</b>` : ''} · ${weeksUntil(c.exam_date)} weeks to go</div>
      ${late ? `<div class="behind-line"><span class="tag behind">Behind</span>${late} past week${late > 1 ? 's' : ''} not ticked done</div>` : ''}
      ${w ? `<div class="course-now"><span class="kind kind-${w.kind}">${w.kind === 'teach' ? 'This week' : w.kind === 'review' ? 'Review week' : w.kind === 'revision' ? 'Revision' : 'Break'}</span>${esc(w.title)}</div>` : ''}
      <div class="meter" role="img" aria-label="${done} of ${total} weeks done"><span style="width:${total ? Math.round(done / total * 100) : 0}%"></span></div>
    </a>`;
  }
  // A student with a parent or teacher can see their plans but not change them (matches v2-student-readonly.sql).
  const managedBy = (sid) => (D.guardianships.some((g) => g.student_id === sid) ? 'parent' : D.classStudents.some((x) => x.student_id === sid) ? 'teacher' : '');
  const canEditPlan = (sid) => !me || me.id !== sid || !managedBy(sid);
  const setByNote = (sid) => `<p class="msg info">Your ${managedBy(sid) === 'teacher' ? 'teacher' : 'parent'} sets your plans and timetable. If something doesn't work for you, ask them to change it.</p>`;
  function coursesBlock(sid, title, canAdd) {
    canAdd = canAdd && canEditPlan(sid);
    const cs = coursesOf(sid);
    return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${canAdd ? `<a class="btn primary sm" href="#plan-for-${esc(sid)}">Add a course</a>` : ''}</div>
      ${cs.length ? `<div class="course-grid">${cs.map((c) => courseCard(c)).join('')}</div>` : `<div class="empty"><b>No courses yet.</b><span>A course plan takes about a minute: board, subject, specification code and exam date.</span>${canAdd ? `<a class="btn primary sm" href="#plan-for-${esc(sid)}">Create the first plan</a>` : ''}</div>`}
    </section>`;
  }
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const daysOf = (c) => (Array.isArray(c.study_days) ? c.study_days.map(Number).filter((d) => d >= 1 && d <= 7) : []);
  const perDay = (c) => { const n = daysOf(c).length; return n ? Math.max(5, Math.round((Number(c.hours_per_week) * 60) / n / 5) * 5) : 0; };
  const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`);
  function thisWeekBlock(sid) {
    const cs = coursesOf(sid).map((c) => ({ c, w: thisWeek(c) })).filter((x) => x.w);
    if (!cs.length) return '';
    const head = `<div class="panel-head"><h2>This week</h2><div class="row"><span class="muted small">Week of ${fmt(cs[0].w.start, { day: 'numeric', month: 'long' })}</span><a class="btn ghost sm" href="#timetable-${esc(sid)}">Weekly timetable</a></div></div>`;
    const line = ({ c, w }, m) => `<li><span class="dot kind-${w.kind}"></span><span><b>${esc(c.subject)}</b> ${esc(w.title)}${w.done ? ' <span class="tag ok">Done</span>' : ''}</span><span class="muted small">${m ? mins(m) : w.hours ? `${w.hours} h` : ''}</span></li>`;
    if (!cs.some(({ c }) => daysOf(c).length)) return `<section class="panel">${head}<ul class="week-list">${cs.map((x) => line(x)).join('')}</ul></section>`;
    const todayN = ((new Date().getDay() + 6) % 7) + 1;
    const loose = cs.filter(({ c }) => !daysOf(c).length);
    return `<section class="panel">${head}<div class="days">${DAYS_LONG.map((d, i) => { const list = cs.filter(({ c, w }) => w.kind !== 'break' && daysOf(c).includes(i + 1)); if (!list.length) return '';
        return `<div class="day ${i + 1 === todayN ? 'today' : ''}"><h3>${d}${i + 1 === todayN ? ' <span class="tag">Today</span>' : ''}<span class="muted small">${mins(list.reduce((a, x) => a + perDay(x.c), 0))}</span></h3><ul class="week-list">${list.map((x) => line(x, perDay(x.c))).join('')}</ul></div>`; }).join('')}
      ${loose.length ? `<div class="day"><h3>Any day this week</h3><ul class="week-list">${loose.map((x) => line(x)).join('')}</ul></div>` : ''}</div></section>`;
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
        <h1>${esc(c.subject)}${st.id !== me.id ? ` <span class="for">for ${esc(st.full_name)}</span>` : ''}</h1>
        <div class="row">${canEditPlan(c.student_id) ? `<a class="btn primary sm" href="#edit-${esc(c.id)}">Edit plan</a>` : ''}<a class="btn ghost sm" href="#timetable-${esc(c.student_id)}">Weekly timetable</a>${daysOf(c).length ? `<span class="muted small">Studied on ${daysOf(c).map((d) => DAYS[d - 1]).join(', ')}</span>` : ''}</div></div>
      <div class="stats">
        <div class="stat"><span>Exam</span><b>${fmt(c.exam_date, { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>
        <div class="stat"><span>Weeks to go</span><b>${weeksUntil(c.exam_date)}</b></div>
        <div class="stat"><span>Study time</span><b>${c.hours_per_week} h/week</b></div>
        <div class="stat"><span>Plan</span><b>${plan.filter((w) => w.kind === 'teach').length} teaching · ${plan.filter((w) => w.kind === 'review').length} review · ${plan.filter((w) => w.kind === 'revision').length} revision</b></div>
      </div>
      <section class="panel"><div class="panel-head"><h2>Week-by-week plan</h2><div class="legend"><span><i class="dot kind-teach"></i>Teaching</span><span><i class="dot kind-review"></i>Review</span><span><i class="dot kind-revision"></i>Revision</span><span><i class="dot kind-break"></i>Break</span></div></div>
        <div class="timeline">${Object.keys(byMonth).map((k) => `<div class="month"><h3>${fmt(k + '-15', { month: 'long', year: 'numeric' })}</h3>
          <ol>${byMonth[k].map((w) => { const now = w.start <= t && t < new Date(new Date(w.start + 'T12:00:00').getTime() + 7 * 864e5).toISOString().slice(0, 10); return `<li class="wk-row kind-${w.kind} ${now ? 'now' : ''} ${isBehind(w) ? 'behind' : ''}"><span class="wk-n">Wk ${w.n}</span><span class="wk-d">${fmt(w.start, { day: 'numeric', month: 'short' })}</span><span class="wk-t">${esc(w.title)}${now ? ' <span class="tag">This week</span>' : ''}${w.done ? ' <span class="tag ok">Done</span>' : ''}${isBehind(w) ? ' <span class="tag behind">Behind</span>' : ''}</span>${report({ place: 'plan', ref: c.id, item: 'Week ' + w.n, context: `${c.subject} (${c.code || c.board}): ${w.title}` }, '⚑')}</li>`; }).join('')}</ol></div>`).join('')}</div>
      </section>
      <section class="panel danger-zone"><div class="panel-head"><div><h2>Remove this course</h2><p class="muted small">This deletes the plan. It can't be undone.</p></div><button class="btn danger sm" id="del">Remove course</button></div><div id="confirm"></div></section>`));
    document.getElementById('del').onclick = () => {
      document.getElementById('confirm').innerHTML = '<div class="row"><span>Remove this course for good?</span><button class="btn danger sm" id="yes">Yes, remove it</button><button class="btn ghost sm" id="no">Keep it</button></div>';
      document.getElementById('no').onclick = () => { document.getElementById('confirm').innerHTML = ''; };
      document.getElementById('yes').onclick = async () => { await api.deleteCourse(c.id); location.hash = '#home'; };
    };
  }

  // ---------- course plan wizard ----------
  function editCourse(id) {
    const c = D.courses.find((x) => x.id === id);
    if (!c) return shell('home', page('<section class="panel"><h1>Course not found</h1><p><a href="#home">Back to your dashboard</a></p></section>'));
    if (!canEditPlan(c.student_id)) return shell('home', page(`<div class="narrow"><div class="page-head"><a class="small" href="#course-${esc(c.id)}">← Back to the plan</a><h1>${esc(c.subject)}</h1></div>${setByNote(c.student_id)}</div>`));
    const spec = C.SPECS.find((s) => s.code === c.code && s.board === c.board);
    let plan = JSON.parse(JSON.stringify(c.plan || []));
    const KINDS = { teach: 'Teaching', review: 'Review', revision: 'Revision', break: 'Break' };
    const draw = (msg) => {
      shell('home', page(`<div class="page-head"><a class="small" href="#course-${esc(c.id)}">← Back to the plan</a><p class="kicker dark">${esc(c.board)} · ${esc(c.qualification)}${c.code ? ' · ' + esc(c.code) : ''}</p><h1>Edit ${esc(c.subject)}</h1></div>
        <section class="panel"><h2>Dates, tier and study time</h2><p class="muted small">Changing these rebuilds the plan from the start. Weeks you ticked as done stay ticked.</p>
          <form id="basics" class="form two">
            ${spec && spec.tiers ? `<label for="e-tier">Tier<select id="e-tier">${spec.tiers.map((t) => `<option ${t === c.tier ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : ''}
            <label for="e-exam">First exam date<input id="e-exam" type="date" value="${esc(c.exam_date)}" required></label>
            <label for="e-start">Start studying on<input id="e-start" type="date" value="${esc(c.start_date)}" required></label>
            <label for="e-hours">Study time per week (hours)<input id="e-hours" type="number" min="0.25" max="20" step="0.25" value="${esc(c.hours_per_week)}" required></label>
            <div><button class="btn primary">Save and rebuild the plan</button></div></form></section>${lessonHint(c.student_id)}
        <section class="panel"><div class="panel-head"><div><h2>Weeks</h2><p class="muted small">Rename a week, change its type, move it up or down, or tick it when it's done. Then press Save weeks.</p></div><button class="btn primary sm" id="save-weeks">Save weeks</button></div>
          <div id="e-msg">${msg || ''}</div>
          <ol class="wk-edit">${plan.map((w, i) => `<li class="kind-${w.kind}"><span class="wk-n">Wk ${w.n}<small>${fmt(w.start, { day: 'numeric', month: 'short' })}</small></span>
            <select data-kind="${i}" aria-label="Week ${w.n} type">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === w.kind ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <input data-title="${i}" value="${esc(w.title)}" maxlength="140" aria-label="Week ${w.n} title">
            <span class="wk-btns"><button class="btn ghost xs" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move week ${w.n} up">↑</button><button class="btn ghost xs" data-down="${i}" ${i === plan.length - 1 ? 'disabled' : ''} aria-label="Move week ${w.n} down">↓</button></span>
            <label class="done-box"><input type="checkbox" data-done="${i}" ${w.done ? 'checked' : ''}> Done</label></li>`).join('')}</ol>
          <div class="row" style="margin-top:12px"><button class="btn primary" id="save-weeks-2">Save weeks</button></div></section>`));
      const grab = () => app.querySelectorAll('[data-title]').forEach((el) => { const w = plan[el.dataset.title]; w.title = el.value.trim() || w.title; w.kind = app.querySelector(`[data-kind="${el.dataset.title}"]`).value; w.done = app.querySelector(`[data-done="${el.dataset.title}"]`).checked; w.hours = w.kind === 'break' ? 0 : Number(c.hours_per_week); });
      const swap = (a, b) => { grab(); const keep = ['start', 'n', 'done']; const A = plan[a]; const B = plan[b]; const ca = {}; const cb = {};
        Object.keys(A).forEach((k) => { if (!keep.includes(k)) { ca[k] = A[k]; delete A[k]; } }); Object.keys(B).forEach((k) => { if (!keep.includes(k)) { cb[k] = B[k]; delete B[k]; } });
        Object.assign(A, cb); Object.assign(B, ca); draw(); };
      app.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => swap(Number(b.dataset.up) - 1, Number(b.dataset.up)); });
      app.querySelectorAll('[data-down]').forEach((b) => { b.onclick = () => swap(Number(b.dataset.down), Number(b.dataset.down) + 1); });
      const saveWeeks = async () => { grab(); try { await api.updateCourse(c.id, { plan }); c.plan = JSON.parse(JSON.stringify(plan)); draw('<p class="msg ok">Weeks saved.</p>'); } catch (x) { draw(`<p class="msg err">${esc(x.message)}</p>`); } };
      document.getElementById('save-weeks').onclick = saveWeeks; document.getElementById('save-weeks-2').onclick = saveWeeks;
      document.getElementById('basics').onsubmit = async (e) => {
        e.preventDefault(); const v = (x) => document.getElementById(x) && document.getElementById(x).value;
        const tier = v('e-tier') || c.tier; const exam = v('e-exam'); const start = v('e-start'); const hours = Number(v('e-hours'));
        if (exam <= start) return draw('<p class="msg err">The exam date must be after the start date.</p>');
        const topics = spec ? C.topicsFor(spec, tier) : [...new Set(plan.filter((w) => w.kind === 'teach').flatMap((w) => w.topics || [w.title]).map((t) => String(t).replace(/ \(practice\)$/, '')))];
        const done = new Set(plan.filter((w) => w.done).map((w) => w.start));
        const fresh = C.buildPlan({ start, exam, topics, hoursPerWeek: hours }).map((w) => (done.has(w.start) ? { ...w, done: true } : w));
        try { await api.updateCourse(c.id, { tier: tier || '', exam_date: exam, start_date: start, hours_per_week: hours, plan: fresh });
          Object.assign(c, { tier: tier || '', exam_date: exam, start_date: start, hours_per_week: hours, plan: fresh }); plan = JSON.parse(JSON.stringify(fresh)); draw('<p class="msg ok">Plan rebuilt and saved.</p>'); }
        catch (x) { draw(`<p class="msg err">${esc(x.message)}</p>`); }
      };
    };
    draw();
  }
  // ---------- "Update next week's lessons" (only for a student who gets written lessons) ----------
  const hasLessons = (sid) => !!study.role && study.role === 'admin' && sid === (study.studentId() || (childrenOf(me.id)[0] || {}).id);
  const nextMonday = () => { const d = new Date(today() + 'T12:00:00'); const add = ((8 - d.getDay()) % 7) || 7; return new Date(d.getTime() + add * 864e5).toISOString().slice(0, 10); };
  function lessonHint(sid) {
    if (!hasLessons(sid)) return '';
    return `<section class="panel lesson-update"><h2>Next week's lessons</h2><p class="muted small">After changing the plans, go to the <a href="#timetable-${esc(sid)}">Weekly timetable</a> and press <b>Update next week's lessons</b> once. One request covers every subject.</p></section>`;
  }
  function lessonBox(sid) {
    if (!hasLessons(sid)) return '';
    const name = esc(person(sid).full_name.split(' ')[0] || 'your child');
    return `<section class="panel lesson-update" id="lu-box"><h2>Update next week's lessons</h2>
      <p class="muted small">Changed the study time, days or topics of any subject? Press this once and all of ${name}'s lessons for the week of ${fmt(nextMonday(), { day: 'numeric', month: 'long' })} will be rewritten to match. Requests are picked up every evening at about 5:40 PM. The new lessons arrive as drafts for you to approve. Lessons ${name} has already started are never changed.</p>
      <label for="lu-note" class="inline">Anything to add? (optional)<textarea id="lu-note" rows="2" maxlength="500" placeholder="e.g. More Maths practice on fractions, less writing on Friday"></textarea></label>
      <div id="lu-wait"></div><div class="row"><button class="btn primary" id="lu-send">Update next week's lessons</button></div><div id="lu-msg"></div><div id="lu-list" class="small muted"></div></section>`;
  }
  async function wireLessonBox(sid) {
    const box = document.getElementById('lu-box'); if (!box) return;
    const list = async () => { const rs = await api.lessonRequests(sid); const el = document.getElementById('lu-list'); if (!el) return;
      const waiting = (rs || []).some((r) => r.status === 'new'); const btn = document.getElementById('lu-send');
      if (btn && !btn.disabled) btn.textContent = waiting ? 'Add another note' : "Update next week's lessons";
      document.getElementById('lu-wait').innerHTML = waiting && !document.getElementById('lu-msg').textContent ? '<p class="msg ok">A request is already waiting for this evening. It covers every subject, so you don\'t need to press again unless you want to add a note.</p>' : '';
      el.innerHTML = rs && rs.length ? `<ul class="lu-reqs">${rs.map((r) => `<li><span class="tag ${r.status === 'done' ? 'ok' : ''}">${r.status === 'done' ? 'Done' : 'Waiting'}</span> Asked ${fmt(r.created_at.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}${r.note ? ` · “${esc(r.note)}”` : ''}${r.reply ? `<br>${esc(r.reply)}` : r.status === 'new' ? '<br>Will be done this evening.' : ''}</li>`).join('')}</ul>` : ''; };
    document.getElementById('lu-send').onclick = async (e) => { const b = e.target; b.disabled = true; b.textContent = 'Sending…';
      try { await api.requestLessons(sid, document.getElementById('lu-note').value.trim()); document.getElementById('lu-note').value = '';
        document.getElementById('lu-msg').innerHTML = '<p class="msg ok">Sent. Next week\'s lessons for every subject will be rewritten this evening, and you\'ll see them as drafts on the Lessons page.</p>'; }
      catch (x) { document.getElementById('lu-msg').innerHTML = `<p class="msg err">${esc(x.message)}</p>`; }
      b.disabled = false; list(); };
    list();
  }
  function timetablePage(sid) {
    const st = person(sid); const cs = coursesOf(sid); const ro = !canEditPlan(sid);
    const draw = (msg) => {
      const sel = Object.fromEntries(cs.map((c) => [c.id, daysOf(c)]));
      shell('home', page(`<div class="page-head"><a class="small" href="#home">← Dashboard</a><p class="kicker dark">${st.id === me.id ? 'Your week' : esc(st.full_name)}</p><h1>Weekly timetable</h1>
        <p class="muted">${ro ? 'The ticked days are when you study each subject, and how long for. The totals show how busy each day is.' : "Tick the days each subject is studied. Each subject's weekly hours are shared across its days, and the totals show how busy each day is."}</p></div>${ro ? setByNote(sid) : ''}
        ${cs.length ? `<section class="panel"><div id="t-msg">${msg || ''}</div><div class="scroll-x"><table class="data tt"><thead><tr><th>Subject</th>${DAYS.map((d) => `<th>${d}</th>`).join('')}<th>Per day</th></tr></thead><tbody>
          ${cs.map((c) => `<tr><td><b>${esc(c.subject)}</b><small class="muted">${c.hours_per_week} h a week</small></td>${DAYS.map((d, i) => `<td><input type="checkbox" data-c="${esc(c.id)}" data-d="${i + 1}" ${sel[c.id].includes(i + 1) ? 'checked' : ''} aria-label="${esc(c.subject)} on ${DAYS_LONG[i]}" ${ro ? 'disabled' : ''}></td>`).join('')}<td class="muted small" data-per="${esc(c.id)}"></td></tr>`).join('')}
          </tbody><tfoot><tr><th>Total</th>${DAYS.map((d, i) => `<td class="small" data-tot="${i + 1}"></td>`).join('')}<td></td></tr></tfoot></table></div>
          ${ro ? '' : '<div class="row" style="margin-top:14px"><button class="btn primary" id="t-save">Save timetable</button><button class="btn ghost sm" id="t-even">Suggest days for me</button></div>'}</section>`
          : '<section class="panel"><p class="muted">Add a course first, then choose its days here.</p></section>'}${lessonBox(sid)}`));
      wireLessonBox(sid);
      if (!cs.length) return;
      const read = () => Object.fromEntries(cs.map((c) => [c.id, [...app.querySelectorAll(`[data-c="${c.id}"]:checked`)].map((x) => Number(x.dataset.d))]));
      const sums = () => { const r = read(); const tot = [0, 0, 0, 0, 0, 0, 0, 0];
        cs.forEach((c) => { const m = perDay({ ...c, study_days: r[c.id] }); app.querySelector(`[data-per="${c.id}"]`).textContent = r[c.id].length ? mins(m) : 'Any day'; r[c.id].forEach((d) => { tot[d] += m; }); });
        for (let d = 1; d <= 7; d++) { const el = app.querySelector(`[data-tot="${d}"]`); el.textContent = tot[d] ? mins(tot[d]) : ''; el.className = 'small' + (tot[d] > 150 ? ' warn-t' : ''); } };
      app.querySelectorAll('[data-c]').forEach((x) => { x.onchange = sums; }); sums();
      if (ro) return;
      document.getElementById('t-even').onclick = () => {
        // Spread subjects over Mon-Fri: about one study day per 45 minutes a week, rotating the start day.
        let k = 0; cs.forEach((c) => { const n = Math.min(5, Math.max(1, Math.round(Number(c.hours_per_week) * 60 / 45)));
          const days = []; for (let j = 0; j < n; j++) days.push(((k + Math.round(j * 5 / n)) % 5) + 1); k += 1;
          app.querySelectorAll(`[data-c="${c.id}"]`).forEach((x) => { x.checked = days.includes(Number(x.dataset.d)); }); }); sums(); };
      document.getElementById('t-save').onclick = async (e) => { const b = e.target; b.disabled = true; b.textContent = 'Saving…'; const r = read();
        try { for (const c of cs) { if (JSON.stringify(daysOf(c)) !== JSON.stringify(r[c.id])) { await api.updateCourse(c.id, { study_days: r[c.id] }); c.study_days = r[c.id]; } } draw('<p class="msg ok">Timetable saved. It now shows day by day under This week on the dashboard.</p>'); }
        catch (x) { draw(`<p class="msg err">${esc(x.message)}</p>`); } };
    };
    draw();
  }
  function wizard(studentId, st) {
    st = st || { step: 1 };
    const student = person(studentId);
    const specs = C.SPECS.filter((s) => (!st.board || s.board === st.board) && (!st.qual || s.qual === st.qual));
    const spec = C.SPECS.find((s) => s.code === st.code && s.board === st.board);
    const series = C.examSeries(today());
    const steps = ['Exam board', 'Qualification', 'Subject and code', 'Exam date', 'Check and create'];
    const quals = [...new Set(C.SPECS.filter((s) => s.board === st.board).map((s) => s.qual))];
    let body = '';
    if (st.step === 1) body = `<h2>Which exam board?</h2><p class="small muted">Not sure? <a href="#boards">How to find your exam board</a></p><div class="opt-grid">${C.BOARDS.map((b) => `<button class="opt" data-k="board" data-v="${esc(b)}">${esc(b)}</button>`).join('')}</div>`;
    if (st.step === 2) body = `<h2>Which qualification?</h2><div class="opt-grid">${(quals.length ? quals : C.QUALS).map((q) => `<button class="opt" data-k="qual" data-v="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
    if (st.step === 3) body = `<h2>Which subject?</h2>
      <div class="opt-grid">${specs.map((s) => `<button class="opt" data-k="code" data-v="${esc(s.code)}"><b>${esc(s.subject)}</b><small>${esc(s.code)}</small></button>`).join('')}</div>
      <details class="other"><summary>My subject isn't listed</summary><form id="other" class="form">
        <label for="osub">Subject name<input id="osub" required maxlength="60"></label>
        <label for="ocode">Specification code <small>on the board's website, e.g. 1MA1 or 8300</small><input id="ocode" maxlength="12"></label>
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
        <td>${ROLE[i.role]}${i.class_id ? ` · ${esc((D.classes.find((c) => c.id === i.class_id) || {}).name || 'class')}` : ''}${i.parent_id ? ' · linked to you' : ''}${i.school_id ? ' · your school' : ''}<br><span class="note-line" data-note-for="${esc(i.code)}">${i.note ? `<span class="small"><b>${esc(i.note)}</b></span> ` : ''}<button type="button" class="linkish small" data-edit-note="${esc(i.code)}" data-note="${esc(i.note || '')}">${i.note ? 'Edit note' : 'Add a note: who is it for?'}</button></span>${(i.used_by || []).length ? `<br><span class="small used-by">Used by ${(i.used_by || []).map((u) => esc(person(u).full_name)).join(', ')}</span>` : ''}</td>
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
    app.querySelectorAll('[data-edit-note]').forEach((b) => { b.onclick = () => {
      const code = b.dataset.editNote; const line = app.querySelector(`[data-note-for="${code}"]`);
      line.innerHTML = `<form class="note-form row"><input maxlength="80" value="${esc(b.dataset.note)}" placeholder="e.g. Hamza (parent)" aria-label="Note for code ${esc(code)}"><button class="btn primary xs">Save</button></form>`;
      const f = line.querySelector('form'); f.querySelector('input').focus();
      f.onsubmit = async (e) => { e.preventDefault(); try { await api.setInviteNote(code, f.querySelector('input').value.trim()); await load(); rerender(); } catch (x) { flash(x.message, true); } };
    }; });
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
    if (me.role === 'parent' && !(me.is_platform_admin && !childrenOf(me.id).length)) boxes += inviteBox({ title: 'Your child', desc: 'Your child signs up with this code and is linked to you.', role: 'student', extra: { parent_id: me.id } });
    D.classes.filter((c) => c.teacher_id === me.id).forEach((c) => { boxes += inviteBox({ title: 'Students for ' + esc(c.name), desc: 'One code for the whole class (up to 40 students).', role: 'student', extra: { class_id: c.id }, maxUses: 40 }); });
    shell('invites', page(`
      <div class="page-head"><p class="kicker dark">Invite only</p><h1>Invite codes</h1><p class="muted">Each code works for one kind of account and expires after 30 days. Nobody can join without one.</p></div>
      <section class="panel"><h2>Make a code</h2>
        <label class="inline" for="inv-note">Note to remember who it's for (optional)<input id="inv-note" maxlength="80" placeholder="e.g. Test teacher account"></label>
        <div class="invite-grid">${boxes || '<p class="muted">Your account type can\'t invite anyone.</p>'}</div><div id="flash"></div></section>
      ${me.is_platform_admin ? requestsPanel() : ''}
      <section class="panel"><h2>Codes you've made</h2>${codeList()}</section>`));
    wireInvites(invitesPage); wireRequests();
  }

  // ---------- dashboards ----------
  function hello() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  function head(sub) { return `<div class="page-head"><p class="kicker dark">${fmt(today(), { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>${hello()}, ${esc(/^(mr|mrs|ms|miss|dr)\.?$/i.test((me.full_name || '').split(' ')[0]) ? me.full_name : (me.full_name || '').split(' ')[0])}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>`; }

  function studentHome() {
    const parents = D.guardianships.filter((g) => g.student_id === me.id).map((g) => person(g.parent_id).full_name);
    const classes = D.classes.filter((c) => D.classStudents.some((x) => x.class_id === c.id && x.student_id === me.id));
    shell('home', page(`${head(parents.length ? `Your courses are managed with ${esc(parents.join(' and '))}.` : classes.length ? `You're in ${esc(classes.map((c) => c.name).join(', '))}.` : '')}
      ${study.dashBlock()}${overview(coursesOf(me.id))}${thisWeekBlock(me.id)}${coursesBlock(me.id, 'My courses', true)}`));
  }
  function overview(cs) {
    if (!cs.length) return '';
    const t = today(); const weeks = cs.map((c) => (c.plan || []).filter((w) => w.kind !== 'break'));
    const longest = weeks.reduce((a, w) => (w.length > a.length ? w : a), []);
    const total = longest.length; const done = longest.filter((x) => x.start <= t).length;
    const next = cs.map((c) => c.exam_date).sort()[0];
    const hours = cs.reduce((a, c) => a + Number(c.hours_per_week || 0), 0);
    return `<section class="overview"><div class="ov-ring">${ring(total ? done / total * 100 : 0, 92, 'Plan progress')}<div><b>Plan progress</b><span class="muted small">Week ${done} of ${total} on the way to the exams</span></div></div>
      <div class="ov-stat"><span>First exam</span><b>${weeksUntil(next)} weeks</b><small class="muted">${fmt(next, { day: 'numeric', month: 'short', year: 'numeric' })}</small></div>
      <div class="ov-stat"><span>Study time</span><b>${hours} h</b><small class="muted">planned each week</small></div>
      <div class="ov-stat"><span>Courses</span><b>${cs.length}</b><small class="muted">${esc([...new Set(cs.map((c) => c.board))].join(', '))}</small></div></section>`;
  }
  function childCard(ch) {
    const cs = coursesOf(ch.id);
    const studyHere = study.role === 'admin' && ch.id === (study.studentId() || childrenOf(me.id)[0].id);
    const uname = ((D.usernames || []).find((u) => u.id === ch.id) || {}).username;
    return `<article class="person-card"><div class="pc-head"><span class="avatar lg">${esc(initials(ch.full_name))}</span><div><h3>${esc(ch.full_name)}</h3><span class="muted small">${cs.length} course${cs.length === 1 ? '' : 's'}${uname ? ` · signs in as <b>${esc(uname)}</b> · <button type="button" class="linkish" data-reset-child="${esc(ch.id)}">Set a new password</button>` : ''}</span></div><div class="row"><a class="btn ghost sm" href="#timetable-${esc(ch.id)}">Weekly timetable</a><a class="btn primary sm" href="#plan-for-${esc(ch.id)}">Add a course</a></div></div><div class="reset-slot" id="reset-${esc(ch.id)}"></div>
      ${studyHere ? study.dashBlock() : ''}${overview(cs)}
      ${cs.length ? `<div class="course-grid">${cs.map((c) => courseCard(c)).join('')}</div>` : '<p class="muted small">No courses yet.</p>'}</article>`;
  }
  function feedbackPage(filter) {
    filter = filter || 'new'; const all = D.feedback || []; const list = all.filter((f) => (filter === 'new' ? f.status === 'new' : f.status !== 'new'));
    const where = (f) => (f.place === 'plan' ? (D.courses.some((c) => c.id === f.ref) ? `#course-${esc(f.ref)}` : '') : f.ref && study.role ? `#lesson-${esc(f.ref)}` : '');
    shell('feedback', page(`<div class="page-head"><p class="kicker dark">Owner</p><h1>Feedback</h1><p class="muted">Problems people reported on quiz questions, lessons and course plans. Claude's evening and Saturday runs fix Hadi's lessons and mark them fixed.</p></div>
      <div class="row" style="margin-bottom:16px"><button class="btn ${filter === 'new' ? 'primary' : 'ghost'} sm" data-ff="new">New (${all.filter((f) => f.status === 'new').length})</button><button class="btn ${filter !== 'new' ? 'primary' : 'ghost'} sm" data-ff="done">Dealt with (${all.filter((f) => f.status !== 'new').length})</button></div>
      ${list.length ? list.map((f) => `<section class="panel slim fb-item"><div class="panel-head"><div><span class="tagx">${esc(PLACE[f.place] || f.place)}${f.item ? ' · ' + esc(f.item) : ''}</span> <b>${esc(KIND[f.kind] || f.kind)}</b></div><span class="muted small">${esc(person(f.created_by).full_name)} · ${new Date(f.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
        ${f.context ? `<p class="small muted">${esc(f.context)}</p>` : ''}${f.note ? `<p>${esc(f.note)}</p>` : ''}
        <div class="row">${where(f) ? `<a class="btn ghost sm" href="${where(f)}">Open it</a>` : ''}${f.status === 'new' ? `<button class="btn primary sm" data-fs="fixed" data-id="${esc(f.id)}">Mark fixed</button><button class="btn ghost sm" data-fs="not_a_problem" data-id="${esc(f.id)}">Not a problem</button>` : `<span class="pill ${f.status === 'fixed' ? 'done' : 'todo'}">${f.status === 'fixed' ? 'Fixed' : 'Not a problem'}</span><button class="btn ghost sm" data-fs="new" data-id="${esc(f.id)}">Reopen</button>`}</div></section>`).join('')
        : `<section class="panel"><p class="muted">${filter === 'new' ? 'No new reports.' : 'Nothing dealt with yet.'}</p></section>`}`));
    app.querySelectorAll('[data-ff]').forEach((b) => { b.onclick = () => feedbackPage(b.dataset.ff); });
    app.querySelectorAll('[data-fs]').forEach((b) => { b.onclick = async () => { b.disabled = true; await api.setFeedback(b.dataset.id, b.dataset.fs); await load(); feedbackPage(filter); }; });
  }
  function ownerHome() {
    const by = (r) => D.people.filter((p) => p.role === r && !p.is_platform_admin).length;
    const open = (D.requests || []).filter((r) => r.status === 'new').length;
    const sid = study.role === 'admin' ? study.studentId() : null; const st = sid ? person(sid) : null;
    shell('home', page(`${head('You run the site. Here is everyone on it, and anything waiting for you.')}
      <div class="stats"><div class="stat"><span>Schools</span><b>${D.schools.length}</b></div><div class="stat"><span>Teachers</span><b>${by('teacher')}</b></div><div class="stat"><span>Parents</span><b>${by('parent')}</b></div><div class="stat"><span>Students</span><b>${by('student')}</b></div></div>
      ${(() => { const nf = (D.feedback || []).filter((f) => f.status === 'new').length; return `<section class="panel"><div class="panel-head"><div><h2>Problem reports</h2><p class="muted small">${nf ? `${nf} new.` : 'Nothing new.'}</p></div><a class="btn ${nf ? 'primary' : 'ghost'} sm" href="#feedback">Feedback${nf ? ` <span class="count">${nf}</span>` : ''}</a></div></section>`; })()}
      <section class="panel"><div class="panel-head"><div><h2>Invite requests</h2><p class="muted small">${open ? `${open} waiting for a reply.` : 'Nothing waiting.'}</p></div><a class="btn ${open ? 'primary' : 'ghost'} sm" href="#invites">Invite codes and requests${open ? ` <span class="count">${open}</span>` : ''}</a></div></section>
      ${study.role === 'admin' ? `<section class="panel"><div class="panel-head"><h2>${st ? esc(st.full_name) + "'s study" : 'Study'}</h2></div>${study.dashBlock()}</section>` : ''}
      <section class="panel slim"><div class="panel-head"><div><h2>Everyone</h2><p class="muted small">${D.people.length} accounts, ${D.courses.length} course plans.</p></div><a class="btn ghost sm" href="#everyone">See everyone</a></div></section>`));
  }
  function addChildPage(done) {
    shell('home', page(`<div class="narrow"><div class="page-head"><a class="small" href="#home">← Dashboard</a><p class="kicker dark">Your family</p><h1>Add a child</h1></div>
      ${done ? `<section class="panel"><h2>${esc(done.name)} can sign in now</h2><p>On <b>${esc(location.host || 'the site')}</b>, press Sign in and enter:</p>
        <dl class="summary"><dt>Username</dt><dd><b>${esc(done.username)}</b></dd><dt>Password</dt><dd>the one you just chose</dd></dl>
        <p class="muted small">Write these down somewhere safe. If they forget the password, use "Set a new password" on their card.</p><div class="row"><a class="btn primary" href="#plan-for-${esc(done.id || '')}">Add their first course</a><a class="btn ghost" href="#home">Back to dashboard</a></div></section>` : ''}
      <section class="panel"><h2>Create a login for your child</h2><p class="muted">No email needed. Your child signs in with a username and password that you choose here.</p>
        <form id="kid" class="form">
          <label for="k-name">Child's full name<input id="k-name" required maxlength="80" autocomplete="off"></label>
          <label for="k-user">Username <small>3 to 20 lowercase letters or numbers, e.g. sami2028</small><input id="k-user" required minlength="3" maxlength="20" pattern="[a-z0-9]{3,20}" autocapitalize="none" spellcheck="false" autocomplete="off"></label>
          <label for="k-pw">Password <small>at least 8 characters</small><input id="k-pw" type="text" minlength="8" required autocomplete="off"></label>
          <div id="k-msg"></div><button class="btn primary lg" id="k-go">Create login</button></form></section>
      <section class="panel slim"><div class="panel-head"><div><h2>Or: your child has their own email</h2><p class="muted small">Make an invite code. They sign up with it using their email and are linked to you.</p></div><a class="btn ghost sm" href="#invites">Invite codes</a></div></section></div>`));
    const u = document.getElementById('k-user'); u.oninput = () => { u.value = u.value.toLowerCase().replace(/[^a-z0-9]/g, ''); };
    document.getElementById('kid').onsubmit = async (e) => {
      e.preventDefault(); const b = document.getElementById('k-go'); const msg = document.getElementById('k-msg'); b.disabled = true; b.textContent = 'Creating…'; msg.innerHTML = '';
      const full_name = document.getElementById('k-name').value.trim(); const username = u.value; const password = document.getElementById('k-pw').value;
      try { if (!/^[a-z0-9]{3,20}$/.test(username)) throw new Error('Use 3 to 20 lowercase letters or numbers for the username.');
        await api.createChild({ full_name, username, password, parent_id: me.id }); await load();
        const kid = childrenOf(me.id).find((k) => k.full_name === full_name); addChildPage({ name: full_name, username, id: kid && kid.id }); }
      catch (x) { b.disabled = false; b.textContent = 'Create login'; msg.innerHTML = `<p class="msg err">${esc(x.message)}</p>`; }
    };
  }
  function parentHome() {
    const kids = childrenOf(me.id);
    shell('home', page(`${head(kids.length ? `You manage ${kids.length} ${kids.length === 1 ? 'child' : 'children'}.` : '')}
      ${kids.map(childCard).join('') || '<section class="panel"><div class="empty"><b>Add your child</b><span>Make a code on the Invite codes page. Your child signs up with it and appears here.</span><a class="btn primary sm" href="#add-child">Add your child</a></div></section>'}
      ${kids.length ? `<section class="panel slim"><div class="panel-head"><div><h2>Add another child</h2><p class="muted small">Create a login for them, with or without an email.</p></div><a class="btn ghost sm" href="#add-child">Add a child</a></div></section>` : ''}`));
    app.querySelectorAll('[data-reset-child]').forEach((b) => { b.onclick = () => {
      const id = b.dataset.resetChild; const slot = document.getElementById('reset-' + id);
      slot.innerHTML = `<form class="form-row row" id="rf-${esc(id)}"><label for="rp-${esc(id)}">New password <small>at least 8 characters</small><input id="rp-${esc(id)}" type="text" minlength="8" required autocomplete="off"></label><button class="btn primary sm">Save password</button><span class="out"></span></form>`;
      const f = document.getElementById('rf-' + id); f.querySelector('input').focus();
      f.onsubmit = async (e) => { e.preventDefault(); const out = f.querySelector('.out'); const btn = f.querySelector('button'); btn.disabled = true;
        try { await api.setChildPassword(id, f.querySelector('input').value); out.innerHTML = '<span class="msg ok">Saved. Tell your child the new password.</span>'; f.querySelector('input').value = ''; }
        catch (x) { out.innerHTML = `<span class="msg err">${esc(x.message)}</span>`; } btn.disabled = false; };
    }; });
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

  // ---------- invite requests ----------
  function requestView(done) {
    const roles = [['parent', 'Parent'], ['student', 'Student'], ['teacher', 'Teacher'], ['school_admin', 'School']];
    shell('request', page(`<div class="auth"><div class="auth-card">
      ${done ? `<p class="kicker dark">Request sent</p><h1>Thank you</h1><p>We've got your request. You'll get an email with your invite code when a place is ready.</p><a class="btn primary" href="#">Back to home</a>` : `
      <p class="kicker dark">Invite-only beta</p><h1>Request an invite</h1>
      <p class="muted">Tell us a little about you and we'll email you an invite code.</p>
      <form id="f" class="form" novalidate>
        <fieldset class="tiers"><legend>I am a…</legend>${roles.map(([v, t], i) => `<label class="radio"><input type="radio" name="role" value="${v}" ${i === 0 ? 'checked' : ''}> ${t}</label>`).join('')}</fieldset>
        <label for="r-name">Your name<input id="r-name" required maxlength="80" autocomplete="name"></label>
        <label for="r-email">Email<input id="r-email" type="email" required maxlength="120" autocomplete="email"></label>
        <label for="r-note">Anything we should know? <small>optional, e.g. subjects, exam year, school name</small><textarea id="r-note" rows="3" maxlength="500"></textarea></label>
        <label class="hp" aria-hidden="true">Website<input id="r-web" tabindex="-1" autocomplete="off"></label>
        <div class="out"></div>
        <button class="btn primary lg" id="go">Send request</button>
        <p class="small muted">We only use your email to send your invite.</p>
      </form>`}</div></div>`));
    const f = document.getElementById('f'); if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault(); const out = f.querySelector('.out'); const b = document.getElementById('go');
      const v = (id) => document.getElementById(id).value.trim();
      if (v('r-web')) return requestView(true);
      if (!v('r-name') || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('r-email'))) { out.innerHTML = '<p class="msg err">Please give your name and a valid email.</p>'; return; }
      b.disabled = true; b.textContent = 'Sending…';
      try { await api.requestInvite({ full_name: v('r-name'), email: v('r-email'), role: f.querySelector('input[name=role]:checked').value, note: v('r-note') }); requestView(true); }
      catch (x) { out.innerHTML = `<p class="msg err">${esc(x.message)}</p>`; b.disabled = false; b.textContent = 'Send request'; }
    };
  }
  function requestsPanel() {
    const rq = D.requests || []; const open = rq.filter((r) => r.status === 'new'); const doneList = rq.filter((r) => r.status !== 'new');
    const row = (r) => `<li class="req ${r.status}"><div class="req-main"><b>${esc(r.full_name)}</b> <span class="tagx">${ROLE[r.role]}</span><br><a href="mailto:${esc(r.email)}">${esc(r.email)}</a> <span class="muted small">· ${fmt(r.created_at.slice(0, 10), { day: 'numeric', month: 'short' })}</span>${r.note ? `<p class="small">${esc(r.note)}</p>` : ''}</div>
      <div class="req-act">${r.status === 'new' ? `<button class="btn primary sm" data-req-code="${esc(r.id)}">Make code and email</button><button class="btn ghost sm" data-req-done="${esc(r.id)}">Mark done</button>` : `<button class="btn ghost xs" data-req-del="${esc(r.id)}">Delete</button>`}</div></li>`;
    return `<section class="panel"><div class="panel-head"><h2>Invite requests ${open.length ? `<span class="count">${open.length}</span>` : ''}</h2><a class="small" href="#request" target="_blank">See the request form ↗</a></div>
      <div id="req-flash"></div>
      ${open.length ? `<ul class="reqs">${open.map(row).join('')}</ul>` : '<p class="muted small">No new requests.</p>'}
      ${doneList.length ? `<details class="other"><summary>Done (${doneList.length})</summary><ul class="reqs">${doneList.map(row).join('')}</ul></details>` : ''}</section>`;
  }
  function wireRequests() {
    const find = (id) => (D.requests || []).find((r) => r.id === id);
    app.querySelectorAll('[data-req-code]').forEach((b) => { b.onclick = async () => {
      const r = find(b.dataset.reqCode); b.disabled = true;
      try {
        const code = newCode();
        await api.addInvite({ code, role: r.role, max_uses: 1, note: (r.full_name + ' ' + r.email).slice(0, 80), expires_at: new Date(Date.now() + 30 * 864e5).toISOString() });
        await api.setRequest(r.id, 'done');
        const link = location.href.split('#')[0] + '#signup';
        const body = `Hi ${r.full_name.split(' ')[0]},\n\nThank you for your interest in GCSE Study. Here is your invite code:\n\n${code}\n\nTo create your account, go to ${link}, choose "${ROLE[r.role]}" and enter the code. It works once and expires in 30 days.\n\nBest wishes,\n${me.full_name}`;
        const mail = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent('Your GCSE Study invite code')}&body=${encodeURIComponent(body)}`;
        const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(r.email)}&su=${encodeURIComponent('Your GCSE Study invite code')}&body=${encodeURIComponent(body)}`;
        await load(); invitesPage();
        const fl = document.getElementById('req-flash');
        fl.innerHTML = `<div class="msg ok"><p><b>Code ${esc(code)} made for ${esc(r.full_name)}.</b> Now send it to ${esc(r.email)}:</p>
          <div class="row"><a class="btn primary sm" href="${esc(gmail)}" target="_blank" rel="noopener">Open in Gmail</a><a class="btn ghost sm" href="${esc(mail)}">Other mail app</a><button class="btn ghost sm" id="copy-mail">Copy the message</button></div></div>`;
        document.getElementById('copy-mail').onclick = (e) => navigator.clipboard.writeText(body).then(() => { e.target.textContent = 'Copied'; }, () => { e.target.textContent = 'Copy failed'; });
      } catch (x) { b.disabled = false; document.getElementById('req-flash').innerHTML = `<p class="msg err">${esc(x.message)}</p>`; }
    }; });
    app.querySelectorAll('[data-req-done]').forEach((b) => { b.onclick = async () => { await api.setRequest(b.dataset.reqDone, 'done'); await load(); invitesPage(); }; });
    app.querySelectorAll('[data-req-del]').forEach((b) => { b.onclick = async () => { await api.deleteRequest(b.dataset.reqDel); await load(); invitesPage(); }; });
  }

  // ---------- my account ----------
  function accountPage(o = {}) {
    shell('account', page(`<div class="page-head"><a class="small" href="#home">← Dashboard</a><p class="kicker dark">${ROLE[me.role] || ''}</p><h1>My account</h1></div>
      ${o.recovery ? '<p class="msg ok">You\'re signed in from the reset link. Choose a new password below.</p>' : ''}
      <div class="account-grid">
        <section class="panel"><h2>Name</h2><form id="f-name" class="form"><label for="a-name">Full name<input id="a-name" required maxlength="80" autocomplete="name" value="${esc(me.full_name)}"></label><button class="btn primary">Save name</button><div class="out"></div></form></section>
        ${childUser(me.email) ? `<section class="panel"><h2>Username</h2><p>You sign in with the username <b>${esc(childUser(me.email))}</b>.</p><p class="muted small">If you forget your password, your parent can set a new one from their dashboard.</p></section>` : `<section class="panel"><h2>Email</h2><form id="f-email" class="form"><label for="a-email">Email address<input id="a-email" type="email" required autocomplete="email" value="${esc(me.email || '')}"></label>${api.demo ? '' : '<p class="muted small">We\'ll email a link to confirm the change. Your old email works until then.</p>'}<button class="btn primary">Change email</button><div class="out"></div></form></section>`}
        <section class="panel" id="pw-panel"><h2>Password</h2><form id="f-pw" class="form"><label for="a-pw">New password <small>at least 8 characters</small><input id="a-pw" type="password" minlength="8" required autocomplete="new-password"></label><label for="a-pw2">Type it again<input id="a-pw2" type="password" minlength="8" required autocomplete="new-password"></label><button class="btn primary">Change password</button><div class="out"></div></form></section>
      </div>`));
    if (o.recovery) document.getElementById('a-pw').focus();
    const wire = (id, fn) => { const f = document.getElementById(id); f.onsubmit = async (e) => { e.preventDefault(); const b = f.querySelector('button'); const out = f.querySelector('.out'); b.disabled = true; out.innerHTML = '';
      try { const m = await fn(); out.innerHTML = `<p class="msg ok">${esc(m)}</p>`; } catch (x) { out.innerHTML = `<p class="msg err">${esc(x.message)}</p>`; } b.disabled = false; }; };
    wire('f-name', async () => { const n = document.getElementById('a-name').value.trim(); await api.updateName(me.id, n); me.full_name = n; const nm = app.querySelector('.me-name'); if (nm) nm.firstChild.textContent = n; return 'Name saved.'; });
    if (document.getElementById('f-email')) wire('f-email', async () => { const e = document.getElementById('a-email').value.trim(); if (e === me.email) throw new Error('That is already your email.'); const r = await api.updateEmail(e); if (!r.needsConfirm) me.email = e; return r.needsConfirm ? `Check ${e} for a link to confirm the change.` : 'Email changed.'; });
    wire('f-pw', async () => { const a = document.getElementById('a-pw').value; if (a !== document.getElementById('a-pw2').value) throw new Error('The two passwords don\'t match.'); await api.updatePassword(a); document.getElementById('f-pw').reset(); return 'Password changed.'; });
  }
  function forgotView() {
    shell('signin', page(`<div class="auth"><div class="auth-card"><p class="kicker dark">Sign in help</p><h1>Reset your password</h1>
      <p class="muted">Enter your email and we'll send a link to choose a new password.</p>
      <p class="note small">Signing in with a username? Ask your parent: they can set a new password for you from their dashboard.</p>
      <form id="f" class="form"><label for="email">Email<input id="email" type="email" required autocomplete="username"></label><button class="btn primary lg" id="go">Send reset link</button><div class="out"></div></form>
      <p class="small"><a href="#signin">Back to sign in</a></p></div></div>`));
    document.getElementById('f').onsubmit = async (e) => { e.preventDefault(); const b = document.getElementById('go'); const out = e.target.querySelector('.out'); b.disabled = true;
      try { await api.resetPassword(document.getElementById('email').value.trim()); out.innerHTML = '<p class="msg ok">If that email has an account, a reset link is on its way. Check your inbox and spam folder.</p>'; }
      catch (x) { out.innerHTML = `<p class="msg err">${esc(x.message)}</p>`; b.disabled = false; } };
  }

  // ---------- exam board guide ----------
  function boardsPage() {
    const G = window.BOARD_GUIDE;
    const ours = new Set(C.SPECS.map((x) => x.code));
    const cell = (v) => v ? esc(v).replace(/\b([0-9A-Z]{4})\b/g, (m) => ours.has(m) ? `<b>${m}</b>` : m) : '<span class="muted">–</span>';
    shell('boards', page(`
      <div class="page-head">${me ? '<a class="small" href="#home">← Dashboard</a>' : '<a class="small" href="#">← Home</a>'}<p class="kicker dark">Guide</p><h1>Exam boards</h1>
        <p class="muted guide-lede">Every GCSE is set by an exam board. Boards cover the same core content, but their papers, question styles and mark schemes differ, so revising with the right board's past papers matters. Here's how to find yours.</p></div>
      <section class="panel"><h2>How to find your exam board</h2>
        <ol class="find-list">${G.FIND.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol></section>
      <section class="panel"><h2>Studying at home or as a private candidate</h2>
        <p class="muted">There's no school to decide for you, so the exam centre usually does.</p>
        <ul class="tick-list">${G.PRIVATE.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
      <section class="panel"><h2>The boards</h2>
        <div class="board-grid">${G.BOARDS.map((b) => `<article class="board-card"><h3>${esc(b.name)}</h3><p class="small muted">${esc(b.where)}</p><p class="small">${esc(b.note)}</p><a class="small" href="${esc(b.site)}" target="_blank" rel="noopener">Specifications on the board's site ↗</a></article>`).join('')}</div>
        <p class="small muted">GCSEs in England are regulated by Ofqual, in Wales by Qualifications Wales, and in Northern Ireland by CCEA Regulation.</p></section>
      <section class="panel"><div class="panel-head"><h2>Specification codes</h2><span class="small muted"><b>Bold</b> codes have a ready-made course plan</span></div>
        <p class="small muted">The code identifies the exact course. Check it on the board's website before booking, as boards sometimes replace specifications.</p>
        <div class="scroll-x"><table class="data"><thead><tr><th>Subject</th><th>AQA</th><th>Pearson Edexcel</th><th>OCR</th></tr></thead>
        <tbody>${G.CODES.map(([sub, a, e, o]) => `<tr><td><b>${esc(sub)}</b></td><td>${cell(a)}</td><td>${cell(e)}</td><td>${cell(o)}</td></tr>`).join('')}</tbody></table></div></section>
      ${me ? '<div class="cta center"><a class="btn primary lg" href="#home">Back to your dashboard</a></div>' : '<div class="cta center"><a class="btn accent lg" href="#signup">Get started</a></div>'}`), { dark: !me });
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
        if (route === 'forgot') return forgotView();
        if (route === 'boards') return boardsPage();
        if (route === 'request') return requestView();
        return landing();
      }
      if (!me.role) return shell('', page('<section class="panel"><h1>Almost there</h1><p>This login isn\'t set up for the new site yet. Ask the site owner to add it.</p></section>'));
      await load();
      if (!study.checked) await study.init();
      if (study.role) await study.load();
      if (recovering && !window.__recoveryShown) { window.__recoveryShown = true; history.replaceState(null, '', location.pathname + location.search + '#account'); return accountPage({ recovery: true }); }
      if (route === '' || route === 'signin' || route === 'signup') { location.replace('#home'); return; }
      if (route === 'welcome') return landing();
      if (route === 'boards') return boardsPage();
      if (route.startsWith('course-')) return coursePage(route.slice(7));
      if (route.startsWith('plan-for-')) { const sid = route.slice(9); if (!canEditPlan(sid)) return shell('home', page(`<div class="narrow"><div class="page-head"><a class="small" href="#home">← Dashboard</a><h1>Add a course</h1></div>${setByNote(sid)}</div>`)); return wizard(sid); }
      if (route.startsWith('edit-')) return editCourse(route.slice(5));
      if (route.startsWith('timetable-')) return timetablePage(route.slice(10));
      if (route === 'invites') return invitesPage();
      if (route === 'add-child' && me.role === 'parent') return addChildPage();
      if (route === 'account') return accountPage();
      if (route === 'everyone' && me.is_platform_admin) return everyonePage();
      if (route === 'feedback' && me.is_platform_admin) return feedbackPage();
      if (await study.route(route)) return;
      if (me.role === 'student') return studentHome();
      if (me.is_platform_admin && !childrenOf(me.id).length && !coursesOf(me.id).length) return ownerHome();
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
