/* Practice sets: a parent, teacher or self-study student asks for a lesson, quiz, practice questions or a mock,
   made from text or files they give. Claude's evening run turns each request into a draft; the parent checks it
   and assigns it; the student does it (as many tries as they like) and the evening run marks the written work.
   Answer sheets are never sent to the student's browser (the database won't give them to the student). */
(function () {
  'use strict';
  const KINDS = {
    lesson: ['Lesson', 'Teach a topic step by step, with examples and a few questions.'],
    quiz: ['Quiz', 'Quick questions that mark themselves straight away.'],
    practice: ['Practice questions', 'Exam-style questions, marked with feedback.'],
    mock: ['Mock exam', 'A timed paper with a mark scheme, marked with feedback.'],
  };
  const STATUS = { requested: ['Being prepared', 'todo'], draft: ['Ready to check', 'draft'], assigned: ['Assigned', 'done'], archived: ['Archived', 'todo'] };
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const SQL_HINT = 'Practice sets need a quick database update first. Ask the site owner to run v2-practice.sql.';

  window.createPractice = function (ctx) {
    const { esc, fmt, shell, page, app } = ctx;
    const me = () => ctx.me(); const D = () => ctx.D();
    const nice = (x) => { const m = String((x && x.message) || x); if (/as_is|given_(text|files)|replaces_lessons/.test(m)) return 'This needs a quick database update first. Ask the site owner to run v2-practice-answers.sql.'; return /does not exist|schema cache|relation .* does not exist/i.test(m) ? SQL_HINT : m; };

    // ---------- who can do what (the database enforces the same rules) ----------
    const isStaffFor = (sid) => { const m = me(); const d = D(); if (!m || m.id === sid) return false;
      return m.is_platform_admin || d.guardianships.some((g) => g.parent_id === m.id && g.student_id === sid)
        || d.classStudents.some((x) => x.student_id === sid && (d.classes.find((c) => c.id === x.class_id) || {}).teacher_id === m.id)
        || (m.role === 'school_admin' && d.classStudents.some((x) => x.student_id === sid)); };
    const canEdit = (sid) => isStaffFor(sid) || (me() && me().id === sid && !ctx.managedBy(sid));
    const myStudents = () => { const m = me(); if (!m) return []; const d = D();
      return d.people.filter((p) => p.role === 'student' && p.id !== m.id && isStaffFor(p.id) && (!m.is_platform_admin || d.guardianships.some((g) => g.parent_id === m.id && g.student_id === p.id) || d.classStudents.some((x) => x.student_id === p.id))); };
    const first = (p) => (p.full_name || '').split(' ')[0];

    // ---------- data ----------
    const api = ctx.demo ? demoApi() : sbApi(ctx.sb);
    function sbApi(sb) {
      const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
      const up = async (folder, files) => { const paths = [];
        for (let i = 0; i < files.length; i++) { const f = files[i]; const safe = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60);
          const path = `${me().id}/${folder}/${i + 1}-${safe}`; must(await sb.storage.from('practice').upload(path, f, { contentType: f.type || undefined })); paths.push(path); }
        return paths; };
      return {
        async sets() { return must(await sb.from('practice_sets').select('*').order('created_at', { ascending: false })); },
        async set(id) { return must(await sb.from('practice_sets').select('*').eq('id', id).maybeSingle()); },
        async answers(id) { const r = await sb.from('practice_answers').select('body_html').eq('set_id', id).maybeSingle(); return r.data ? r.data.body_html : null; },
        async attempts(setId) { let q = sb.from('practice_attempts').select('*').order('created_at', { ascending: false }); if (setId) q = q.eq('set_id', setId); return must(await q); },
        async create(s, files) { const source_files = [...(s.source_files || []), ...(await up('sources/' + Date.now(), files))]; const r = must(await sb.from('practice_sets').insert({ ...s, source_files }).select('id').single()); return { source_files, id: r.id }; },
        async upload(folder, files) { return up(folder + '/' + Date.now(), files); },
        async addGiven(set_id, given_text, given_files) { must(await sb.from('practice_answers').insert({ set_id, given_text, given_files })); },
        async given(id) { const r = await sb.from('practice_answers').select('given_text,given_files').eq('set_id', id).maybeSingle(); return r.data || null; },
        async update(id, patch) { must(await sb.from('practice_sets').update(patch).eq('id', id)); },
        async remove(id) { must(await sb.from('practice_sets').delete().eq('id', id)); },
        async addAttempt(a, files) { const paths = await up('work/' + a.set_id + '/' + Date.now(), files); must(await sb.from('practice_attempts').insert({ ...a, files: paths })); },
        async mark(id, m) { must(await sb.from('practice_attempts').update({ ...m, marked_at: new Date().toISOString() }).eq('id', id)); },
        async fileUrl(path) { return must(await sb.storage.from('practice').createSignedUrl(path, 3600)).signedUrl; },
      };
    }
    function demoApi() {
      const KEY = 'gcse-v2-practice-demo';
      const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
      const seed = () => ({
        sets: [
          { id: 'ps1', student_id: 'hadi', created_by: 'usman', subject: 'Mathematics', kind: 'quiz', title: 'Fractions of amounts', source_text: 'Worksheet: fractions of amounts', source_files: [], note: '', due_date: null, minutes: 15, based_on: null, status: 'assigned', reply: 'Made from your worksheet: 4 quick questions.', created_at: ago(2), updated_at: ago(2),
            body_html: '<h2>Fractions of amounts</h2><p>To find a fraction of an amount, <b>divide by the bottom</b>, then <b>times by the top</b>.</p><p>Example: ¾ of 20 → 20 ÷ 4 = 5 → 5 × 3 = <b>15</b>.</p>',
            quiz: [{ type: 'num', q: 'Find ½ of 18.', answer: 9 }, { type: 'num', q: 'Find ¼ of 24.', answer: 6 }, { type: 'num', q: 'Find ¾ of 40.', answer: 30, explain: '40 ÷ 4 = 10, 10 × 3 = 30.' }, { type: 'mc', q: 'Which is bigger: ⅓ of 30 or ¼ of 36?', options: ['⅓ of 30', '¼ of 36', 'They are the same'], answer: 0, explain: '10 and 9.' }] },
          { id: 'ps2', student_id: 'hadi', created_by: 'usman', subject: 'English Language', kind: 'practice', title: 'Persuasive letter practice', source_text: 'Past paper 2 Q5 style task', source_files: [], note: 'Foundation level, one task', due_date: null, minutes: 45, based_on: null, status: 'draft', reply: 'One writing task with a planning box. Check the mark scheme, then assign it.', created_at: ago(1), updated_at: ago(1),
            body_html: '<h2>Persuasive letter</h2><p>Your local council wants to close the youth club. Write a letter to the council arguing that it should stay open.</p><p><i>(24 marks for content and organisation, 16 marks for technical accuracy)</i></p>', quiz: [] },
          { id: 'ps3', student_id: 'hadi', created_by: 'usman', subject: 'Chemistry', kind: 'mock', title: '', source_text: '', source_files: ['usman/sources/1/1-paper1.pdf'], note: 'Topics 1 to 3 only', due_date: null, minutes: 60, based_on: null, status: 'requested', reply: '', created_at: ago(0), updated_at: ago(0), body_html: '', quiz: [] },
        ],
        answers: { ps1: '<p>1. 9  2. 6  3. 30  4. ⅓ of 30 (10 vs 9)</p>', ps2: '<h3>Mark scheme</h3><p>Content and organisation (24): clear viewpoint, letter conventions, paragraphs, persuasive techniques.</p><p>Technical accuracy (16): full stops, varied sentences, spelling.</p>' },
        attempts: [],
      });
      let S; try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; } S = S || seed();
      const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* blocked */ } };
      const visible = (s) => canEdit(s.student_id) || (s.student_id === me().id && ['assigned', 'archived'].includes(s.status));
      const staffOfSet = (id) => { const s = S.sets.find((x) => x.id === id); return s && isStaffFor(s.student_id); };
      return {
        reset() { S = seed(); save(); },
        async sets() { return S.sets.filter(visible); },
        async set(id) { const s = S.sets.find((x) => x.id === id); return s && visible(s) ? s : null; },
        async answers(id) { return staffOfSet(id) ? S.answers[id] || null : null; },
        async attempts(setId) { return S.attempts.filter((a) => (!setId || a.set_id === setId) && (a.student_id === me().id || isStaffFor(a.student_id))); },
        async create(s, files) { if (!canEdit(s.student_id)) throw new Error('You can only make practice for your own students.');
          S.sets.unshift({ ...s, id: 'ps' + Date.now() + Math.floor(Math.random() * 1e3), created_by: me().id, status: 'requested', body_html: '', quiz: [], reply: '', source_files: [...(s.source_files || []), ...files.map((f) => `${me().id}/sources/${f.name}`)], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); save(); return { source_files: S.sets[0].source_files, id: S.sets[0].id }; },
        async upload(folder, files) { return files.map((f) => `${me().id}/${folder}/${f.name}`); },
        async addGiven(id, given_text, given_files) { if (!S.sets.some((x) => x.id === id && x.created_by === me().id)) throw new Error('Not allowed.'); S.given = S.given || {}; S.given[id] = { given_text, given_files }; save(); },
        async given(id) { return staffOfSet(id) ? (S.given || {})[id] || null : null; },
        async update(id, patch) { const s = S.sets.find((x) => x.id === id); if (!s || !canEdit(s.student_id)) throw new Error('You can only change your own students\' practice.');
          if (patch.status === 'assigned' && !s.body_html) throw new Error('This set is not ready yet.'); Object.assign(s, patch, { updated_at: new Date().toISOString() }); save(); },
        async remove(id) { S.sets = S.sets.filter((x) => x.id !== id); save(); },
        async addAttempt(a, files) { const s = S.sets.find((x) => x.id === a.set_id); if (!s || s.student_id !== me().id || s.status !== 'assigned') throw new Error('This practice set is not open for answers.');
          S.attempts.unshift({ ...a, id: 'pa' + Date.now(), student_id: me().id, files: files.map((f) => `${me().id}/work/${f.name}`), mark: null, mark_max: null, feedback: null, created_at: new Date().toISOString() }); save(); },
        async mark(id, m) { S.attempts.forEach((x) => { if (x.id === id && isStaffFor(x.student_id)) Object.assign(x, m); }); save(); },
        async fileUrl() { throw new Error('Files are not stored in the preview.'); },
        demoInsert(set, ansHtml) { const id = 'ps' + Date.now() + Math.floor(Math.random() * 1e3);
          S.sets.unshift({ source_text: '', source_files: [], note: '', based_on: null, quiz: [], created_by: me().id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...set, id }); S.answers[id] = ansHtml; save(); return id; },
      };
    }

    // ---------- shared bits ----------
    const kindName = (k) => (KINDS[k] || [k])[0];
    const titleOf = (s) => s.title || `${s.subject} ${kindName(s.kind).toLowerCase()}`;
    const pill = (s) => `<span class="pill ${STATUS[s.status][1]}">${STATUS[s.status][0]}</span>`;
    const when = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const bestOf = (atts) => atts.filter((a) => a.mark != null || a.quiz_max).map((a) => (a.mark != null ? [a.mark, a.mark_max] : [a.quiz_score, a.quiz_max]))[0];
    let counts = { draft: 0, todo: 0 };
    async function refreshCounts() {
      try { const sets = await api.sets(); const m = me();
        const atts = m.role === 'student' ? await api.attempts() : [];
        counts = { draft: sets.filter((s) => s.status === 'draft' && isStaffFor(s.student_id)).length,
          todo: sets.filter((s) => s.status === 'assigned' && s.student_id === m.id && !atts.some((a) => a.set_id === s.id)).length };
      } catch (e) { counts = { draft: 0, todo: 0 }; }
    }
    function nav() {
      const m = me(); if (!m || !m.role) return [];
      if (m.role === 'student') return [['practice', `Practice${counts.todo ? ` <span class="count">${counts.todo}</span>` : ''}`]];
      return myStudents().length ? [['practice', `Practice${counts.draft ? ` <span class="count">${counts.draft}</span>` : ''}`]] : [];
    }
    function setCard(s, atts, opts = {}) {
      const mine = atts.filter((a) => a.set_id === s.id); const b = bestOf(mine);
      return `<a class="pset-card" href="#pset-${esc(s.id)}"><span class="stripe kind-${esc(s.kind)}"></span><span class="lc-body"><span class="subj">${esc(s.subject)} · ${kindName(s.kind)}${opts.who ? ` · for ${esc(first(ctx.person(s.student_id)))}` : ''}</span>
        <span class="lc-title">${esc(titleOf(s))}</span><span class="muted small">${s.minutes ? `About ${s.minutes} min · ` : ''}${mine.length ? `${mine.length} ${mine.length === 1 ? 'try' : 'tries'}${b ? ` · latest ${b[0]}/${b[1]}` : ''}` : opts.student ? 'Not started' : `Asked ${new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}${s.due_date ? ` · due ${fmt(s.due_date, { day: 'numeric', month: 'short' })}` : ''}</span></span>
        ${opts.student ? (mine.length ? '<span class="pill done">Done</span>' : '<span class="pill todo">To do</span>') : pill(s)}</a>`;
    }
    const sqlPanel = (x) => `<section class="panel"><p class="msg err">${esc(nice(x))}</p></section>`;

    // ---------- pages ----------
    async function listPage() {
      const m = me();
      if (m.role !== 'student') { const st = myStudents(); if (st.length === 1) return managePage(st[0].id);
        let sets = []; try { sets = await api.sets(); } catch (x) { return shell('practice', page(`<div class="page-head"><h1>Practice</h1></div>${sqlPanel(x)}`)); }
        return shell('practice', page(`<div class="narrow"><div class="page-head"><p class="kicker dark">Practice</p><h1>Choose a student</h1></div>
          <section class="panel">${st.map((p) => { const mine = sets.filter((s) => s.student_id === p.id); const ready = mine.filter((s) => s.status === 'draft').length;
            return `<a class="pset-card" href="#practice-${esc(p.id)}"><span class="stripe"></span><span class="lc-body"><span class="lc-title">${esc(p.full_name)}</span><span class="muted small">${mine.length} practice set${mine.length === 1 ? '' : 's'}</span></span>${ready ? `<span class="pill draft">${ready} ready to check</span>` : ''}</a>`; }).join('') || '<p class="muted">No students yet.</p>'}</section></div>`)); }
      // Student
      let sets; let atts; try { [sets, atts] = await Promise.all([api.sets(), api.attempts()]); } catch (x) { return shell('practice', page(`<div class="page-head"><h1>Practice</h1></div>${sqlPanel(x)}`)); }
      const own = canEdit(m.id);
      const open = sets.filter((s) => s.status === 'assigned'); const todo = open.filter((s) => !atts.some((a) => a.set_id === s.id)); const done = open.filter((s) => atts.some((a) => a.set_id === s.id));
      const setter = (s) => (s.created_by === m.id ? '' : ` <span class="muted small">Set by ${esc(first(ctx.person(s.created_by)))}</span>`);
      shell('practice', page(`<div class="narrow"><div class="page-head"><p class="kicker dark">Practice</p><h1>Extra practice</h1>
        <p class="muted">${own ? 'Make your own lessons, quizzes, practice questions or mock exams from your notes or worksheets.' : 'Practice your parent or teacher has set for you. You can try each one as many times as you like.'}</p>${own ? `<a class="btn primary" href="#pnew-${esc(m.id)}">New practice set</a>` : ''}</div>
        <section class="panel"><h2>To do${todo.length ? ` <span class="count">${todo.length}</span>` : ''}</h2>${todo.map((s) => setCard(s, atts, { student: true }) + setter(s)).join('') || '<p class="muted">Nothing to do right now.</p>'}</section>
        ${done.length ? `<section class="panel"><h2>Done</h2><p class="muted small">Open one to see your feedback, or have another go.</p>${done.map((s) => setCard(s, atts, { student: true })).join('')}</section>` : ''}
        ${own ? requestsBlock(sets.filter((s) => s.student_id === m.id && ['requested', 'draft'].includes(s.status)), atts) : ''}</div>`));
    }
    function requestsBlock(list, atts) {
      if (!list.length) return '';
      return `<section class="panel"><h2>Being made for you</h2><p class="muted small">Ninegrade prepares new sets every weekday evening (about 5:40 PM). Check a "Ready to check" set, then assign it.</p>${list.map((s) => setCard(s, atts)).join('')}</section>`;
    }
    async function managePage(sid) {
      if (!canEdit(sid)) return shell('practice', page(`<div class="narrow"><div class="page-head"><a class="small" href="#practice">← Practice</a><h1>Practice</h1></div>${ctx.setByNote(sid)}</div>`));
      const st = ctx.person(sid); const self = sid === me().id;
      let sets; let atts; try { [sets, atts] = await Promise.all([api.sets(), api.attempts()]); } catch (x) { return shell('practice', page(`<div class="page-head"><h1>Practice</h1></div>${sqlPanel(x)}`)); }
      sets = sets.filter((s) => s.student_id === sid);
      const group = (status) => sets.filter((s) => s.status === status);
      const sec = (status, title, help) => { const l = group(status); return l.length ? `<section class="panel"><h2>${title} <span class="count">${l.length}</span></h2>${help ? `<p class="muted small">${help}</p>` : ''}${l.map((s) => setCard(s, atts)).join('')}</section>` : ''; };
      shell('practice', page(`<div class="narrow"><div class="page-head">${myStudents().length > 1 ? '<a class="small" href="#practice">← All students</a>' : ''}<p class="kicker dark">Practice</p><h1>${self ? 'My practice sets' : `Practice for ${esc(first(st))}`}</h1>
        <p class="muted">Paste text or upload a worksheet, notes or a past paper, and choose what to make from it. Ninegrade prepares it at the evening run (weekdays, about 5:40 PM). You check it, then assign it.</p>
        <div class="row"><a class="btn primary" href="#pnew-${esc(sid)}">New practice set</a>${self ? '' : '<a class="btn ghost" href="#bank">From the question bank</a>'}</div></div><div id="flash"></div>
        ${sec('draft', 'Ready for you to check', `Open each one, read it with its answer sheet, then press Assign to send it to ${self ? 'yourself' : esc(first(st))}.`)}
        ${sec('requested', 'Being prepared', 'Ninegrade makes these at the next evening run.')}
        ${sec('assigned', self ? 'Assigned' : `Assigned to ${esc(first(st))}`, '')}
        ${group('archived').length ? `<details class="panel"><summary><b>Archived</b> (${group('archived').length})</summary>${group('archived').map((s) => setCard(s, atts)).join('')}</details>` : ''}
        ${!sets.length ? `<section class="panel"><div class="empty"><b>No practice sets yet</b><span>Make the first one from a worksheet, notes, or a topic ${self ? 'you want' : `${esc(first(st))} needs`} to practise.</span><a class="btn primary sm" href="#pnew-${esc(sid)}">New practice set</a></div></section>` : ''}</div>`));
      if (ctx.flashText) { const f = document.getElementById('flash'); f.innerHTML = `<p class="msg ok">${esc(ctx.flashText)}</p>`; ctx.flashText = null; }
    }
    async function newPage(sid, like) {
      if (!canEdit(sid)) return managePage(sid);
      const st = ctx.person(sid); const self = sid === me().id;
      const subjects = [...new Set(D().courses.filter((c) => c.student_id === sid).map((c) => c.subject))];
      const k0 = like ? like.kind : 'quiz';
      shell('practice', page(`<div class="narrow"><div class="page-head"><a class="small" href="#${like ? 'pset-' + esc(like.id) : 'practice-' + esc(sid)}">← ${like ? 'Back to the set' : 'Practice'}</a><p class="kicker dark">${self ? 'For you' : `For ${esc(first(st))}`}</p><h1>${like ? 'Make another like this' : 'New practice set'}</h1>
        ${like ? `<p class="muted">Ninegrade makes a fresh version of <b>${esc(titleOf(like))}</b> with new questions, from the same material. Say if you want anything different.</p>` : ''}</div>
        ${!like && !self && ctx.bankPapers ? `<section class="panel" id="p-bank"><h2>From my question bank</h2><p class="muted small">Already added a paper to your question bank? Make practice, a mock, a quiz or a lesson from it without uploading again.</p><div id="p-bank-list"><p class="muted small">Loading…</p></div></section>
          <h2 class="or-head">Or upload or paste something new</h2>` : ''}
        <form id="pform" class="form panel">
          <fieldset class="kind-pick"><legend>What would you like? <small>Tick one or more. Each one becomes its own set from the same material.</small></legend>${Object.entries(KINDS).map(([k, [t, d]]) => `<label class="kind-opt"><input type="checkbox" name="kind" value="${k}" ${k === k0 ? 'checked' : ''}><b>${t}</b><span>${d}</span></label>`).join('')}</fieldset>
          ${(() => { const cur = like ? like.subject : subjects[0] || ''; const list = cur && !subjects.includes(cur) ? [...subjects, cur] : subjects;
            return list.length ? `<label for="p-subj-pick">Subject<select id="p-subj-pick">${list.map((x) => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('')}<option value="__other">Another subject…</option></select><small>Starting a new subject? <a href="#plan-for-${esc(sid)}">Add a course</a> to give it a full plan and weekly lessons.</small></label>
            <label for="p-subj" id="p-subj-wrap" hidden>Which subject?<input id="p-subj" maxlength="60" value="${esc(cur)}" autocomplete="off"></label>`
              : `<label for="p-subj">Subject<input id="p-subj" required maxlength="60" autocomplete="off" placeholder="e.g. Mathematics"></label>`; })()}
          <label for="p-title">Title <small>optional, e.g. Fractions of amounts</small><input id="p-title" maxlength="120" value="${esc(like ? (like.title ? like.title.replace(/ \(version \d+\)$/, '') + ' (version 2)' : '') : '')}"></label>
          ${like ? '' : `<label for="p-text">Paste text <small>a worksheet, notes, questions or a topic list</small><textarea id="p-text" rows="8" maxlength="50000" placeholder="Paste here, or upload files below"></textarea></label>
          <label for="p-files">Or upload files <small>photos, PDF, Word or text files, up to 10 files of 15 MB each</small><input id="p-files" type="file" multiple accept="image/*,application/pdf,.doc,.docx,.txt,.rtf,.odt"></label>`}
          ${like ? '' : `<fieldset class="kind-pick fit-pick"><legend>Questions</legend>
            <label class="kind-opt"><input type="radio" name="qmode" value="asis" checked> <b>Use my questions exactly as they are</b><span>Ninegrade keeps every question word for word and only sets it out for the site.</span></label>
            <label class="kind-opt"><input type="radio" name="qmode" value="new"> <b>Write similar new questions</b><span>Same topics, level and length, with new questions. Good for extra practice.</span></label></fieldset>
          <details class="panel ans-give"${self ? '' : ' open'}><summary><b>Your answer sheet or mark scheme</b> <small class="muted">optional${self ? '' : `, ${esc(first(st))} never sees it`}</small></summary>
            <p class="muted small">If you have the answers, add them here. Ninegrade marks with your answers and only fills in any question they don't cover.</p>
            <label for="p-ans">Paste answers<textarea id="p-ans" rows="4" maxlength="50000" placeholder="e.g. 1. 12  2. 35  3. (a) 4 marks: ..."></textarea></label>
            <label for="p-ans-files">Or upload them <small>photos, PDF or Word, up to 10 files</small><input id="p-ans-files" type="file" multiple accept="image/*,application/pdf,.doc,.docx,.txt,.rtf,.odt"></label></details>`}
          <label for="p-note">${like ? 'Anything to change?' : 'Instructions'} <small>optional</small><textarea id="p-note" rows="3" maxlength="1000" placeholder="${like ? 'e.g. A bit harder, and more questions on Q3 type' : 'e.g. Foundation tier, 10 questions, focus on the questions he got wrong'}"></textarea></label>
          <div class="row form-row"><label for="p-min">Time to spend <small>minutes, optional</small><input id="p-min" type="number" min="5" max="240" step="5" value="${like && like.minutes ? like.minutes : ''}"></label>
            <label for="p-due">Due date <small>optional</small><input id="p-due" type="date" min="${ctx.today()}"></label></div>
          <fieldset class="kind-pick fit-pick"><legend>How does it fit with the weekly lessons?</legend>
            <label class="kind-opt"><input type="radio" name="fit" value="extra" checked> <b>On top of this week's lessons</b><span>Extra practice. The weekly lessons stay the same.</span></label>
            <label class="kind-opt"><input type="radio" name="fit" value="instead"> <b>Instead of some of this week's lessons</b><span>The next weekly plan has fewer lessons in this subject, by about the time set above, so the week doesn't get longer.</span></label></fieldset>
          <div id="p-msg"></div><button class="btn primary lg" id="p-go">Send</button>
          <p class="muted small">It will be ready to check after the next evening run (weekdays, about 5:40 PM). ${self ? '' : `${esc(first(st))} won't see it until you assign it.`} Uploads stay private.</p></form></div>`));
      const pb = document.getElementById('p-bank-list');
      if (pb) ctx.bankPapers(sid).then((ps) => { ps = (ps || []).filter((x) => x.status !== 'failed');
        pb.innerHTML = ps.length ? `<div class="row form-row"><label for="p-bank-pick" class="grow">Paper<select id="p-bank-pick">${ps.map((x) => `<option value="${esc(x.id)}">${esc(x.title)} · ${esc(x.subject)}${x.collection === 'ninegrade' ? ' · Ninegrade bank' : ''}${x.status === 'processing' ? ' (being added)' : ''}</option>`).join('')}</select></label><button type="button" class="btn primary" id="p-bank-go">Choose questions</button></div>`
          : `<p class="muted">Nothing in your question bank yet. <a href="#bank-add">Add a paper</a> (questions and answers) once, then make practice from it any time.</p>`;
        const go = document.getElementById('p-bank-go'); if (go) go.onclick = () => { window.ngBankFor = sid; location.hash = '#bank-' + document.getElementById('p-bank-pick').value; };
      }).catch(() => { pb.innerHTML = '<p class="muted small">The question bank isn\'t available yet.</p>'; });
      const pick = document.getElementById('p-subj-pick');
      if (pick) pick.onchange = () => { const other = pick.value === '__other'; const w = document.getElementById('p-subj-wrap'); const i = document.getElementById('p-subj');
        w.hidden = !other; i.required = other; i.value = other ? '' : pick.value; if (other) i.focus(); };
      document.getElementById('pform').onsubmit = async (e) => {
        e.preventDefault(); const msg = document.getElementById('p-msg'); const b = document.getElementById('p-go');
        const v = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
        const files = like ? [] : [...document.getElementById('p-files').files];
        const text = v('p-text'); const note = v('p-note');
        const kinds = [...document.querySelectorAll('input[name=kind]:checked')].map((x) => x.value);
        if (!kinds.length) { msg.innerHTML = '<p class="msg err">Tick at least one: Lesson, Quiz, Practice questions or Mock exam.</p>'; return; }
        if (!like && !text && !files.length && note.length < 15) { msg.innerHTML = '<p class="msg err">Paste some text, upload a file, or describe the topic in the instructions.</p>'; return; }
        const af = like ? [] : [...document.getElementById('p-ans-files').files];
        if (af.length > 10 || af.some((f) => f.size > 15 * 1024 * 1024)) { msg.innerHTML = '<p class="msg err">Answer files: up to 10 files of 15 MB each.</p>'; return; }
        if (files.length > 10) { msg.innerHTML = '<p class="msg err">Please upload 10 files or fewer.</p>'; return; }
        const big = files.find((f) => f.size > 15 * 1024 * 1024); if (big) { msg.innerHTML = `<p class="msg err">${esc(big.name)} is over 15 MB. Try a smaller photo or split the PDF.</p>`; return; }
        b.disabled = true; b.textContent = files.length ? 'Uploading…' : 'Sending…';
        try {
          let src = like ? like.source_files || [] : []; let up = files;
          const mins = v('p-min') ? Number(v('p-min')) : null;
          const instead = (document.querySelector('input[name=fit]:checked') || {}).value === 'instead';
          const asIs = !like && (document.querySelector('input[name=qmode]:checked') || {}).value === 'asis';
          const ansText = v('p-ans'); const ansFiles = like ? [] : [...document.getElementById('p-ans-files').files];
          let ansPaths = null;
          for (const kind of kinds) {
            const made = await api.create({ student_id: sid, subject: v('p-subj'), kind, title: v('p-title'), source_text: like ? like.source_text || '' : text, source_files: src, note,
              minutes: kinds.length > 1 && kind === 'quiz' ? null : mins, due_date: v('p-due') || null, based_on: like ? like.id : null, ...(instead ? { replaces_lessons: true } : {}), ...(asIs ? { as_is: true } : {}) }, up);
            src = made.source_files;
            if (ansText || ansFiles.length) { if (!ansPaths) ansPaths = await api.upload('answers', ansFiles); await api.addGiven(made.id, ansText, ansPaths); }
            up = []; // files are uploaded once and shared by every set made from them
          }
          ctx.flashText = kinds.length > 1 ? `Sent ${kinds.length} requests (${kinds.map(kindName).join(', ')}). Ninegrade will prepare them at the next evening run, and they will appear under "Ready for you to check".` : 'Sent. Ninegrade will prepare it at the next evening run, and it will appear under "Ready for you to check".';
          await refreshCounts(); location.hash = '#practice-' + sid;
        } catch (x) { b.disabled = false; b.textContent = 'Send'; msg.innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; }
      };
    }

    function quizHtml(q) {
      return `<div class="quiz" id="pquiz"><div class="panel-head"><h3>Quick questions</h3><span class="muted small">These mark themselves when you send</span></div>
        <ol>${q.map((x, i) => `<li><div class="q">${esc(x.q)}</div>${x.type === 'mc' ? `<div class="opts" role="radiogroup">${x.options.map((o, j) => `<label><input type="radio" name="pq${i}" value="${j}"> <span>${esc(o)}</span></label>`).join('')}</div>`
          : `<input type="text" inputmode="${x.type === 'num' ? 'decimal' : 'text'}" id="pq${i}" autocomplete="off" aria-label="Your answer">`}<div class="fb" id="pfb${i}" aria-live="polite"></div></li>`).join('')}</ol></div>`;
    }
    function markQuiz(quiz, root, show) {
      let score = 0;
      const answers = quiz.map((q, i) => {
        let given; let right;
        if (q.type === 'mc') { const c = root.querySelector(`input[name=pq${i}]:checked`); given = c ? Number(c.value) : null; right = given === q.answer; }
        else if (q.type === 'num') { given = root.querySelector(`#pq${i}`).value.trim(); const n = parseFloat(given.replace(/,/g, '').replace('−', '-').replace(/[^0-9.\-]/g, '')); right = !Number.isNaN(n) && Math.abs(n - q.answer) <= (q.tol || 1e-9); }
        else { given = root.querySelector(`#pq${i}`).value.trim(); right = (q.accept || []).some((a) => norm(a) === norm(given)); }
        if (right) score++;
        if (show) { const correct = q.type === 'mc' ? q.options[q.answer] : q.type === 'num' ? q.answer : (q.accept || [])[0];
          const fb = root.querySelector(`#pfb${i}`); fb.className = 'fb ' + (right ? 'right' : 'wrong');
          fb.innerHTML = right ? `✓ Correct${q.explain ? ` <span class="why">${esc(q.explain)}</span>` : ''}` : `✗ The answer is ${esc(correct)}.${q.explain ? ` <span class="why">${esc(q.explain)}</span>` : ''}`; }
        return { given, right };
      });
      return { score, max: quiz.length, answers };
    }
    const quizKey = (q) => q.map((x) => (x.type === 'mc' ? x.options[x.answer] : x.type === 'num' ? x.answer : (x.accept || [])[0]));
    function attemptHtml(a, s, staff) {
      const who = staff ? first(ctx.person(a.student_id)) : 'You';
      return `<div class="sub"><div class="panel-head"><span class="muted small">${esc(who)} sent this ${when(a.created_at)}${a.minutes_taken != null ? ` · took ${a.minutes_taken} min` : ''}</span>
        ${a.mark != null ? `<span class="pill done">${a.mark} / ${a.mark_max}</span>` : a.quiz_max && s.kind === 'quiz' ? `<span class="pill done">${a.quiz_score} / ${a.quiz_max}</span>` : '<span class="pill sent">Waiting for marking</span>'}</div>
        ${a.quiz_max ? `<p class="small">Quick questions: <b>${a.quiz_score} / ${a.quiz_max}</b>${(s.quiz || []).length ? ` · ${(a.quiz_answers || []).map((x, i) => `${i + 1}${x.right ? '✓' : '✗'}`).join(' ')}` : ''}</p>` : ''}
        ${a.answer_text ? `<b class="small">${staff ? `${esc(who)}'s answer` : 'Your answer'}</b><div class="answer-text">${esc(a.answer_text)}</div>` : ''}
        ${(a.files || []).length ? `<div class="thumbs">${a.files.map((f) => `<a data-pfile="${esc(f)}" target="_blank" rel="noopener"><span class="file">Photo</span></a>`).join('')}</div>` : ''}
        ${a.feedback ? `<div class="feedback"><b>Feedback</b>\n${esc(a.feedback)}</div>` : ''}
        ${staff && s.kind !== 'quiz' ? `<form class="mark-form" data-pmark="${esc(a.id)}"><label>Mark<input type="number" min="0" value="${a.mark ?? ''}" required class="pm"></label><label>Out of<input type="number" min="1" value="${a.mark_max ?? ''}" required class="pmm"></label>
          <label class="grow">Feedback for ${esc(who)}<textarea rows="3" class="pfb">${esc(a.feedback || '')}</textarea></label><button class="btn primary" type="submit">Save mark</button></form>` : ''}</div>`;
    }
    async function fileLinks() {
      for (const a of app.querySelectorAll('[data-pfile]')) {
        try { const url = await api.fileUrl(a.dataset.pfile); a.href = url; a.innerHTML = /\.(jpe?g|png|webp|gif|heic)$/i.test(a.dataset.pfile) ? `<img src="${esc(url)}" alt="Uploaded file">` : `<span class="file">${esc(a.dataset.pfile.split('/').pop())}</span>`; }
        catch (e) { a.innerHTML = `<span class="file">${esc(a.dataset.pfile.split('/').pop())}</span>`; a.removeAttribute('href'); }
      }
    }

    async function setPage(id) {
      let s; let atts; try { s = await api.set(id); atts = s ? await api.attempts(id) : []; } catch (x) { return shell('practice', page(`<div class="page-head"><h1>Practice</h1></div>${sqlPanel(x)}`)); }
      if (!s) return shell('practice', page('<section class="panel"><h1>Not found</h1><p class="muted">This practice set doesn\'t exist, or it isn\'t shared with you yet.</p><a class="btn ghost" href="#practice">Back to practice</a></section>'));
      const staff = canEdit(s.student_id) && (isStaffFor(s.student_id) || s.student_id === me().id);
      const isStudent = s.student_id === me().id;
      const st = ctx.person(s.student_id); const nm = isStudent ? 'you' : first(st);
      const head = `<div class="page-head"><a class="small" href="#${staff && !isStudent ? 'practice-' + esc(s.student_id) : 'practice'}">← Practice</a>
        <p class="kicker dark">${esc(s.subject)} · ${kindName(s.kind)}${s.minutes ? ` · about ${s.minutes} minutes` : ''}</p><h1>${esc(titleOf(s))}</h1>
        <div class="row">${staff ? pill(s) : ''}${s.due_date ? `<span class="pill todo">Due ${fmt(s.due_date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>` : ''}${s.created_by !== me().id ? `<span class="muted small">Set by ${esc(first(ctx.person(s.created_by)))}</span>` : ''}</div></div>`;
      // ----- staff (or self-study student managing their own set) -----
      if (staff && (s.status !== 'assigned' || !isStudent)) {
        const actions = {
          requested: `<p>Ninegrade will make this at the next evening run (weekdays, about 5:40 PM).</p>${s.note ? `<p class="small"><b>Your instructions:</b> ${esc(s.note)}</p>` : ''}<div class="row"><button class="btn ghost sm" data-pact="delete">Cancel this request</button></div>`,
          draft: `<p>Read it below${isStudent ? '' : ' with the answer sheet'}. If it looks right, assign it. If not, say what to change.</p>
            <div class="row"><button class="btn primary" data-pact="assign">Assign to ${esc(nm)}</button><button class="btn ghost" data-pact="changes">Ask for changes</button><button class="btn ghost sm" data-pact="delete">Delete</button></div>`,
          assigned: `<p>${esc(isStudent ? 'You can' : first(st) + ' can')} see this now and try it as many times as needed.</p><div class="row"><a class="btn primary sm" href="#plike-${esc(s.id)}">Make another like this</a><button class="btn ghost sm" data-pact="unassign">Take it back</button><button class="btn ghost sm" data-pact="archive">Archive</button></div>`,
          archived: `<div class="row"><button class="btn ghost sm" data-pact="assign">Assign again</button><a class="btn ghost sm" href="#plike-${esc(s.id)}">Make another like this</a></div>`,
        }[s.status];
        const srcFiles = (s.source_files || []).length ? `<div class="thumbs">${s.source_files.map((f) => `<a data-pfile="${esc(f)}" target="_blank" rel="noopener"><span class="file">${esc(f.split('/').pop())}</span></a>`).join('')}</div>` : '';
        shell('practice', page(`<div class="narrow">${head}
          <section class="panel status-${esc(s.status)}"><h2>${STATUS[s.status][0]}</h2>${s.reply ? `<p class="msg info">${esc(s.reply)}</p>` : ''}${actions}<div id="pact-out"></div></section>
          ${s.body_html || (s.quiz || []).length ? `<section class="panel"><h2>What ${esc(nm)} will see</h2><div class="lesson">${s.body_html}</div>
            ${(s.quiz || []).length ? `<h3>Quick questions (mark themselves)</h3><ol class="small">${s.quiz.map((q, i) => `<li>${esc(q.q)} <b class="ok-text">→ ${esc(quizKey(s.quiz)[i])}</b></li>`).join('')}</ol>` : ''}</section>` : ''}
          ${!isStudent && s.status !== 'requested' ? `<details class="panel" id="pans"><summary><b>Answer sheet</b> <span class="muted small">(${esc(first(st))} never sees this)</span></summary><div class="lesson answers"><p class="muted">Loading…</p></div></details>` : ''}
          ${!isStudent && atts.length ? `<section class="panel"><h2>${esc(first(st))}'s tries <span class="count">${atts.length}</span></h2><p class="muted small">Ninegrade marks written answers at the evening run. You can also mark or change anything here.</p>${atts.map((a) => attemptHtml(a, s, true)).join('')}</section>` : ''}
          <details class="panel"><summary><b>What it was made from</b></summary>${s.source_text ? `<div class="answer-text">${esc(s.source_text.slice(0, 3000))}${s.source_text.length > 3000 ? '…' : ''}</div>` : ''}${srcFiles}${s.note ? `<p class="small"><b>Instructions:</b> ${esc(s.note)}</p>` : ''}${s.based_on ? '' : `<p class="small"><b>Questions:</b> ${s.as_is ? 'used exactly as given' : 'similar new questions'}</p>`}${isStudent ? '' : '<div id="pgiven" class="small"></div>'}<p class="small"><b>Weekly lessons:</b> ${s.replaces_lessons ? `instead of some ${esc(s.subject)} lessons` : 'on top of them'}</p>${!s.source_text && !srcFiles && !s.note ? '<p class="muted small">Nothing was given.</p>' : ''}${s.based_on ? `<p class="small"><a href="#pset-${esc(s.based_on)}">See the earlier version</a></p>` : ''}</details></div>`));
        const out = document.getElementById('pact-out');
        const go = async (patch, msg, after) => { try { await api.update(s.id, patch); await refreshCounts(); if (msg) ctx.flashText = msg; after ? after() : setPage(s.id); } catch (x) { out.innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } };
        app.querySelectorAll('[data-pact]').forEach((b) => { b.onclick = async () => {
          const a = b.dataset.pact;
          if (a === 'assign') { b.disabled = true; return go({ status: 'assigned' }, null); }
          if (a === 'unassign') return go({ status: 'draft' });
          if (a === 'archive') return go({ status: 'archived' });
          if (a === 'delete') { b.disabled = true; try { await api.remove(s.id); ctx.flashText = 'Deleted.'; location.hash = '#practice-' + s.student_id; } catch (x) { out.innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } return; }
          if (a === 'changes') { out.innerHTML = `<form class="form" id="pchg"><label for="pchg-t">What should change?<textarea id="pchg-t" rows="3" maxlength="900" required placeholder="e.g. Make questions 3 to 5 easier, and add a worked example"></textarea></label><button class="btn primary sm">Send</button></form>`;
            document.getElementById('pchg-t').focus();
            document.getElementById('pchg').onsubmit = (e) => { e.preventDefault(); const t = 'Changes: ' + document.getElementById('pchg-t').value.trim(); const n = (s.note ? s.note + '\n' : '') + t; go({ status: 'requested', note: n.length > 1000 ? t.slice(0, 1000) : n }, 'Sent. Ninegrade will make the changes at the next evening run.'); }; }
        }; });
        const gv = document.getElementById('pgiven');
        if (gv) api.given(s.id).then((g) => { if (!g || (!g.given_text && !(g.given_files || []).length)) return;
          gv.innerHTML = `<p><b>Your answer sheet</b> (Ninegrade marks with it; ${esc(first(st))} never sees it):</p>${g.given_text ? `<div class="answer-text">${esc(g.given_text.slice(0, 3000))}</div>` : ''}${(g.given_files || []).length ? `<div class="thumbs">${g.given_files.map((f) => `<a data-pfile="${esc(f)}" target="_blank" rel="noopener"><span class="file">${esc(f.split('/').pop())}</span></a>`).join('')}</div>` : ''}`; fileLinks(); }).catch(() => {});
        const det = document.getElementById('pans');
        if (det) det.addEventListener('toggle', async () => { if (det.open && !det.dataset.loaded) { det.dataset.loaded = 1; det.querySelector('.lesson').innerHTML = (await api.answers(s.id).catch(() => null)) || '<p class="muted">No answer sheet for this set.</p>'; } });
        app.querySelectorAll('form[data-pmark]').forEach((f) => { f.onsubmit = async (e) => { e.preventDefault(); const bt = f.querySelector('button'); bt.disabled = true; bt.textContent = 'Saving…';
          try { await api.mark(f.dataset.pmark, { mark: Number(f.querySelector('.pm').value), mark_max: Number(f.querySelector('.pmm').value), feedback: f.querySelector('.pfb').value.trim() || null }); setPage(s.id); }
          catch (x) { bt.disabled = false; bt.textContent = 'Save mark'; f.insertAdjacentHTML('afterend', `<p class="msg err">${esc(nice(x))}</p>`); } }; });
        fileLinks();
        return;
      }
      // ----- student doing the set -----
      const quiz = s.quiz || []; const written = s.kind !== 'quiz';
      const dk = `ng-pdraft:${me().id}:${s.id}`; let draft = null; try { draft = JSON.parse(localStorage.getItem(dk)); } catch (e) { draft = null; }
      shell('practice', page(`<div class="narrow">${head}
        ${staff ? `<section class="panel slim"><div class="row"><a class="btn ghost sm" href="#plike-${esc(s.id)}">Make another like this</a><button class="btn ghost sm" data-pown="draft">Take it back</button><button class="btn ghost sm" data-pown="archived">Archive</button></div></section>` : ''}
        <article class="panel lesson">${s.body_html || ''}</article>
        <section class="panel" id="psend"><h2>${atts.length ? 'Have another go' : 'Your answers'}</h2>
          ${s.minutes && s.kind === 'mock' ? `<p class="msg info">Mock exam: give yourself ${s.minutes} minutes. The timer started when you opened this page.</p>` : ''}
          <form id="pwork" class="form">${quiz.length ? quizHtml(quiz) : ''}
            ${written ? `<label for="pw-ans">Your written answers <small>number each answer, e.g. 1. …</small><textarea id="pw-ans" rows="10" maxlength="20000"></textarea></label>
            <label for="pw-photos">Photos of your written work <small>optional</small><input id="pw-photos" type="file" accept="image/*,application/pdf" multiple></label>` : ''}
            <label for="pw-min" class="narrow-field">Minutes taken<input id="pw-min" type="number" min="0" max="600"></label>
            <div id="pw-msg"></div><button class="btn primary lg" id="pw-go">${quiz.length && !written ? 'Check my answers' : 'Send'}</button></form></section>
        ${atts.length ? `<section class="panel"><h2>Your tries</h2>${atts.map((a) => attemptHtml(a, s, false)).join('')}</section>` : ''}</div>`));
      app.querySelectorAll('[data-pown]').forEach((b) => { b.onclick = async () => { try { await api.update(s.id, { status: b.dataset.pown }); location.hash = '#practice'; } catch (x) { alert(nice(x)); } }; });
      const started = Date.now(); const minEl = document.getElementById('pw-min');
      const tick = setInterval(() => { if (!document.body.contains(minEl)) return clearInterval(tick); if (!minEl.dataset.touched) minEl.value = Math.max(1, Math.round((Date.now() - started) / 6e4)); }, 15000);
      minEl.oninput = () => { minEl.dataset.touched = 1; };
      const ans = document.getElementById('pw-ans');
      const tpl = ans ? answerTemplate(app.querySelector('article.lesson')) : '';
      if (ans && tpl) ans.value = tpl;
      if (ans && draft && draft.text) ans.value = draft.text;
      if (ans) ans.oninput = () => { try { if (ans.value.trim() && ans.value !== tpl) localStorage.setItem(dk, JSON.stringify({ text: ans.value })); else localStorage.removeItem(dk); } catch (e) { /* blocked */ } };
      document.getElementById('pwork').onsubmit = async (e) => {
        e.preventDefault(); const msg = document.getElementById('pw-msg'); const b = document.getElementById('pw-go');
        const typed = ans ? ans.value.trim() : ''; const text = typed === tpl.trim() ? '' : typed; const files = document.getElementById('pw-photos') ? [...document.getElementById('pw-photos').files] : [];
        const r = quiz.length ? markQuiz(quiz, document.getElementById('pquiz'), true) : null;
        if (written && !text && !files.length && !(r && r.answers.some((x) => x.given !== null && x.given !== ''))) { msg.innerHTML = '<p class="msg err">Type your answers or add a photo first.</p>'; return; }
        if (!written && r && !r.answers.some((x) => x.given !== null && x.given !== '')) { msg.innerHTML = '<p class="msg err">Answer at least one question first.</p>'; return; }
        b.disabled = true; b.textContent = 'Sending…';
        try {
          await api.addAttempt({ set_id: s.id, answer_text: text, quiz_answers: r ? r.answers : [], quiz_score: r ? r.score : null, quiz_max: r ? r.max : null, minutes_taken: minEl.value ? Number(minEl.value) : Math.max(1, Math.round((Date.now() - started) / 6e4)) }, files);
          try { localStorage.removeItem(dk); } catch (x) { /* blocked */ }
          await refreshCounts();
          msg.innerHTML = `<p class="msg ok">${r && !written ? `You got ${r.score} out of ${r.max}. The right answers are shown above. <button type="button" class="btn ghost sm" id="pw-again">Try again</button>` : 'Sent. It will be marked at the evening run. You can have another go any time.'}</p>`;
          b.textContent = 'Sent'; if (written) setTimeout(() => setPage(s.id), 1800);
          const again = document.getElementById('pw-again'); if (again) again.onclick = () => setPage(s.id);
        } catch (x) { b.disabled = false; b.textContent = 'Send'; msg.innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; }
      };
      fileLinks();
    }

    // Pre-fill the answer box with the set's numbered questions (after "Your turn" if there is one), so the student
    // answers under each one, as on the weekly lessons.
    function answerTemplate(root) {
      if (!root) return '';
      const heads = [...root.querySelectorAll('h2')]; const turn = heads.find((h) => /your turn/i.test(h.textContent));
      const stop = /exit check|memory quiz|before you send|learn it|worked example/i;
      const short = (t) => { t = t.replace(/\s+/g, ' ').replace(/\(\d+ marks?\)/i, '').trim(); return t.length > 70 ? t.slice(0, 67).trim() + '…' : t; };
      const out = []; let on = !turn;
      root.querySelectorAll('h2, h3, p, ol > li').forEach((el) => {
        if (el.tagName === 'H2') { if (el === turn) { on = true; return; } if (stop.test(el.textContent)) { on = false; return; } if (turn && heads.indexOf(el) < heads.indexOf(turn)) return; if (on) out.push('\n' + short(el.textContent)); return; }
        if (!on || el.tagName === 'H3') return;
        if (el.tagName === 'LI') { const ol = el.parentElement; const n = Number(ol.getAttribute('start') || 1) + [...ol.children].indexOf(el); out.push(`${n}. ${short(el.textContent)}\n   Answer: `); return; }
        const f = el.firstElementChild; const lead = f && /^(B|STRONG)$/.test(f.tagName) && el.textContent.trim().startsWith(f.textContent.trim()) ? f.textContent.trim() : '';
        if (/^(Q\s*)?\d+[a-z]?[.)]?$/i.test(lead)) out.push(`${lead.replace(/[.)]$/, '')}. ${short(el.textContent.trim().slice(lead.length))}\n   Answer: `);
      });
      while (out.length && !out[out.length - 1].includes('Answer:')) out.pop();
      return out.length ? out.join('\n').replace(/^\n+/, '') + '\n' : '';
    }

    async function route(r) {
      const m = me(); if (!m || !m.role) return false;
      if (r === 'practice') { await listPage(); return true; }
      if (r.startsWith('practice-')) { await managePage(r.slice(9)); return true; }
      if (r.startsWith('pnew-')) { await newPage(r.slice(5)); return true; }
      if (r.startsWith('plike-')) { const s = await api.set(r.slice(6)).catch(() => null); if (!s) return false; await newPage(s.student_id, s); return true; }
      if (r.startsWith('pset-')) { await setPage(r.slice(5)); return true; }
      return false;
    }
    return { nav, route, refreshCounts, reset: () => api.reset && api.reset(), isStaffFor, myStudents, demoInsert: (set, ans) => api.demoInsert(set, ans), sets: () => api.sets() };
  };
})();
