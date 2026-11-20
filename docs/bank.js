/* Question bank: a parent's or teacher's paper saved once as separate questions with their answers.
   Make practice from it at any time (how many, which ones), share it with other parents or teachers by code,
   or offer it to the Ninegrade bank (the site owner or a bank manager approves; it then belongs to Ninegrade).
   The Ninegrade bank (GCSE and 11+) is owned by Ninegrade, added to by the owner and bank managers, and used by every
   family with that track switched on. Students never see the bank or the answers.
   Needs supabase/v2-bank.sql, v2-bank-upload.sql and v2-elevenplus.sql. */
(function () {
  'use strict';
  const SQL_HINT = 'The question bank needs a quick database update first. Ask the site owner to run v2-bank.sql.';
  const SHARING = {
    private: ['Private', 'Only you can use it.'],
    shared: ['Shared by code', 'People you give the code to can use it.'],
    library_pending: ['Waiting for library approval', 'The site owner will check it before it goes in the library.'],
    library: ['In the Ninegrade library', 'Every parent and teacher on Ninegrade can use it.'],
  };

  const REVIEW = { offered: ['Offered to Ninegrade', 'draft'], changes: ['Changes asked', 'missed'], declined: ['Turned down', 'todo'], pending: ['Waiting for the owner', 'draft'] };
  const ORIGIN = { own: 'Written by me', exam_board: 'Exam board past paper', publisher: 'Publisher, tutor or school', other: 'Somewhere else' };
  const KIND = { practice: ['Practice questions', 'The questions as they are, marked with feedback. Ready now.'], mock: ['Mock exam', 'Timed, exam layout, marked with feedback. Ready now.'],
    quiz: ['Quiz', 'Self-marking questions made from these. Ready after the evening run.'], lesson: ['Lesson', 'Teaches the topics, then these questions. Ready after the evening run.'] };
  window.createBank = function (ctx) {
    const { esc, shell, page, app } = ctx; const practice = ctx.practice;
    const me = () => ctx.me();
    const nice = (x) => { const m = String((x && x.message) || x); return /does not exist|schema cache|could not find the (function|table)/i.test(m) ? SQL_HINT : m; };
    const isUser = () => { const m = me(); return !!(m && m.role && (m.role !== 'student' || m.is_platform_admin)); };
    const admin = () => !!(me() && me().is_platform_admin);
    const staff = () => !!(me() && (me().is_platform_admin || me().is_bank_manager));
    const TR = window.CATALOGUE.TRACKS;
    const isNg = (p) => p.collection === 'ninegrade' || p.sharing === 'library';
    const mine = (p) => p.collection !== 'ninegrade' && p.owner_id === me().id;
    const canEditP = (p) => mine(p) || admin() || (p.collection === 'ninegrade' && staff());
    const inQueue = (p) => (p.collection !== 'ninegrade' && p.review === 'offered') || (p.collection === 'ninegrade' && p.review === 'pending' && admin());
    let names = {}; let queueN = 0;
    const first = (p) => ((p && p.full_name) || '').split(' ')[0];

    // ---------- data ----------
    const api = ctx.demo ? demoApi() : sbApi(ctx.sb);
    function sbApi(sb) {
      const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
      return {
        async papers() { return must(await sb.from('bank_papers').select('*, bank_questions(count)').order('created_at', { ascending: false })); },
        async paper(id) { return must(await sb.from('bank_papers').select('*').eq('id', id).maybeSingle()); },
        async questions(pid) { return must(await sb.from('bank_questions').select('*, bank_answers(answer)').eq('paper_id', pid).order('position')); },
        async updatePaper(id, patch) { must(await sb.from('bank_papers').update(patch).eq('id', id)); },
        async removePaper(id) { must(await sb.from('bank_papers').delete().eq('id', id)); },
        async join(code) { return must(await sb.rpc('v2_bank_join', { code })); },
        async leave(pid) { must(await sb.from('bank_shares').delete().eq('paper_id', pid).eq('person_id', me().id)); },
        async shareCount(pid) { const r = await sb.from('bank_shares').select('person_id', { count: 'exact', head: true }).eq('paper_id', pid); return r.count || 0; },
        async joined() { return must(await sb.from('bank_shares').select('paper_id').eq('person_id', me().id)).map((x) => x.paper_id); },
        async saveQuestion(q, answer) { must(await sb.from('bank_questions').update({ question: q.question, marks: q.marks, topic: q.topic }).eq('id', q.id));
          must(await sb.from('bank_answers').upsert({ question_id: q.id, answer }, { onConflict: 'question_id' })); },
        async used(sid, pid) { return must(await sb.from('practice_sets').select('bank_question_ids').eq('student_id', sid).eq('bank_paper_id', pid)).flatMap((x) => x.bank_question_ids || []); },
        async results(sid) { return must(await sb.from('bank_results').select('question_id, mark, mark_max').eq('student_id', sid)); },
        async makeSet(a) { return must(await sb.rpc('v2_bank_make_set', { sid: a.sid, pid: a.pid, qids: a.qids, set_title: a.title, set_minutes: a.minutes, set_due: a.due, set_replaces: a.replaces, set_kind: a.kind })); },
        async offer(pid, offer, permission, note) { return must(await sb.rpc('v2_bank_offer', { pid, offer, permission, offer_note: note || '' })); },
        async review(pid, decision, note) { return must(await sb.rpc('v2_bank_review', { pid, decision, review_text: note || '' })); },
        async resubmit(pid) { return must(await sb.rpc('v2_bank_resubmit', { pid })); },
        async names(ids) { if (!ids.length) return []; const r = await sb.rpc('v2_bank_names', { ids }); return r.error ? [] : r.data; },
        async addPaper(p, qFiles, aFiles) {
          const up = async (tag, files) => { const out = []; const ts = Date.now();
            for (let i = 0; i < files.length; i++) { const f = files[i]; const safe = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60);
              const path = `${me().id}/bank/${ts}/${tag}-${i + 1}-${safe}`; must(await sb.storage.from('practice').upload(path, f, { contentType: f.type || undefined })); out.push(path); }
            return out; };
          const q_files = await up('q', qFiles); const a_files = await up('a', aFiles);
          return must(await sb.from('bank_papers').insert({ ...p, q_files, a_files }).select('id').single()).id; },
      };
    }
    function demoApi() {
      const KEY = 'gcse-v2-bank-demo';
      const q = (num, section, question, marks, topic, answer) => ({ num, section, question, marks, topic, answer });
      const seed = () => {
        const mk = (pid, list) => list.map((x, i) => ({ id: `${pid}-q${i + 1}`, paper_id: pid, position: i + 1, ...x }));
        return {
          papers: [
            { id: 'bp1', owner_id: 'usman', title: 'Physics Paper A.1 (example)', subject: 'Physics', note: '', sharing: 'private', share_code: null, permission_confirmed: false, created_at: new Date().toISOString() },
            { id: 'bp2', owner_id: null, collection: 'ninegrade', track: 'gcse', review: '', added_by: 'usman', title: 'Percentages starter', subject: 'Mathematics', note: '', sharing: 'private', share_code: null, permission_confirmed: true, created_at: new Date().toISOString() },
            { id: 'bp4', owner_id: null, collection: 'ninegrade', track: 'elevenplus', review: '', added_by: 'teacher', title: 'Synonyms and antonyms set 1', subject: 'Verbal reasoning', origin: 'own', note: '', sharing: 'private', share_code: null, permission_confirmed: true, created_at: new Date().toISOString() },
            { id: 'bp3', owner_id: 'teacher', title: 'Comma splices drill', subject: 'English Language', note: '', sharing: 'shared', share_code: 'DEMO1234', permission_confirmed: true, created_at: new Date().toISOString() },
          ],
          questions: [
            ...mk('bp1', [q('1a', 'Question 1: Particle Model and Density', 'Describe the arrangement and movement of particles in a solid and in a gas.', 2, 'Particles', 'Solid: close together, regular, vibrate about fixed positions. Gas: far apart, random, move quickly.'),
              q('1b', 'Question 1: Particle Model and Density', 'A metal block has a mass of 315 g and a volume of 45 cm³. Calculate its density and give the unit.', 3, 'Density', '315 ÷ 45 = 7 g/cm³'),
              q('1c', 'Question 1: Particle Model and Density', 'Describe how to use a displacement can and measuring cylinder to find the volume of an irregular rock.', 3, 'Density', 'Fill to the spout, collect displaced water in a measuring cylinder, its volume = rock volume.'),
              q('1d', 'Question 1: Particle Model and Density', 'What is meant by the internal energy of a substance?', 1, 'Energy', 'Total kinetic and potential energy of the particles.'),
              q('1e', 'Question 1: Particle Model and Density', 'A 0.40 kg sample of water is heated from 30°C to 80°C. c = 4200 J/kg°C. Calculate the energy transferred.', 3, 'Energy', '0.40 × 4200 × 50 = 84 000 J'),
              q('2a', 'Question 2: Electricity and Circuits', 'Name the component used to measure current and the component used to measure potential difference.', 2, 'Circuits', 'Ammeter; voltmeter.'),
              q('2b', 'Question 2: Electricity and Circuits', 'A lamp is in series with an ammeter reading 0.30 A. State the current through the lamp.', 1, 'Circuits', '0.30 A'),
              q('2c', 'Question 2: Electricity and Circuits', 'The p.d. across a resistor is 9.0 V and the current is 0.30 A. Calculate its resistance.', 3, 'Circuits', '9.0 ÷ 0.30 = 30 Ω'),
              q('2d', 'Question 2: Electricity and Circuits', 'A variable resistor is increased in a series circuit with a lamp. Explain what happens to the lamp.', 2, 'Circuits', 'Dimmer, because the current decreases.'),
              q('2e', 'Question 2: Electricity and Circuits', 'A current of 0.25 A flows for 4 minutes. Calculate the charge transferred.', 3, 'Circuits', '240 s × 0.25 = 60 C')]),
            ...mk('bp2', [q('1', '', 'Find 10% of 70.', 1, 'Percentages', '7'), q('2', '', 'Find 25% of 48.', 1, 'Percentages', '12'), q('3', '', 'A £64 coat is reduced by 25%. Work out the sale price.', 2, 'Percentages', '£48')]),
            ...mk('bp4', [q('1', 'Synonyms', 'Underline the word closest in meaning to RAPID: slow, swift, steady, late', 1, 'Synonyms', 'swift'), q('2', 'Synonyms', 'Underline the word closest in meaning to VAST: huge, tiny, empty, narrow', 1, 'Synonyms', 'huge'),
              q('3', 'Antonyms', 'Underline the word most opposite in meaning to ANCIENT: old, modern, broken, famous', 1, 'Antonyms', 'modern'), q('4', 'Antonyms', 'Underline the word most opposite in meaning to GENEROUS: kind, mean, rich, wise', 1, 'Antonyms', 'mean')]),
            ...mk('bp3', [q('1', '', 'Fix: I opened the door, the room was empty.', 1, 'Comma splices', 'I opened the door. The room was empty.'), q('2', '', 'Fix: My phone died, I could not call anyone.', 1, 'Comma splices', 'My phone died, so I could not call anyone.')]),
          ],
          shares: [], results: [{ student_id: 'hadi', question_id: 'bp1-q2', mark: 1, mark_max: 3 }, { student_id: 'hadi', question_id: 'bp1-q1', mark: 2, mark_max: 2 }],
          used: { hadi: ['bp1-q1', 'bp1-q2'] },
        };
      };
      let S; try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; } S = S || seed();
      const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* blocked */ } };
      const canRead = (p) => isUser() && (mine(p) || p.sharing === 'library' || admin()
        || (p.collection === 'ninegrade' && (staff() || (!p.review && ctx.hasTrack(p.track || 'gcse')))) || (p.review === 'offered' && staff())
        || (p.sharing !== 'private' && S.shares.some((s) => s.paper_id === p.id && s.person_id === me().id)));
      const canEdit = (p) => isUser() && canEditP(p);
      const P = (id) => S.papers.find((p) => p.id === id);
      return {
        reset() { S = seed(); save(); },
        async papers() { return S.papers.filter(canRead).map((p) => ({ ...p, bank_questions: [{ count: S.questions.filter((x) => x.paper_id === p.id).length }] })); },
        async paper(id) { const p = P(id); return p && canRead(p) ? p : null; },
        async questions(pid) { const p = P(pid); if (!p || !canRead(p)) return []; return S.questions.filter((x) => x.paper_id === pid).sort((a, b) => a.position - b.position).map((x) => ({ ...x, bank_answers: { answer: x.answer } })); },
        async updatePaper(id, patch) { const p = P(id); if (!p || !canEdit(p)) throw new Error('Only the person who added this paper can change it.');
          const n = { ...p, ...patch };
          if (n.sharing === 'library' && p.sharing !== 'library' && !admin()) throw new Error('The site owner approves papers for the library.');
          if (n.sharing !== 'private' && !n.permission_confirmed) throw new Error('Please confirm you wrote this paper or have permission to share it.');
          if (n.sharing === 'private') { n.share_code = null; S.shares = S.shares.filter((s) => s.paper_id !== id); } else if (!n.share_code) n.share_code = Math.random().toString(36).slice(2, 10).toUpperCase();
          Object.assign(p, n); save(); },
        async removePaper(id) { const p = P(id); if (!p || !(mine(p) || admin())) throw new Error('Only the site owner deletes Ninegrade bank papers.'); S.papers = S.papers.filter((x) => x.id !== id); S.questions = S.questions.filter((x) => x.paper_id !== id); save(); },
        async join(code) { if (!isUser()) throw new Error('Only parents and teachers can use the question bank.');
          const p = S.papers.find((x) => x.share_code === String(code).trim().toUpperCase() && x.sharing !== 'private');
          if (!p) throw new Error("That code doesn't match a shared paper. Check it with the person who shared it.");
          if (!S.shares.some((s) => s.paper_id === p.id && s.person_id === me().id)) S.shares.push({ paper_id: p.id, person_id: me().id }); save(); return p.id; },
        async leave(pid) { S.shares = S.shares.filter((s) => !(s.paper_id === pid && s.person_id === me().id)); save(); },
        async shareCount(pid) { return S.shares.filter((s) => s.paper_id === pid).length; },
        async joined() { return S.shares.filter((s) => s.person_id === me().id).map((s) => s.paper_id); },
        async saveQuestion(q, answer) { const x = S.questions.find((y) => y.id === q.id); if (!x || !canEdit(P(x.paper_id))) throw new Error('Not allowed.'); Object.assign(x, { question: q.question, marks: q.marks, topic: q.topic, answer }); save(); },
        async offer(pid, offer, permission, note) { const p = P(pid); if (!p || !mine(p)) throw new Error('You can only offer your own papers.');
          if (offer && !permission) throw new Error('Tick the box to confirm you wrote this paper or have permission, and that Ninegrade may keep and share it.');
          if (offer && p.status && p.status !== 'ready') throw new Error('Wait until the paper has been added, then offer it.');
          p.review = offer ? 'offered' : ''; if (offer) { p.permission_confirmed = true; p.review_note = note || ''; } save(); return p.review; },
        async review(pid, decision, note) { const p = P(pid); if (!staff()) throw new Error('Only the site owner and bank managers decide on Ninegrade bank papers.');
          if (['exam_board', 'publisher'].includes(p.origin) && decision === 'approve' && !admin()) throw new Error("Exam board and publisher papers need the site owner's approval.");
          if (p.collection !== 'ninegrade' && p.review === 'offered') { if (decision === 'approve') Object.assign(p, { collection: 'ninegrade', contributed_by: p.owner_id, owner_id: null, review: '', sharing: 'private', share_code: null, review_note: note || '' }); else Object.assign(p, { review: decision === 'changes' ? 'changes' : 'declined', review_note: note || '' }); }
          else if (p.collection === 'ninegrade') { if (!admin()) throw new Error('The site owner decides on this paper.'); p.review = decision === 'approve' ? '' : decision === 'changes' ? 'changes' : 'declined'; p.review_note = note || ''; }
          else throw new Error("This paper isn't waiting for a decision."); save(); return decision; },
        async resubmit(pid) { const p = P(pid); p.review = admin() ? '' : 'pending'; save(); return p.review; },
        async names(ids) { return (ctx.D().people || []).filter((x) => ids.includes(x.id)).map((x) => ({ id: x.id, full_name: x.full_name })); },
        async addPaper(x, qFiles, aFiles) { if (!isUser()) throw new Error('Only parents and teachers can use the question bank.');
          if (x.collection === 'ninegrade' && !staff()) throw new Error('Only the site owner and bank managers add to the Ninegrade bank.');
          const ng = x.collection === 'ninegrade';
          const id = 'bp' + Date.now(); S.papers.unshift({ ...x, id, owner_id: ng ? null : me().id, added_by: me().id, review: ng && ['exam_board', 'publisher'].includes(x.origin) && !admin() ? 'pending' : '', sharing: 'private', share_code: null, permission_confirmed: false, status: 'processing', reply: '',
            q_files: qFiles.map((f) => f.name), a_files: aFiles.map((f) => f.name), created_at: new Date().toISOString() }); save(); return id; },
        async used(sid) { return S.used[sid] || []; },
        async results(sid) { return S.results.filter((r) => r.student_id === sid); },
        async makeSet(a) { const p = P(a.pid); if (!p || !canRead(p)) throw new Error("You don't have this paper.");
          if (!practice.isStaffFor(a.sid)) throw new Error('You can only make practice for your own students.');
          const qs = S.questions.filter((x) => x.paper_id === a.pid && a.qids.includes(x.id)).sort((x, y) => x.position - y.position);
          if (!qs.length) throw new Error('Choose at least one question.');
          const e = (t) => esc(t).replace(/\n/g, '<br>'); let sec = null; let body = ''; let ans = ''; const total = qs.reduce((t, x) => t + x.marks, 0);
          qs.forEach((x) => { if (x.section && x.section !== sec) { body += `<h2>${esc(x.section)}</h2>`; sec = x.section; }
            body += `<p><b>${esc(x.num)}.</b> ${e(x.question)} <span class="marks">(${x.marks} mark${x.marks === 1 ? '' : 's'})</span></p>`; ans += `<p><b>${esc(x.num)}.</b> ${e(x.answer)} <b>(${x.marks})</b></p>`; });
          body = `<div class="header"><p><b>${esc(p.title)}</b> · ${qs.length} question${qs.length === 1 ? '' : 's'} · ${total} marks</p></div><p><i>Answer all questions. Show your working for calculations and include units.</i></p>${body}`;
          ans = `<p><b>For the parent only.</b> From the question bank: ${esc(p.title)}.</p>${ans}<p><b>Total: ${total} marks.</b></p>`;
          S.used[a.sid] = [...(S.used[a.sid] || []), ...qs.map((x) => x.id)]; save();
          const k = a.kind || 'practice';
          if (k === 'quiz' || k === 'lesson') return practice.demoInsert({ student_id: a.sid, subject: p.subject, kind: k, title: a.title || p.title, minutes: a.minutes, due_date: a.due, replaces_lessons: !!a.replaces, as_is: true, status: 'requested', body_html: '', bank_question_ids: qs.map((x) => x.id), bank_paper_id: p.id, note: `From the question bank: use ONLY these ${qs.length} questions.`, reply: '' }, '');
          if (k === 'mock') body = body.replace('<p><i>Answer all questions.', `<div class="msg info"><p><b>Mock exam.</b> Work on your own, without notes.${a.minutes ? ` Time allowed: ${a.minutes} minutes.` : ''} Total: ${total} marks.</p></div><p><i>Answer all questions.`);
          return practice.demoInsert({ student_id: a.sid, subject: p.subject, kind: k, title: a.title || p.title, minutes: a.minutes, due_date: a.due, replaces_lessons: !!a.replaces, as_is: true, status: 'draft', body_html: body, bank_question_ids: qs.map((x) => x.id), bank_paper_id: p.id, reply: `Made straight away from the question bank: ${qs.length} questions, ${total} marks. Check it, then assign it.` }, ans); },
      };
    }

    // ---------- pages ----------
    const count = (p) => ((p.bank_questions && p.bank_questions[0]) || {}).count || 0;
    const sharePill = (p) => (p.review && REVIEW[p.review] ? `<span class="pill ${REVIEW[p.review][1]}">${REVIEW[p.review][0]}</span>`
      : p.collection === 'ninegrade' ? '<span class="pill done">Ninegrade bank</span>' : `<span class="pill ${p.sharing === 'private' ? 'todo' : p.sharing === 'library_pending' ? 'draft' : 'done'}">${SHARING[p.sharing][0]}</span>`);
    const trackTag = (p) => (ctx.myTracks().length > 1 ? `<span class="tagx">${TR[p.track || 'gcse']}</span> ` : '');
    async function loadNames(list) { const ids = [...new Set(list.flatMap((p) => [p.owner_id, p.contributed_by, p.added_by]).filter((x) => x && !names[x]))];
      if (ids.length) (await api.names(ids).catch(() => [])).forEach((x) => { names[x.id] = x.full_name; }); }
    const nm = (id) => esc(names[id] || ((ctx.D().people || []).find((x) => x.id === id) || {}).full_name || 'a parent');
    const card = (p, extra = '') => `<a class="pset-card" href="#bank-${esc(p.id)}"><span class="stripe kind-practice"></span><span class="lc-body"><span class="subj">${trackTag(p)}${esc(p.subject)}</span>
      <span class="lc-title">${esc(p.title)}</span><span class="muted small">${p.status === 'processing' ? 'Being added: ready after the evening run' : p.status === 'failed' ? 'Couldn\'t be added, open it to see why' : `${count(p)} question${count(p) === 1 ? '' : 's'}`}${extra}</span></span>${p.status === 'processing' ? '<span class="pill draft">Being added</span>' : p.status === 'failed' ? '<span class="pill missed">Needs attention</span>' : mine(p) || (isNg(p) && staff() && p.review) ? sharePill(p) : ''}</a>`;

    async function listPage() {
      if (!isUser()) return shell('bank', page('<div class="narrow"><div class="page-head"><h1>Question bank</h1></div><section class="panel"><p class="muted">The question bank is for parents and teachers.</p></section></div>'));
      let papers; let joined;
      try { [papers, joined] = await Promise.all([api.papers(), api.joined()]); } catch (x) { return shell('bank', page(`<div class="narrow"><div class="page-head"><h1>Question bank</h1></div><section class="panel"><p class="msg err">${esc(nice(x))}</p></section></div>`)); }
      const own = papers.filter((p) => mine(p));
      const shared = papers.filter((p) => !mine(p) && !isNg(p) && joined.includes(p.id));
      const ng = papers.filter((p) => isNg(p) && (!p.review || staff()));
      const queue = staff() ? papers.filter(inQueue) : [];
      const sec = (title, list, help, empty) => `<section class="panel"><h2>${title}${list.length ? ` <span class="count">${list.length}</span>` : ''}</h2>${help ? `<p class="muted small">${help}</p>` : ''}${list.length ? list.map((p) => card(p)).join('') : `<p class="muted">${empty}</p>`}</section>`;
      const both = ctx.myTracks().length > 1;
      const ngSec = both ? ['gcse', 'elevenplus'].map((t) => sec(`Ninegrade ${TR[t]} bank`, ng.filter((p) => (p.track || 'gcse') === t), t === 'elevenplus' ? 'Ninegrade\'s own 11+ papers. Make practice from them any time.' : 'Ninegrade\'s own GCSE papers.', 'Nothing here yet.')).join('')
        : sec(`Ninegrade ${TR[ctx.myTracks()[0]]} bank`, ng, 'Papers that belong to Ninegrade, checked before they go in. Make practice from them any time.', 'Nothing here yet.');
      shell('bank', page(`<div class="narrow"><div class="page-head"><p class="kicker dark">Practice</p><h1>Question bank</h1>
        <p class="muted">Add a paper once, with its answers. Ninegrade saves it question by question, word for word. Then make practice, a mock, a quiz or a lesson from it any time, as many or as few questions as you like. Students never see the bank or the answers.</p>
        <div class="row"><a class="btn primary" href="#bank-add">Add a paper</a></div></div><div id="flash"></div>
        ${queue.length ? `<section class="panel slim"><div class="panel-head"><div><h2>Waiting for a decision <span class="count">${queue.length}</span></h2><p class="muted small">Papers offered to the Ninegrade bank.</p></div><a class="btn primary sm" href="#bank-review">Bank approvals</a></div></section>` : ''}
        ${sec('My papers', own, '', 'No papers yet. Press "Add a paper" to upload or paste one with its answers.')}
        ${sec('Shared with me', shared, '', 'Nothing shared with you yet. If someone gives you a share code, enter it below.')}
        <section class="panel"><h2>Add a shared paper</h2><form id="bjoin" class="row form-row"><label for="bj-code" class="grow">Share code<input id="bj-code" maxlength="12" autocomplete="off" placeholder="e.g. 7F3A9C21" required></label><button class="btn primary">Add</button></form><div id="bj-msg"></div></section>
        ${ngSec}</div>`));
      document.getElementById('bjoin').onsubmit = async (e) => { e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
        try { const id = await api.join(document.getElementById('bj-code').value); location.hash = '#bank-' + id; }
        catch (x) { b.disabled = false; document.getElementById('bj-msg').innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } };
    }

    function addPage() {
      if (!isUser()) return listPage();
      const tracks = ctx.myTracks(); const C11 = window.CATALOGUE.SUBJECTS_11;
      const subsFor = (t) => [...new Set([...(ctx.D().courses || []).filter((c) => (c.qualification === '11+') === (t === 'elevenplus')).map((c) => c.subject), ...(t === 'elevenplus' ? C11 : [])])];
      const subs = subsFor(tracks.includes('gcse') ? 'gcse' : 'elevenplus');
      shell('bank', page(`<div class="narrow"><div class="page-head"><a class="small" href="#bank">← Question bank</a><p class="kicker dark">Question bank</p><h1>Add a paper</h1>
        <p class="muted">Upload or paste the questions and their answers once. Ninegrade saves every question word for word at the next evening run (weekdays, about 5:40 PM), with your answers as the mark scheme.</p></div>
        <form id="baform" class="form panel">
          <div class="row form-row"><label for="ba-title" class="grow">Title<input id="ba-title" maxlength="120" required placeholder="e.g. Physics Mock A"></label>
            <label for="ba-subj" class="grow">Subject<input id="ba-subj" maxlength="60" required list="ba-subjs" value="${esc(subs[0] || '')}"><datalist id="ba-subjs">${subs.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label></div>
          ${tracks.length > 1 ? `<fieldset class="kind-pick"><legend>Which track?</legend>${tracks.map((t, i) => `<label class="kind-opt"><input type="radio" name="btrack" value="${t}" ${i === 0 ? 'checked' : ''}> <b>${TR[t]}</b><span>${t === 'gcse' ? 'GCSE and IGCSE subjects.' : 'Maths, English, verbal and non-verbal reasoning.'}</span></label>`).join('')}</fieldset>` : ''}
          ${staff() ? `<fieldset class="kind-pick"><legend>Where should it go?</legend><label class="kind-opt"><input type="radio" name="bcoll" value="own" checked> <b>My bank</b><span>Yours, for your own children or classes.</span></label><label class="kind-opt"><input type="radio" name="bcoll" value="ninegrade"> <b>Ninegrade bank</b><span>Belongs to Ninegrade and stays if you leave. Every family with this track can make practice from it.${admin() ? '' : ' Exam board or publisher papers wait for the site owner\'s approval.'}</span></label></fieldset>` : ''}
          <fieldset class="kind-pick"><legend>Where is it from? <small>This decides whether it can be shared later.</small></legend>${Object.entries(ORIGIN).map(([k, t], i) => `<label class="kind-opt"><input type="radio" name="borigin" value="${k}" ${i === 0 ? 'checked' : ''}> <b>${t}</b><span>${k === 'own' ? 'You can share it with others.' : 'Fine for your own children. Only share it if you have permission.'}</span></label>`).join('')}</fieldset>
          <h2>Questions</h2>
          <label for="ba-q">Paste the questions <small>optional if you upload them</small><textarea id="ba-q" rows="6" maxlength="50000" placeholder="1a. Describe the arrangement of particles in a solid. (2 marks)"></textarea></label>
          <label for="ba-qf">Or upload them <small>photos or PDF, up to 20 files of 15 MB each</small><input id="ba-qf" type="file" multiple accept="image/*,application/pdf,.doc,.docx,.txt"></label>
          <h2>Answers or mark scheme</h2>
          <label for="ba-a">Paste the answers <small>optional if you upload them</small><textarea id="ba-a" rows="5" maxlength="50000" placeholder="1a. Close together, regular pattern, vibrate in place. (2)"></textarea></label>
          <label for="ba-af">Or upload them <small>students never see these</small><input id="ba-af" type="file" multiple accept="image/*,application/pdf,.doc,.docx,.txt"></label>
          <label for="ba-note">Anything Ninegrade should know? <small>optional</small><textarea id="ba-note" rows="2" maxlength="500" placeholder="e.g. Questions 5 to 8 are on page 3. Skip question 12."></textarea></label>
          <div id="ba-msg"></div><button class="btn primary lg" id="ba-go">Add to my bank</button></form></div>`));
      app.querySelectorAll('input[name=btrack]').forEach((r) => { r.onchange = () => { const dl = document.getElementById('ba-subjs'); dl.innerHTML = subsFor(r.value).map((x) => `<option value="${esc(x)}">`).join(''); const inp = document.getElementById('ba-subj'); if (!inp.dataset.typed) inp.value = subsFor(r.value)[0] || ''; }; });
      document.getElementById('ba-subj').oninput = (e) => { e.target.dataset.typed = 1; };
      app.querySelectorAll('input[name=bcoll]').forEach((r) => { r.onchange = () => { document.getElementById('ba-go').textContent = r.value === 'ninegrade' ? 'Add to the Ninegrade bank' : 'Add to my bank'; }; });
      document.getElementById('baform').onsubmit = async (e) => { e.preventDefault(); const msg = document.getElementById('ba-msg'); const b = document.getElementById('ba-go');
        const v = (x) => document.getElementById(x).value.trim(); const qf = [...document.getElementById('ba-qf').files]; const af = [...document.getElementById('ba-af').files];
        if (!v('ba-q') && !qf.length) { msg.innerHTML = '<p class="msg err">Paste the questions or upload them.</p>'; return; }
        if (!v('ba-a') && !af.length) { msg.innerHTML = '<p class="msg err">Add the answers too, so Ninegrade can mark against them. Paste them or upload them.</p>'; return; }
        if (qf.length > 20 || af.length > 20 || [...qf, ...af].some((f) => f.size > 15 * 1024 * 1024)) { msg.innerHTML = '<p class="msg err">Up to 20 files of 15 MB each for questions, and the same for answers.</p>'; return; }
        b.disabled = true; b.textContent = qf.length || af.length ? 'Uploading…' : 'Adding…';
        const track = (document.querySelector('input[name=btrack]:checked') || {}).value || tracks[0]; const collection = (document.querySelector('input[name=bcoll]:checked') || {}).value || 'own';
        try { const id = await api.addPaper({ title: v('ba-title'), subject: v('ba-subj'), track, collection, origin: (document.querySelector('input[name=borigin]:checked') || {}).value || 'own', q_text: v('ba-q'), a_text: v('ba-a'), note: v('ba-note') }, qf, af);
          location.hash = '#bank-' + id; }
        catch (x) { b.disabled = false; b.textContent = 'Add to my bank'; msg.innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } };
    }

    let pick = { mode: 'next', sid: null, kind: 'practice' };
    async function paperPage(id) {
      let p; let qs;
      try { [p, qs] = await Promise.all([api.paper(id), api.questions(id)]); } catch (x) { return shell('bank', page(`<div class="narrow"><section class="panel"><p class="msg err">${esc(nice(x))}</p></section></div>`)); }
      if (!p) return shell('bank', page('<div class="narrow"><div class="page-head"><a class="small" href="#bank">← Question bank</a><h1>Not found</h1></div><section class="panel"><p class="muted">This paper doesn\'t exist, or it isn\'t shared with you.</p></section></div>'));
      const owner = canEditP(p); const mineP = mine(p); await loadNames([p]);
      if (window.ngBankFor) { pick.sid = window.ngBankFor; window.ngBankFor = null; }
      if (p.status === 'processing' || p.status === 'failed') {
        return shell('bank', page(`<div class="narrow"><div class="page-head"><a class="small" href="#bank">← Question bank</a><p class="kicker dark">${esc(p.subject)}</p><h1>${esc(p.title)}</h1></div>
          <section class="panel"><h2>${p.status === 'processing' ? 'Being added' : 'This paper couldn\'t be added yet'}</h2>
          ${p.status === 'processing' ? '<p>Ninegrade saves each question and its answer at the next evening run (weekdays, about 5:40 PM). Then you can make practice from it.</p>' : `<p class="msg info">${esc(p.reply || 'Something was missing.')}</p>`}
          <p class="small muted">${esc(ORIGIN[p.origin] || '')}${(p.q_files || []).length ? ` · ${p.q_files.length} question file${p.q_files.length === 1 ? '' : 's'}` : ''}${(p.a_files || []).length ? ` · ${p.a_files.length} answer file${p.a_files.length === 1 ? '' : 's'}` : ''}</p>
          ${mineP || admin() ? '<div class="row"><button class="btn ghost sm" id="bdel">Delete this paper</button></div><div id="bs-msg"></div>' : ''}</section></div>`)), wireDelete(p);
      }
      const kids = practice.myStudents(); if (!pick.sid || !kids.some((k) => k.id === pick.sid)) pick.sid = kids[0] ? kids[0].id : null;
      const [used, res] = pick.sid ? await Promise.all([api.used(pick.sid, id).catch(() => []), api.results(pick.sid).catch(() => [])]) : [[], []];
      const R = Object.fromEntries(res.map((r) => [r.question_id, r])); const U = new Set(used);
      const total = qs.reduce((t, q) => t + q.marks, 0); const topics = [...new Set(qs.map((q) => q.topic).filter(Boolean))];
      const stat = (q) => { const r = R[q.id]; if (r) return r.mark >= r.mark_max ? `<span class="pill done">✔ ${r.mark}/${r.mark_max}</span>` : `<span class="pill missed">✘ ${r.mark}/${r.mark_max}</span>`; return U.has(q.id) ? '<span class="pill sent">Set</span>' : '<span class="pill todo">New</span>'; };
      const ansOf = (q) => (q.bank_answers && (Array.isArray(q.bank_answers) ? (q.bank_answers[0] || {}).answer : q.bank_answers.answer)) || '';
      const kidName = pick.sid ? esc(first(ctx.person(pick.sid))) : '';
      shell('bank', page(`<div class="narrow"><div class="page-head"><a class="small" href="#bank">← Question bank</a><p class="kicker dark">${esc(p.subject)}</p><h1>${esc(p.title)}</h1>
        <p class="muted">${qs.length} questions · ${total} marks${p.origin ? ` · ${esc(ORIGIN[p.origin] || '')}` : ''}${mineP ? '' : isNg(p) ? ` · Ninegrade ${TR[p.track || 'gcse']} bank${p.contributed_by ? ` · contributed by ${nm(p.contributed_by)}` : ''}` : ' · shared with you'}</p></div><div id="flash"></div>
        ${reviewBox(p)}
        ${kids.length && qs.length ? `<section class="panel" id="bmake"><h2>Make practice now</h2>
          <form id="bform" class="form">
            ${kids.length > 1 ? `<label for="b-kid">For<select id="b-kid">${kids.map((k) => `<option value="${esc(k.id)}" ${k.id === pick.sid ? 'selected' : ''}>${esc(k.full_name)}</option>`).join('')}</select></label>` : ''}
            <fieldset class="kind-pick"><legend>What to make</legend>${Object.entries(KIND).map(([k, [t, d]]) => `<label class="kind-opt"><input type="radio" name="bkind" value="${k}" ${pick.kind === k ? 'checked' : ''}> <b>${t}</b><span>${d}</span></label>`).join('')}</fieldset>
            <fieldset class="kind-pick"><legend>Which questions?</legend>
              ${[['next', 'Next ones not done yet', `Carries on from where ${kidName} got to.`], ['wrong', 'Ones got wrong before', 'Questions that lost marks last time.'], ['topic', 'One topic', 'Only questions on the topic you choose.'], ['random', 'A random mix', 'Any questions from the paper.'], ['pick', 'Pick by hand', 'Tick the questions in the list below.']]
                .filter(([k]) => k !== 'topic' || topics.length).map(([k, t, d]) => `<label class="kind-opt"><input type="radio" name="bmode" value="${k}" ${pick.mode === k ? 'checked' : ''}> <b>${t}</b><span>${d}</span></label>`).join('')}</fieldset>
            <div class="row form-row"><label for="b-n" class="narrow-field">How many<input id="b-n" type="number" min="1" max="${qs.length}" value="${Math.min(10, qs.length)}"></label>
              ${topics.length ? `<label for="b-topic" id="b-topic-wrap" ${pick.mode === 'topic' ? '' : 'hidden'}>Topic<select id="b-topic">${topics.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>` : ''}
              <label for="b-min" class="narrow-field">Minutes <small>optional</small><input id="b-min" type="number" min="5" max="240" step="5"></label>
              <label for="b-due">Due date <small>optional</small><input id="b-due" type="date" min="${ctx.today()}"></label></div>
            <label for="b-title">Title <small>optional</small><input id="b-title" maxlength="120" placeholder="${esc(p.title)}"></label>
            <fieldset class="kind-pick fit-pick"><legend>How does it fit with the weekly lessons?</legend>
              <label class="kind-opt"><input type="radio" name="bfit" value="extra" checked> <b>On top of this week's lessons</b><span>Extra practice.</span></label>
              <label class="kind-opt"><input type="radio" name="bfit" value="instead"> <b>Instead of some of this week's lessons</b><span>The next weekly plan is shorter in this subject.</span></label></fieldset>
            <p class="small" id="b-preview" aria-live="polite"></p><div id="b-msg"></div>
            <button class="btn primary lg" id="b-go">${pick.kind === 'quiz' || pick.kind === 'lesson' ? 'Send to Ninegrade' : 'Make it now'}</button>
            <p class="muted small" id="b-when">${pick.kind === 'quiz' || pick.kind === 'lesson' ? 'Ready to check after the next evening run.' : "It's ready straight away to check and assign."} Ninegrade marks ${kidName}'s answers against this paper's answers.</p></form></section>` : kids.length ? '' : '<section class="panel"><p class="muted">Link a child or a class first to make practice from the bank.</p></section>'}
        <section class="panel"><div class="panel-head"><h2>Questions</h2>${kidName ? `<span class="muted small">Status for ${kidName}</span>` : ''}</div>
          <ol class="bank-list">${qs.map((q) => `<li class="bank-q" data-q="${esc(q.id)}"><label class="bq-pick" ${pick.mode === 'pick' ? '' : 'hidden'}><input type="checkbox" value="${esc(q.id)}" aria-label="Use question ${esc(q.num)}"></label>
            <div class="bq-body"><div class="bq-top"><b>${esc(q.num)}</b>${q.topic ? `<span class="tag">${esc(q.topic)}</span>` : ''}<span class="muted small">${q.marks} mark${q.marks === 1 ? '' : 's'}</span>${kidName ? stat(q) : ''}</div>
            <div class="bq-text">${esc(q.question).replace(/\n/g, '<br>')}</div>
            <details class="bq-ans"><summary class="small">Answer</summary><div class="small">${esc(ansOf(q)).replace(/\n/g, '<br>') || '<span class="muted">No answer saved.</span>'}</div></details>
            ${owner ? `<button type="button" class="btn ghost xs" data-bedit="${esc(q.id)}">Edit</button>` : ''}</div></li>`).join('')}</ol></section>
        ${mineP ? `<section class="panel" id="bshare"><h2>Sharing</h2><p class="muted small">Loading…</p></section>` : isNg(p) ? ngBox(p) : `<section class="panel slim"><div class="row"><span class="muted small">Shared with you. You can make practice from it, but only the person who added it can change it.</span><button class="btn ghost sm" id="bleave">Remove from my bank</button></div></section>`}</div>`));
      wireReview(p); if (isNg(p)) wireDelete(p);

      // ----- make practice -----
      const form = document.getElementById('bform');
      if (form) {
        const mode = () => (form.querySelector('input[name=bmode]:checked') || {}).value || 'next';
        const chosen = () => {
          const n = Math.max(1, Number(document.getElementById('b-n').value) || 1); const m = mode();
          if (m === 'pick') return { list: [...app.querySelectorAll('.bq-pick input:checked')].map((c) => qs.find((q) => q.id === c.value)) };
          if (m === 'next') { const fresh = qs.filter((q) => !U.has(q.id) && !R[q.id]); return { list: fresh.slice(0, n), note: fresh.length < n ? (fresh.length ? `Only ${fresh.length} not done yet.` : `${kidName} has done every question. Try "Ones got wrong before" or "A random mix".`) : '' }; }
          if (m === 'wrong') { const w = qs.filter((q) => R[q.id] && R[q.id].mark < R[q.id].mark_max); return { list: w.slice(0, n), note: w.length ? (w.length < n ? `Only ${w.length} got wrong before.` : '') : 'Nothing got wrong yet, or nothing marked yet.' }; }
          if (m === 'topic') { const t = document.getElementById('b-topic').value; const l = qs.filter((q) => q.topic === t); const ord = [...l.filter((q) => !U.has(q.id)), ...l.filter((q) => U.has(q.id))]; return { list: ord.slice(0, n), note: l.length < n ? `Only ${l.length} on this topic.` : '' }; }
          const sh = [...qs]; for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
          if (!form.dataset.rand || form.dataset.randN !== String(n)) { form.dataset.rand = sh.slice(0, n).map((q) => q.id).join(','); form.dataset.randN = String(n); }
          return { list: form.dataset.rand.split(',').map((x) => qs.find((q) => q.id === x)).filter(Boolean) };
        };
        const preview = () => { const m = mode(); pick.mode = m;
          pick.kind = (form.querySelector('input[name=bkind]:checked') || {}).value || 'practice'; const later = pick.kind === 'quiz' || pick.kind === 'lesson';
          const go = document.getElementById('b-go'); if (!go.disabled) go.textContent = later ? 'Send to Ninegrade' : 'Make it now';
          document.getElementById('b-when').textContent = `${later ? 'Ready to check after the next evening run.' : "It's ready straight away to check and assign."} Ninegrade marks ${kidName ? first(ctx.person(pick.sid)) + "'s" : 'the'} answers against this paper's answers.`;
          app.querySelectorAll('.bq-pick').forEach((l) => { l.hidden = m !== 'pick'; });
          const tw = document.getElementById('b-topic-wrap'); if (tw) tw.hidden = m !== 'topic';
          document.getElementById('b-n').disabled = m === 'pick';
          const c = chosen(); const marks = c.list.reduce((t, q) => t + q.marks, 0);
          document.getElementById('b-preview').innerHTML = c.list.length ? `<b>Will use ${c.list.length} question${c.list.length === 1 ? '' : 's'} (${marks} marks):</b> ${c.list.map((q) => esc(q.num)).join(', ')}${c.note ? ` · <span class="muted">${esc(c.note)}</span>` : ''}` : `<span class="muted">${esc(c.note || 'Tick at least one question in the list below.')}</span>`; };
        form.addEventListener('change', (e) => { if (e.target.id === 'b-kid') { pick.sid = e.target.value; paperPage(id); return; } if (e.target.name === 'bmode' && e.target.value === 'random') delete form.dataset.rand; preview(); });
        form.addEventListener('input', preview);
        app.querySelectorAll('.bq-pick input').forEach((c) => { c.onchange = preview; });
        preview();
        form.onsubmit = async (e) => { e.preventDefault(); const msg = document.getElementById('b-msg'); const c = chosen();
          if (!c.list.length) { msg.innerHTML = `<p class="msg err">${esc(c.note || 'Choose at least one question.')}</p>`; return; }
          const b = document.getElementById('b-go'); b.disabled = true; b.textContent = 'Making…';
          const nums = c.list.map((q) => q.num); const title = document.getElementById('b-title').value.trim() || `${p.title} · ${nums.length > 1 ? `${nums[0]} to ${nums[nums.length - 1]}` : nums[0]}`;
          try { const sid = await api.makeSet({ sid: pick.sid, pid: id, qids: c.list.map((q) => q.id), title: title.slice(0, 120), minutes: Number(document.getElementById('b-min').value) || null,
              due: document.getElementById('b-due').value || null, replaces: (form.querySelector('input[name=bfit]:checked') || {}).value === 'instead', kind: pick.kind });
            delete form.dataset.rand; location.hash = '#pset-' + sid; }
          catch (x) { b.disabled = false; b.textContent = pick.kind === 'quiz' || pick.kind === 'lesson' ? 'Send to Ninegrade' : 'Make it now'; msg.innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } };
      }

      // ----- edit a question (the person who added the paper) -----
      app.querySelectorAll('[data-bedit]').forEach((btn) => { btn.onclick = () => {
        const q = qs.find((x) => x.id === btn.dataset.bedit); const li = btn.closest('.bq-body');
        li.innerHTML = `<form class="form bq-edit"><b>${esc(q.num)}</b><label>Question<textarea rows="4" maxlength="5000" class="be-q">${esc(q.question)}</textarea></label>
          <div class="row form-row"><label class="narrow-field">Marks<input type="number" min="0" max="50" class="be-m" value="${q.marks}"></label><label class="grow">Topic<input maxlength="80" class="be-t" value="${esc(q.topic || '')}"></label></div>
          <label>Answer <small>only parents and teachers see this</small><textarea rows="3" maxlength="5000" class="be-a">${esc(ansOf(q))}</textarea></label>
          <div class="row"><button class="btn primary sm">Save</button><button type="button" class="btn ghost sm be-x">Cancel</button></div><div class="be-msg"></div></form>`;
        li.querySelector('.be-x').onclick = () => paperPage(id);
        li.querySelector('form').onsubmit = async (e) => { e.preventDefault(); const f = e.target;
          try { await api.saveQuestion({ id: q.id, question: f.querySelector('.be-q').value.trim(), marks: Number(f.querySelector('.be-m').value) || 0, topic: f.querySelector('.be-t').value.trim() }, f.querySelector('.be-a').value.trim()); paperPage(id); }
          catch (x) { f.querySelector('.be-msg').innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } };
      }; });

      const leave = document.getElementById('bleave');
      if (leave) leave.onclick = async () => { leave.disabled = true; await api.leave(id).catch(() => {}); location.hash = '#bank'; };
      const box = document.getElementById('bshare'); if (box) shareBox(p, box);
    }

    async function shareBox(p, box) {
      const n = p.sharing === 'private' ? 0 : await api.shareCount(p.id).catch(() => 0);
      box.innerHTML = `<h2>Sharing</h2><p><span class="pill ${p.sharing === 'private' ? 'todo' : 'done'}">${SHARING[p.sharing === 'shared' ? 'shared' : 'private'][0]}</span> <span class="muted small">${SHARING[p.sharing === 'shared' ? 'shared' : 'private'][1]}</span></p>
        ${p.share_code && p.sharing === 'shared' ? `<div class="share-code"><span class="muted small">Share code</span><b id="bcode">${esc(p.share_code)}</b><span class="muted small">Give this code to a parent or teacher. They enter it on their Question bank page. ${n ? `${n} ${n === 1 ? 'person has' : 'people have'} added it.` : 'Nobody has added it yet.'}</span></div>` : ''}
        ${mine(p) ? `<form id="bsform" class="form">
          ${p.origin && p.origin !== 'own' ? `<p class="msg info small">This paper is from: ${esc(ORIGIN[p.origin])}. Only share it if you have permission from whoever owns it.</p>` : ''}
          <label class="check-row"><input type="checkbox" id="bs-perm" ${p.permission_confirmed ? 'checked' : ''}> <span>I wrote this paper, or I have permission to share it. <span class="muted small">Papers from exam boards, publishers, tutors or schools usually can't be shared without permission.</span></span></label>
          <div class="row">${p.sharing === 'private' ? '<button type="button" class="btn primary sm" data-bshare="shared">Share by code</button>' : ''}${p.sharing !== 'private' ? '<button type="button" class="btn ghost sm" data-bshare="private">Stop sharing</button>' : ''}</div>
          <p class="muted small">Sharing never shows your child's work or marks. People you share with can make practice from it, but can't change it. If you stop sharing, they keep the sets they've made but can't make new ones.</p>
          <div id="bs-msg"></div></form>
          <div class="offer-box"><h3>Offer to the Ninegrade bank</h3>
          ${p.review === 'offered' ? `<p><span class="pill draft">Waiting for Ninegrade</span> <span class="muted small">Ninegrade will check it and approve it, ask for changes or turn it down. You can keep using it meanwhile.</span></p><div class="row"><button type="button" class="btn ghost sm" id="boffer-back">Take the offer back</button></div>`
            : `${p.review === 'changes' ? `<p class="msg info"><b>Ninegrade asked for changes.</b> ${esc(p.review_note || '')} Change the questions or answers above, then offer it again.</p>` : p.review === 'declined' ? `<p class="msg info"><b>Turned down.</b> ${esc(p.review_note || 'It stays in your own bank.')}</p>` : ''}
            <p class="muted small">If approved, it becomes Ninegrade's: other families with this track can make practice from it, your name shows as "contributed by", and it stays if you leave. Your own children keep using it as before.</p>
            <label class="check-row"><input type="checkbox" id="boffer-perm"> <span>I wrote this paper or have permission, and Ninegrade may keep it, change it and share it. <a href="#sharing-terms" target="_blank">Sharing and contributions</a></span></label>
            <label for="boffer-note">Note for Ninegrade <small>optional</small><input id="boffer-note" maxlength="300" placeholder="e.g. Written by me for Year 5"></label>
            <div class="row"><button type="button" class="btn primary sm" id="boffer">Offer to the Ninegrade bank</button></div>`}
          <div id="bo-msg"></div></div>
          <div class="row" style="margin-top:12px"><button type="button" class="btn ghost sm" id="bdel">Delete this paper</button></div>` : ''}`;
      const off = document.getElementById('boffer'); const back = document.getElementById('boffer-back');
      if (off) off.onclick = async () => { const m = document.getElementById('bo-msg'); if (!document.getElementById('boffer-perm').checked) { m.innerHTML = '<p class="msg err">Tick the box first.</p>'; return; }
        off.disabled = true; try { await api.offer(p.id, true, true, document.getElementById('boffer-note').value.trim()); paperPage(p.id); } catch (x) { off.disabled = false; m.innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } };
      if (back) back.onclick = async () => { back.disabled = true; try { await api.offer(p.id, false, false); paperPage(p.id); } catch (x) { back.disabled = false; document.getElementById('bo-msg').innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } };
      box.querySelectorAll('[data-bshare]').forEach((b) => { b.onclick = async () => {
        const perm = document.getElementById('bs-perm'); const to = b.dataset.bshare; const m = document.getElementById('bs-msg');
        if (to !== 'private' && perm && !perm.checked && p.owner_id === me().id) { m.innerHTML = '<p class="msg err">Tick the box to confirm you wrote this paper or have permission to share it.</p>'; return; }
        b.disabled = true;
        try { await api.updatePaper(p.id, { sharing: to, ...(perm ? { permission_confirmed: perm.checked } : {}) }); paperPage(p.id); }
        catch (x) { b.disabled = false; (m || box).insertAdjacentHTML('beforeend', `<p class="msg err">${esc(nice(x))}</p>`); } }; });
      wireDelete(p);
    }
    // Ninegrade bank paper: who added it, its status for staff, and delete (site owner only).
    function ngBox(p) {
      if (!staff()) return `<section class="panel slim"><p class="muted small">This paper belongs to Ninegrade. You can make practice from it as often as you like, but it can't be changed here. Spotted a mistake? Use "Report a problem" on the practice made from it.</p></section>`;
      return `<section class="panel"><h2>Ninegrade bank</h2><p>${sharePill(p)} <span class="muted small">${p.added_by ? `Added by ${nm(p.added_by)}` : ''}${p.contributed_by ? ` · contributed by ${nm(p.contributed_by)}` : ''}</span></p>
        ${p.review === 'changes' && !admin() ? `<p class="msg info"><b>The site owner asked for changes.</b> ${esc(p.review_note || '')}</p><div class="row"><button class="btn primary sm" id="bresub">Send it again</button></div>` : p.review === 'pending' && !admin() ? '<p class="muted small">Exam board and publisher papers wait for the site owner\'s approval before families can see them.</p>' : ''}
        <p class="muted small">Families with ${TR[p.track || 'gcse']} switched on can make practice from it. ${admin() ? 'Only you can delete it.' : 'Only the site owner can delete it.'}</p>
        ${admin() ? '<div class="row"><button type="button" class="btn ghost sm" id="bdel">Delete from the Ninegrade bank</button></div>' : ''}<div id="bs-msg"></div></section>`;
    }
    function reviewBox(p) {
      const waiting = (p.collection !== 'ninegrade' && p.review === 'offered' && staff()) || (p.collection === 'ninegrade' && ['pending', 'changes', 'declined'].includes(p.review) && admin());
      if (!waiting) return '';
      const ownerOnly = ['exam_board', 'publisher'].includes(p.origin) && !admin();
      return `<section class="panel review-box"><h2>${p.collection === 'ninegrade' ? 'Approve this Ninegrade paper?' : `Offered to the Ninegrade bank by ${nm(p.owner_id)}`}</h2>
        <p class="small">${esc(ORIGIN[p.origin] || '')}${p.permission_confirmed && p.collection !== 'ninegrade' ? ' · they confirmed they wrote it or have permission, and that Ninegrade may keep and share it' : ''}${p.review_note && p.review === 'offered' ? ` · “${esc(p.review_note)}”` : ''}</p>
        ${['exam_board', 'publisher'].includes(p.origin) ? '<p class="msg info small">From an exam board or publisher: only approve it if Ninegrade has written permission from whoever owns it.</p>' : ''}
        <p class="muted small">Check the questions and answers below. If you approve it, it becomes Ninegrade's and every family with ${TR[p.track || 'gcse']} can use it.</p>
        <label for="rv-note">Note to them <small>optional, shown if you ask for changes or turn it down</small><input id="rv-note" maxlength="300"></label>
        <div class="row">${ownerOnly ? '<span class="muted small">Only the site owner can approve exam board or publisher papers.</span>' : '<button class="btn primary sm" data-rv="approve">Approve</button>'}<button class="btn ghost sm" data-rv="changes">Ask for changes</button><button class="btn ghost sm" data-rv="decline">Turn down</button></div><div id="rv-msg"></div></section>`;
    }
    function wireReview(p) {
      app.querySelectorAll('[data-rv]').forEach((b) => { b.onclick = async () => { b.disabled = true;
        try { await api.review(p.id, b.dataset.rv, (document.getElementById('rv-note') || {}).value || ''); await refreshCounts(); paperPage(p.id); }
        catch (x) { b.disabled = false; document.getElementById('rv-msg').innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } }; });
      const rs = document.getElementById('bresub');
      if (rs) rs.onclick = async () => { rs.disabled = true; try { await api.resubmit(p.id); paperPage(p.id); } catch (x) { rs.disabled = false; document.getElementById('bs-msg').innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } };
    }
    async function reviewPage() {
      if (!staff()) return listPage();
      let papers; try { papers = await api.papers(); } catch (x) { return shell('bank-review', page(`<div class="narrow"><section class="panel"><p class="msg err">${esc(nice(x))}</p></section></div>`)); }
      const offers = papers.filter((p) => p.collection !== 'ninegrade' && p.review === 'offered');
      const pend = papers.filter((p) => p.collection === 'ninegrade' && p.review === 'pending');
      await loadNames([...offers, ...pend]); queueN = offers.length + (admin() ? pend.length : 0);
      const row = (p) => card(p, ` · ${p.collection === 'ninegrade' ? `added by ${nm(p.added_by)}` : `from ${nm(p.owner_id)}`} · ${esc(ORIGIN[p.origin] || '')}`);
      shell('bank-review', page(`<div class="narrow"><div class="page-head"><a class="small" href="#bank">← Question bank</a><p class="kicker dark">${admin() ? 'Owner' : 'Bank manager'}</p><h1>Bank approvals</h1>
        <p class="muted">Papers waiting to go in the Ninegrade bank. Open one to check its questions and answers, then approve it, ask for changes or turn it down. Every decision is logged.</p></div>
        <section class="panel"><h2>Offered by parents${offers.length ? ` <span class="count">${offers.length}</span>` : ''}</h2>${offers.length ? offers.map(row).join('') : '<p class="muted">Nothing waiting.</p>'}</section>
        ${admin() || pend.length ? `<section class="panel"><h2>Exam board or publisher papers from bank managers${pend.length ? ` <span class="count">${pend.length}</span>` : ''}</h2><p class="muted small">${admin() ? 'Only you can approve these.' : 'Waiting for the site owner.'}</p>${pend.length ? pend.map(row).join('') : '<p class="muted">Nothing waiting.</p>'}</section>` : ''}</div>`));
    }
    async function refreshCounts() {
      if (!staff()) { queueN = 0; return; }
      try { const ps = await api.papers(); queueN = ps.filter(inQueue).length; } catch (e) { queueN = 0; }
    }
    function wireDelete(p) {
      const del = document.getElementById('bdel');
      if (del) del.onclick = async () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Press again to delete it for everyone'; del.classList.add('danger'); return; }
        del.disabled = true; try { await api.removePaper(p.id); location.hash = '#bank'; } catch (x) { del.disabled = false; document.getElementById('bs-msg').innerHTML = `<p class="msg err">${esc(nice(x))}</p>`; } };
    }

    function nav() {
      const n = isUser() && (practice.myStudents().length || me().role === 'teacher' || staff()) ? [['bank', 'Question bank']] : [];
      if (staff()) n.push(['bank-review', `Bank approvals${queueN ? ` <span class="count">${queueN}</span>` : ''}`]);
      return n;
    }
    async function route(r) {
      if (!me() || !me().role) return false;
      if (r === 'bank') { await listPage(); return true; }
      if (r === 'bank-add') { addPage(); return true; }
      if (r === 'bank-review') { await reviewPage(); return true; }
      if (r.startsWith('bank-')) { await paperPage(r.slice(5)); return true; }
      return false;
    }
    return { nav, route, refreshCounts, reset: () => api.reset && api.reset(), papers: async () => { try { return isUser() ? await api.papers() : []; } catch (e) { return []; } } };
  };
})();
