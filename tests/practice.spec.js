const { test, expect, signIn, signOut, go, noSideScroll } = require('./helpers');

test('parent asks for a practice set, checks a draft with its answer sheet and assigns it', async ({ page }) => {
  await signIn(page, 'usman');
  await expect(page.locator('.nav a', { hasText: 'Practice' })).toHaveCount(1); // on the bar, or under More on a phone
  await go(page, '#pnew-hadi');
  await page.uncheck('input[name=kind][value=quiz]');
  await page.click('#p-go');
  await expect(page.locator('#p-msg')).toContainText('Tick at least one');
  await page.check('input[name=kind][value=practice]');
  await page.click('#p-go');
  await expect(page.locator('#p-msg')).toContainText('Paste some text');
  await page.fill('#p-text', 'Worksheet: fractions of amounts, questions 1 to 10');
  await page.fill('#p-note', 'Foundation, 8 questions');
  await page.click('#p-go');
  await expect(page).toHaveURL(/#practice-hadi/);
  await expect(page.locator('#flash')).toContainText('evening run');
  await expect(page.locator('.panel', { hasText: 'Being prepared' }).locator('.pset-card')).toHaveCount(2);

  await go(page, '#pset-ps2');
  await page.locator('#pans summary').click();
  await expect(page.locator('#pans')).toContainText('Mark scheme');
  await page.click('[data-pact=assign]');
  await expect(page.locator('.status-assigned h2')).toHaveText('Assigned');
  await noSideScroll(page);
});

test('parent can ask for changes, which sends the set back to Claude', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#pset-ps2');
  await page.click('[data-pact=changes]');
  await page.fill('#pchg-t', 'Make it a bit shorter');
  await page.click('#pchg button');
  await expect(page.locator('.status-requested h2')).toHaveText('Being prepared');
  await expect(page.locator('.status-requested')).toContainText('Changes: Make it a bit shorter');
});

test('"Make another like this" starts a new request based on the set', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#pset-ps1');
  await page.click('a[href="#plike-ps1"]');
  await expect(page.locator('h1')).toHaveText('Make another like this');
  await expect(page.locator('#p-text')).toHaveCount(0);
  await page.click('#p-go');
  await expect(page).toHaveURL(/#practice-hadi/);
});

test('student sees only assigned sets, does the quiz, and never sees answer sheets', async ({ page }) => {
  await signIn(page, 'hadi');
  await go(page, '#practice');
  await expect(page.locator('.pset-card .lc-title')).toHaveText(['Fractions of amounts']);
  await go(page, '#pset-ps3');
  await expect(page.locator('h1')).toHaveText('Not found');
  await go(page, '#pset-ps1');
  await expect(page.locator('#pans')).toHaveCount(0);
  await page.fill('#pq0', '9'); await page.fill('#pq1', '5'); await page.fill('#pq2', '30');
  await page.check('input[name=pq3][value="0"]');
  await page.click('#pw-go');
  await expect(page.locator('#pw-msg')).toContainText('You got 3 out of 4');
  await page.click('#pw-again');
  await expect(page.locator('.sub')).toHaveCount(1);
  await expect(page.locator('#psend h2')).toHaveText('Have another go');
  await noSideScroll(page);
});

test('written answers are sent, and the parent can mark them', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#pset-ps2');
  await page.click('[data-pact=assign]');
  await expect(page.locator('.status-assigned')).toBeVisible();
  await signOut(page);
  await signIn(page, 'hadi');
  await go(page, '#pset-ps2');
  await page.click('#pw-go');
  await expect(page.locator('#pw-msg')).toContainText('Type your answers');
  await page.fill('#pw-ans', 'Dear Council, please keep the youth club open.');
  await page.reload();
  await expect(page.locator('#pw-ans')).toHaveValue(/youth club/); // draft kept
  await page.click('#pw-go');
  await expect(page.locator('.sub')).toHaveCount(1);
  await expect(page.locator('.sub')).toContainText('Waiting for marking');
  await signOut(page);
  await signIn(page, 'usman');
  await go(page, '#pset-ps2');
  await page.locator('form[data-pmark] .pm').fill('20');
  await page.locator('form[data-pmark] .pmm').fill('40');
  await page.locator('form[data-pmark] .pfb').fill('Good start. Add a counter-argument.');
  await page.locator('form[data-pmark] button').click();
  await expect(page.locator('.sub .pill.done')).toHaveText('20 / 40');
});

test('a student working on their own can make practice for themselves', async ({ page }) => {
  await signIn(page, 'sam');
  await go(page, '#practice');
  await page.click('a[href="#pnew-sam"]');
  await page.fill('#p-text', 'My notes on cells');
  await page.click('#p-go');
  await expect(page).toHaveURL(/#practice-sam/);
  await expect(page.locator('.pset-card')).toHaveCount(1);
});

test('a student with a parent cannot make practice sets', async ({ page }) => {
  await signIn(page, 'hadi');
  await go(page, '#practice');
  await expect(page.locator('a[href^="#pnew-"]')).toHaveCount(0);
  await go(page, '#pnew-hadi');
  await expect(page.locator('#pform')).toHaveCount(0);
});

test('ticking all four makes four sets from one upload', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#pnew-hadi');
  for (const k of ['lesson', 'practice', 'mock']) await page.check(`input[name=kind][value=${k}]`);
  await page.fill('#p-text', 'Topic: rounding and estimating');
  await page.click('#p-go');
  await expect(page.locator('#flash')).toContainText('Sent 4 requests');
  await expect(page.locator('.panel', { hasText: 'Being prepared' }).locator('.pset-card')).toHaveCount(5);
});

test('subject is a list of the student\'s courses, with "Another subject" to type one', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#pnew-hadi');
  const opts = await page.locator('#p-subj-pick option').allTextContents();
  expect(opts.length).toBeGreaterThanOrEqual(5);
  expect(opts).toContain('Another subject…');
  await page.selectOption('#p-subj-pick', { index: 1 });
  await expect(page.locator('#p-subj')).toBeHidden();
  await page.selectOption('#p-subj-pick', '__other');
  await expect(page.locator('#p-subj')).toBeVisible();
  await page.fill('#p-subj', 'Computer Science');
  await page.fill('#p-text', 'Binary numbers');
  await page.click('#p-go');
  await expect(page).toHaveURL(/#practice-hadi/);
  await expect(page.locator('.pset-card', { hasText: 'Computer Science' })).toHaveCount(1);
});

test('parent uploads their own paper with answers: "as it is" and the answers are saved, and Hadi never sees them', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#pnew-hadi');
  await expect(page.locator('input[name=qmode][value=asis]')).toBeChecked();
  await page.uncheck('input[name=kind][value=quiz]');
  await page.check('input[name=kind][value=mock]');
  await page.check('input[name=kind][value=practice]');
  await page.fill('#p-text', 'Mock A: 1. Find 1/3 of 12. 2. Find 2/5 of 35.');
  await page.fill('#p-ans', '1. 4 (1 mark)  2. 14 (2 marks)');
  await page.click('#p-go');
  await expect(page.locator('#flash')).toContainText('Sent 2 requests');
  const ids = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('gcse-v2-practice-demo')); return s.sets.filter((x) => x.as_is).map((x) => [x.id, (s.given || {})[x.id]]); });
  expect(ids).toHaveLength(2);
  for (const [, g] of ids) expect(g.given_text).toContain('14 (2 marks)');
  await go(page, '#pset-' + ids[0][0]);
  await page.locator('summary', { hasText: 'What it was made from' }).click();
  await expect(page.locator('body')).toContainText('used exactly as given');
  await expect(page.locator('#pgiven')).toContainText('14 (2 marks)');
  // Assign it (pretend the run made it) and check Hadi can't see the answers.
  await page.evaluate((id) => { const k = 'gcse-v2-practice-demo'; const s = JSON.parse(localStorage.getItem(k)); const x = s.sets.find((y) => y.id === id); x.status = 'assigned'; x.body_html = '<p>1. Find 1/3 of 12.</p>'; localStorage.setItem(k, JSON.stringify(s)); }, ids[0][0]);
  await page.reload();
  await signOut(page);
  await signIn(page, 'hadi');
  await go(page, '#pset-' + ids[0][0]);
  await expect(page.locator('body')).toContainText('Find 1/3 of 12');
  await expect(page.locator('body')).not.toContainText('14 (2 marks)');
  await expect(page.locator('#pgiven')).toHaveCount(0);
});

test('"Write similar new questions" is saved as not as-is', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#pnew-hadi');
  await page.check('input[name=qmode][value=new]');
  await page.fill('#p-text', 'Fractions worksheet');
  await page.click('#p-go');
  await expect(page).toHaveURL(/#practice-hadi/);
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('gcse-v2-practice-demo')).sets[0]);
  expect(s.as_is).toBeFalsy();
});

test('the answer box is pre-filled with the set\'s numbered questions, and an untouched box counts as empty', async ({ page }) => {
  await signIn(page, 'usman');
  await page.evaluate(() => { const k = 'gcse-v2-practice-demo'; const s = JSON.parse(localStorage.getItem(k)) || { sets: [], answers: {}, attempts: [] };
    s.sets.unshift({ id: 'pt', student_id: 'hadi', created_by: 'usman', subject: 'Physics', kind: 'practice', title: 'Paper A', source_text: '', source_files: [], note: '', status: 'assigned', quiz: [], reply: '',
      body_html: '<h2>Question 1: Density</h2><p><b>1a.</b> Describe particles in a solid. <span class="marks">(2 marks)</span></p><p><b>1b.</b> Calculate the density. (3 marks)</p><h2>Question 2</h2><p><b>2a.</b> Name the meter for current.</p><p><b>Before you send:</b> check units.</p>',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    localStorage.setItem(k, JSON.stringify(s)); });
  await page.reload();
  await signOut(page);
  await signIn(page, 'hadi');
  await go(page, '#pset-pt');
  const v = await page.inputValue('#pw-ans');
  expect(v).toContain('Question 1: Density\n1a. Describe particles in a solid.\n   Answer: ');
  expect(v).toContain('2a. Name the meter for current.\n   Answer: ');
  expect(v).not.toContain('Before you send');
  expect(v).not.toContain('marks');
  await page.click('#pw-go');
  await expect(page.locator('#pw-msg')).toContainText('Type your answers');
  await page.fill('#pw-ans', v.replace('1a. Describe particles in a solid.\n   Answer: ', '1a. Describe particles in a solid.\n   Answer: close together, vibrate'));
  await page.click('#pw-go');
  await expect(page.locator('#pw-msg')).toContainText('Sent');
});

test('practice lessons have Write it from memory; quizzes and other sets do not', async ({ page }) => {
  await signIn(page, 'hadi');
  await go(page, '#pset-ps1');
  await expect(page.locator('#memo-open')).toHaveCount(0);
  await page.evaluate(() => { const k = 'gcse-v2-practice-demo'; const s = JSON.parse(localStorage.getItem(k)) || { sets: [], answers: {}, attempts: [] };
    s.sets.unshift({ id: 'pl', student_id: 'hadi', created_by: 'usman', subject: 'Physics', kind: 'lesson', title: 'States of matter', source_text: '', source_files: [], note: '', status: 'assigned', quiz: [], reply: '',
      body_html: '<h2>1. Learn it</h2><p>A solid keeps its shape.</p><h2>2. Your turn</h2><p><strong>1.</strong> Describe a solid.</p>', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    localStorage.setItem(k, JSON.stringify(s)); });
  await page.reload();
  await go(page, '#pset-pl');
  await page.click('#memo-open');
  await expect(page.locator('.learn-zone')).toHaveClass(/covered/);
  await page.fill('.memo-text', 'A solid keeps');
  await page.click('#pw-ans');
  await expect(page.locator('#memo')).toBeHidden();
  await expect(page.locator('.learn-zone')).not.toHaveClass(/covered/);
});

test('quiz timer: corner clock, pauses when the page is hidden, and the time is saved with the try', async ({ page }) => {
  await signIn(page, 'hadi');
  await go(page, '#pset-ps1');
  await expect(page.locator('.ngt-corner')).toBeVisible();
  await expect(page.locator('#pw-min')).toHaveCount(0);
  // switch tab, then come back
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.ngt-corner')).toHaveClass(/paused/);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.ngt-corner')).not.toHaveClass(/paused/);
  await page.fill('#pq0', '9');
  await page.click('#pw-go');
  await expect(page.locator('#pw-msg')).toContainText('You got');
  const a = await page.evaluate(() => JSON.parse(localStorage.getItem('gcse-v2-practice-demo')).attempts[0]);
  expect(a.away_count).toBe(1);
  expect(a.minutes_taken).toBe(1);
  await page.click('#pw-again');
  await expect(page.locator('.sub').first()).toContainText('left the page once');
});
