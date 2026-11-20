const { test, expect, signIn, signOut, go, noSideScroll } = require('./helpers');

test('question bank lists my papers, shared papers and the Ninegrade bank, under More', async ({ page }) => {
  await signIn(page, 'usman');
  await expect(page.locator('.nav a[href="#bank"]')).toHaveCount(1);
  await go(page, '#bank');
  await expect(page.locator('.panel', { hasText: 'My papers' })).toContainText('Physics Paper A.1');
  await expect(page.locator('.panel', { hasText: 'Ninegrade GCSE bank' })).toContainText('Percentages starter');
  await expect(page.locator('.panel', { hasText: 'Ninegrade 11+ bank' })).toContainText('Synonyms and antonyms');
  await page.fill('#bj-code', 'nope');
  await page.click('#bjoin button');
  await expect(page.locator('#bj-msg')).toContainText("doesn't match");
  await page.fill('#bj-code', 'demo1234');
  await page.click('#bjoin button');
  await expect(page).toHaveURL(/#bank-bp3/);
  await expect(page.locator('body')).toContainText('shared with you');
  await noSideScroll(page);
});

test('make practice now: next ones not done yet, ready straight away with the answer sheet', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#bank-bp1');
  await page.fill('#b-n', '3');
  await expect(page.locator('#b-preview')).toContainText('1c, 1d, 1e');
  await page.click('#b-go');
  await expect(page).toHaveURL(/#pset-/);
  await expect(page.locator('.status-draft')).toBeVisible();
  await expect(page.locator('.lesson').first()).toContainText('displacement can');
  await page.locator('#pans summary').click();
  await expect(page.locator('#pans')).toContainText('For the parent only');
  // Next time it carries on from 2a.
  await go(page, '#bank-bp1');
  await page.fill('#b-n', '2');
  await expect(page.locator('#b-preview')).toContainText('2a, 2b');
});

test('make practice: got wrong before, one topic, and pick by hand', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#bank-bp1');
  await page.check('input[name=bmode][value=wrong]');
  await expect(page.locator('#b-preview')).toContainText('1b');
  await page.check('input[name=bmode][value=topic]');
  await page.selectOption('#b-topic', 'Circuits');
  await page.fill('#b-n', '10');
  await expect(page.locator('#b-preview')).toContainText('5 questions');
  await page.check('input[name=bmode][value=pick]');
  await page.locator('.bq-pick input').nth(9).check();
  await expect(page.locator('#b-preview')).toContainText('1 question (3 marks): 2e');
});

test('owner edits a question; sharing needs permission and gives a code', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#bank-bp1');
  await page.locator('[data-bedit]').first().click();
  await page.fill('.be-q', 'Describe particles in a solid and a gas.');
  await page.fill('.be-a', 'Solid: fixed, vibrate. Gas: far apart, random.');
  await page.click('.bq-edit button.primary');
  await expect(page.locator('.bq-text').first()).toHaveText('Describe particles in a solid and a gas.');
  await page.click('[data-bshare=shared]');
  await expect(page.locator('#bs-msg')).toContainText('Tick the box');
  await page.check('#bs-perm');
  await page.click('[data-bshare=shared]');
  await expect(page.locator('#bcode')).toHaveText(/^[A-Z0-9]{6,}$/);
  await page.click('[data-bshare=private]');
  await expect(page.locator('#bcode')).toHaveCount(0);
});

test('students never see the question bank', async ({ page }) => {
  await signIn(page, 'hadi');
  await expect(page.locator('.nav a[href="#bank"]')).toHaveCount(0);
  await go(page, '#bank');
  await expect(page.locator('body')).toContainText('for parents and teachers');
  await go(page, '#bank-bp1');
  await expect(page.locator('body')).not.toContainText('displacement can');
});

test('add a paper straight to the bank: it waits for the evening run, then practice can be made from the Practice page', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#bank-add');
  await page.fill('#ba-title', 'Physics Mock A');
  await page.fill('#ba-q', '1. What is density? (2 marks)');
  await page.click('#ba-go');
  await expect(page.locator('#ba-msg')).toContainText('Add the answers');
  await page.check('input[name=borigin][value=exam_board]');
  await page.fill('#ba-a', '1. mass ÷ volume (2)');
  await page.click('#ba-go');
  await expect(page).toHaveURL(/#bank-bp\d+/);
  await expect(page.locator('.panel h2').first()).toHaveText('Being added');
  await go(page, '#bank');
  await expect(page.locator('.pset-card', { hasText: 'Physics Mock A' })).toContainText('Being added');
  // From the Practice page, choose a bank paper and go straight to choosing questions for this child.
  await go(page, '#pnew-hadi');
  await expect(page.locator('#p-bank-pick option').first()).toContainText('Physics Mock A');
  await expect(page.locator('#p-bank-pick option').first()).toContainText('(being added)');
  await page.selectOption('#p-bank-pick', 'bp1');
  await page.click('#p-bank-go');
  await expect(page).toHaveURL(/#bank-bp1/);
  await expect(page.locator('#bform')).toBeVisible();
  await noSideScroll(page);
});

test('make a mock (ready now) and a quiz (sent to the evening run) from the bank', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#bank-bp1');
  await page.check('input[name=bkind][value=mock]');
  await page.fill('#b-n', '2');
  await page.fill('#b-min', '20');
  await expect(page.locator('#b-go')).toHaveText('Make it now');
  await page.click('#b-go');
  await expect(page).toHaveURL(/#pset-/);
  await expect(page.locator('.status-draft')).toBeVisible();
  await expect(page.locator('.lesson').first()).toContainText('Mock exam');
  await go(page, '#bank-bp1');
  await page.check('input[name=bkind][value=quiz]');
  await expect(page.locator('#b-go')).toHaveText('Send to Ninegrade');
  await page.click('#b-go');
  await expect(page).toHaveURL(/#pset-/);
  await expect(page.locator('.status-requested')).toBeVisible();
});

test('papers are tagged Original, and "Similar new questions" goes to the evening run', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#bank');
  await expect(page.locator('.panel', { hasText: 'My papers' })).toContainText('Original');
  await go(page, '#bank-bp1');
  await expect(page.locator('.page-head')).toContainText('Original');
  await page.check('input[name=bkind][value=similar]');
  await expect(page.locator('#b-go')).toHaveText('Send to Ninegrade');
  await page.click('#b-go');
  await expect(page).toHaveURL(/#pset-/);
});
