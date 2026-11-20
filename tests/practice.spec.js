const { test, expect, signIn, signOut, go, noSideScroll } = require('./helpers');

test('parent asks for a practice set, checks a draft with its answer sheet and assigns it', async ({ page }) => {
  await signIn(page, 'usman');
  await expect(page.locator('.nav a', { hasText: 'Practice' })).toBeVisible();
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
