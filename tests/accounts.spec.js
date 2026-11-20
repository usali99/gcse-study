const { test, expect, signIn, go, noSideScroll } = require('./helpers');

test('a student on their own can edit their plan', async ({ page }) => {
  await signIn(page, 'sam');
  await expect(page.locator('a[href^="#plan-for-"]').first()).toBeVisible();
  const course = await page.locator('.course').first().getAttribute('href');
  await go(page, course.replace('course', 'edit'));
  await expect(page.locator('#basics')).toBeVisible();
});

test('accounts outside the study area cannot open study pages', async ({ page }) => {
  await signIn(page, 'sam');
  await expect(page.locator('.nav a')).not.toContainText(['Today']);
  await go(page, '#today');
  await expect(page.locator('h1')).not.toContainText('Today');
  await go(page, '#lesson-d1');
  await expect(page.locator('#answer-sheet')).toHaveCount(0);
});

test('plan weeks that ended without a tick show "Behind"', async ({ page }) => {
  await page.clock.install({ time: Date.now() + 30 * 864e5 });
  await signIn(page, 'teacher');
  await expect(page.locator('.tag.behind').first()).toBeVisible();
});

test('school admin dashboard loads', async ({ page }) => {
  await signIn(page, 'head');
  await expect(page.locator('h1')).toBeVisible();
});

test('Invite codes and Exam boards sit under More', async ({ page }) => {
  await signIn(page, 'usman');
  await expect(page.locator('.nav > a', { hasText: 'Invite codes' })).toHaveCount(0);
  await page.click('.nav-more summary');
  await expect(page.locator('.more-menu a')).toContainText(['Invite codes', 'Exam boards']);
  await expect(page.locator('.more-menu')).toBeInViewport();
  await page.click('.more-menu a[href="#boards"]');
  await expect(page).toHaveURL(/#boards/);
  await expect(page.locator('.nav-more summary')).toHaveAttribute('aria-current', 'page');
  await page.click('.nav-more summary');
  await page.keyboard.press('Escape');
  await expect(page.locator('.more-menu')).toBeHidden();
  await noSideScroll(page);
});

test('the top bar never needs side-scrolling: extra tabs move under More', async ({ page }) => {
  await signIn(page, 'usman');
  const over = await page.evaluate(() => { const n = document.querySelector('.nav'); return n.scrollWidth - n.clientWidth; });
  expect(over).toBeLessThanOrEqual(1);
  await expect(page.locator('.nav > a').first()).toBeInViewport();
});
