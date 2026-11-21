const { test, expect, signIn, signOut, go, noSideScroll } = require('./helpers');

const openMore = async (page) => { const m = page.locator('.nav-more summary'); if (await m.count()) await m.click(); };

test('owner switches 11+ on for a parent, makes a bank manager, and every change is logged', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#everyone');
  const row = page.locator('table.acc tr', { hasText: 'Mrs Okafor' });
  await row.locator('[data-tr=elevenplus]').check();
  await expect(page.locator('#acc-msg')).toContainText('11+ switched on for Mrs Okafor');
  await page.locator('table.acc tr', { hasText: 'Mrs Okafor' }).locator('[data-mgr]').check();
  await expect(page.locator('#acc-msg')).toContainText('is now a bank manager');
  await expect(page.locator('.log-list')).toContainText('11+ access on');
  await expect(page.locator('.log-list')).toContainText('Made bank manager');
  // Can't switch off both tracks.
  await page.locator('table.acc tr', { hasText: 'Priya Shah' }).locator('[data-tr=elevenplus]').click();
  await expect(page.locator('#acc-msg')).toContainText('Leave at least one');
  await noSideScroll(page);
});

test('a bank manager changes 11+ only, under More', async ({ page }) => {
  await signIn(page, 'teacher');
  await openMore(page);
  await page.click('a[href="#everyone"]');
  await expect(page.locator('h1')).toHaveText('11+ access');
  await expect(page.locator('table.acc tr', { hasText: 'Mrs Okafor' }).locator('[data-tr=gcse]')).toBeDisabled();
  await expect(page.locator('[data-mgr]')).toHaveCount(0);
  await page.locator('table.acc tr', { hasText: 'Mrs Okafor' }).locator('[data-tr=elevenplus]').check();
  await expect(page.locator('#acc-msg')).toContainText('11+ switched on');
});

test('an 11+ parent sees only 11+: tests in the plan wizard, the Ninegrade 11+ bank, no GCSE', async ({ page }) => {
  await signIn(page, 'priya');
  await expect(page.locator('.logo-words small')).toHaveText('11+');
  await expect(page.locator('a[href="#boards"]')).toHaveCount(0);
  await expect(page.locator('.person-card', { hasText: 'Zara' })).toContainText('11+');
  await page.locator('.person-card', { hasText: 'Zara' }).locator('a[href^="#plan-for-"]').click();
  await expect(page.locator('h2')).toHaveText('Which 11+ test?');
  await expect(page.locator('.opt', { hasText: 'Pearson Edexcel' })).toHaveCount(0);
  await page.click('.opt:has-text("Kent Test")');
  await page.click('.opt:has-text("Non-verbal reasoning")');
  await expect(page.locator('#series option').first()).toContainText('September');
  await page.click('#when button');
  await expect(page.locator('.summary')).toContainText('Kent Test 11+ Non-verbal reasoning');
  await page.click('#create');
  await expect(page.locator('h1')).toContainText('Non-verbal reasoning');
  // Bank: 11+ papers only, read-only.
  await go(page, '#bank');
  await expect(page.locator('.panel', { hasText: 'Ninegrade 11+ bank' })).toContainText('Synonyms and antonyms');
  await expect(page.locator('body')).not.toContainText('Percentages starter');
  await page.click('a[href="#bank-bp4"]');
  await expect(page.locator('[data-bedit]')).toHaveCount(0);
  await expect(page.locator('body')).toContainText('belongs to Ninegrade');
  await page.click('#b-go');
  await expect(page).toHaveURL(/#pset-/);
  await noSideScroll(page);
});

test('a parent offers a paper to the Ninegrade bank; a bank manager approves it', async ({ page }) => {
  await signIn(page, 'priya');
  await go(page, '#bank-add');
  await page.fill('#ba-title', 'Priya VR set');
  await page.fill('#ba-q', '1. Find the hidden word.');
  await page.fill('#ba-a', '1. cat');
  await page.click('#ba-go');
  await expect(page).toHaveURL(/#bank-bp\d+/);
  const id = page.url().split('#bank-')[1];
  await page.evaluate((pid) => { const k = 'gcse-v2-bank-demo'; const S = JSON.parse(localStorage.getItem(k)); const p = S.papers.find((x) => x.id === pid); p.status = 'ready';
    S.questions.push({ id: pid + '-q1', paper_id: pid, position: 1, num: '1', section: '', question: 'Find the hidden word.', marks: 1, topic: 'Hidden words', answer: 'cat' },
      { id: pid + '-q2', paper_id: pid, position: 2, num: '2', section: '', question: 'Opposite of tall.', marks: 1, topic: 'Antonyms', answer: '' }); localStorage.setItem(k, JSON.stringify(S)); }, id);
  await page.reload();
  await page.click('#boffer');
  await expect(page.locator('#bo-msg')).toContainText('Tick the box');
  await page.check('#boffer-perm');
  await page.click('#boffer');
  await expect(page.locator('.offer-box')).toContainText('Waiting for Ninegrade');
  await signOut(page);
  await signIn(page, 'teacher');
  await go(page, '#bank-review');
  await expect(page.locator('.panel', { hasText: 'Offered by parents' })).toContainText('Priya VR set');
  await page.click(`a[href="#bank-${id}"]`);
  await expect(page.locator('.review-box')).toContainText('Priya Shah');
  // check question by question: the one with no answer is at the top
  await expect(page.locator('.ck-count')).toContainText('0 of 2 checked');
  await expect(page.locator('.ck-row').first()).toContainText('No answer uploaded');
  await expect(page.locator('[data-rv=approve]')).toBeDisabled();
  await page.click('[data-rv=decline]');
  await expect(page.locator('#rv-msg')).toContainText('Add a short reason');
  await page.locator('.ck-row').first().locator('[data-ck-no]').click();
  await page.locator('.ck-row').first().locator('[data-ck-form] button.primary').click();
  await expect(page.locator('.ck-row').first()).toContainText('Type the correct answer');
  await page.locator('.ck-row').first().locator('.ck-ans').fill('short');
  await page.locator('.ck-row').first().locator('[data-ck-form] button.primary').click();
  await expect(page.locator('.ck-count')).toContainText('1 of 2 checked');
  await expect(page.locator('.ck-row', { hasText: 'Opposite of tall' })).toContainText('Corrected');
  await page.locator('.ck-row', { hasText: 'hidden word' }).locator('[data-ck-yes]').click();
  await expect(page.locator('.ck-count')).toContainText('2 of 2 checked');
  await expect(page.locator('.ck-corr')).toContainText('Q2 answer');
  await noSideScroll(page);
  await page.click('[data-rv=approve]');
  await expect(page.locator('.page-head')).toContainText('contributed by Priya Shah');
  await expect(page.locator('#bdel')).toHaveCount(0); // only the owner deletes Ninegrade papers
  await signOut(page);
  await signIn(page, 'priya');
  await go(page, '#bank');
  await expect(page.locator('.panel', { hasText: 'Ninegrade 11+ bank' })).toContainText('Priya VR set');
});

test('invite codes carry tracks; a child code gives one; a new child can be 11+', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#invites');
  await page.check('input[name=inv-track][value=elevenplus]');
  await page.locator('.invite-box', { hasText: 'Parent' }).first().locator('button').click();
  await expect(page.locator('#flash')).toContainText('New code');
  await expect(page.locator('table.data')).toContainText('GCSE and 11+');
  await page.locator('.invite-box', { hasText: 'Your child' }).locator('button').click();
  await expect(page.locator('#flash')).toContainText('gives one track');
  await go(page, '#add-child');
  await page.fill('#k-name', 'Ella Test');
  await page.check('input[name=k-track][value=elevenplus]');
  await page.fill('#k-user', 'ella2027');
  await page.fill('#k-pw', 'password1');
  await page.click('#k-go');
  await go(page, '#home');
  await expect(page.locator('.person-card', { hasText: 'Ella Test' })).toContainText('11+');
});
