const { test, expect, signIn, signOut, go, noSideScroll } = require('./helpers');

test('All lessons has a Catch-up filter, and catch-up lessons are labelled', async ({ page }) => {
  await signIn(page, 'hadi');
  await go(page, '#lessons');
  await expect(page.locator('[data-status]')).toContainText(['All', 'To do', 'Catch-up', 'Missed', 'Done']);
  await page.click('[data-status=catchup]');
  await expect(page.locator('.lesson-card')).toHaveCount(1);
  await expect(page.locator('.lesson-card')).toContainText('Fractions of amounts');
  await expect(page.locator('.pill.catchup')).toHaveText('Catch-up, do when you can');
  await page.click('[data-subj=english]');
  await expect(page.locator('.panel')).toContainText('Nothing to catch up on');
  await noSideScroll(page);
});

test('Today shows a Catch-up list', async ({ page }) => {
  await signIn(page, 'hadi');
  await go(page, '#today');
  await expect(page.getByRole('heading', { name: 'Catch-up' })).toBeVisible();
  await page.click('[data-go-catchup]');
  await expect(page.locator('[data-status=catchup]')).toHaveAttribute('aria-pressed', 'true');
});

test('parent adds an away day: lessons that day become catch-up and Hadi gets a day off', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#home');
  const tt = await page.locator('a[href^="#timetable-"]').first().getAttribute('href');
  await go(page, tt);
  await expect(page.locator('#away-box')).toContainText('No away days coming up');
  await page.selectOption('#aw-why', 'ill');
  await page.fill('#aw-note', 'Cold');
  await page.click('#away-form button');
  await expect(page.locator('#away-msg')).toContainText('Saved');
  await expect(page.locator('.away-row')).toContainText('Unwell');
  await noSideScroll(page);

  await signOut(page);
  await signIn(page, 'hadi');
  await go(page, '#today');
  await expect(page.locator('.away-today')).toContainText('Rest and get better');
  await go(page, '#lessons');
  await expect(page.locator('.pill.away').first()).toContainText('Unwell · catch-up');

  await signOut(page);
  await signIn(page, 'usman');
  await go(page, tt);
  await page.click('[data-away-del]');
  await expect(page.locator('#away-box')).toContainText('No away days coming up');
});

test('a student with a parent sees away days but cannot add them', async ({ page }) => {
  await signIn(page, 'hadi');
  await go(page, '#home');
  const tt = await page.locator('a[href^="#timetable-"]').first().getAttribute('href');
  await go(page, tt);
  await expect(page.locator('#away-box')).toContainText('Days off your parent');
  await expect(page.locator('#away-form')).toHaveCount(0);
});

test('auto-publish setting saves, and an automatically published week can be marked checked', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#lessons');
  await expect(page.locator('#auto-box')).toContainText('Sunday evening run');
  await page.check('#auto-pub');
  await expect(page.locator('#auto-msg')).toContainText('On.');
  await go(page, '#home');
  await go(page, '#lessons');
  await expect(page.locator('#auto-pub')).toBeChecked();
  // Pretend the Sunday run published week 2 because nobody checked it.
  await page.evaluate(() => { const k = 'gcse-v2-study-demo'; const s = JSON.parse(localStorage.getItem(k));
    s.lessons.forEach((l) => { if (l.week === 2) { l.status = 'published'; l.auto_published = true; } }); localStorage.setItem(k, JSON.stringify(s)); });
  await page.reload();
  await go(page, '#lessons');
  await expect(page.locator('.pill.auto').first()).toContainText('Published automatically, not checked');
  await page.click('[data-checked="2"]');
  await expect(page.locator('[data-checked]')).toHaveCount(0);
});

test('practice form: "instead of" this week\'s lessons is saved', async ({ page }) => {
  await signIn(page, 'usman');
  await go(page, '#home');
  const prac = await page.locator('a[href^="#practice-"]').first().getAttribute('href');
  await go(page, prac.replace('#practice-', '#pnew-'));
  await expect(page.locator('input[name=fit][value=extra]')).toBeChecked();
  await page.check('input[name=fit][value=instead]');
  await page.fill('#p-text', 'Fractions worksheet: 1/3 of 12, 2/5 of 35');
  await page.fill('#p-min', '30');
  await page.click('#p-go');
  await expect(page).toHaveURL(/#practice-/);
  const id = await page.evaluate(() => (JSON.parse(localStorage.getItem('gcse-v2-practice-demo')).sets || []).find((x) => x.replaces_lessons).id);
  await go(page, '#pset-' + id);
  await expect(page.locator('body')).toContainText('instead of some');
});
