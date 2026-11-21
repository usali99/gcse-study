const { test, expect, signIn, go, noSideScroll } = require('./helpers');

test.beforeEach(async ({ page }) => { await signIn(page, 'hadi'); });

test('menu shows study pages, and lessons are listed', async ({ page }) => {
  await expect(page.locator('.nav a')).toContainText(['Dashboard', 'Today', 'All lessons', 'My progress']);
  await go(page, '#lessons');
  await expect(page.locator('.lesson-card').first()).toBeVisible();
  await noSideScroll(page);
});

test('memory quiz marks itself and shows the last try', async ({ page }) => {
  await go(page, '#lesson-d2');
  await page.check('input[name=q0][value="1"]');
  await page.fill('#q1', 'extract');
  await page.click('#quiz button[type=submit]');
  await expect(page.locator('#quiz-score')).toContainText('/');
  await page.reload();
  await expect(page.locator('#quiz-score')).toContainText('/');
});

test('answer box: template prefilled, blank send blocked, draft kept on reload, then sends', async ({ page }) => {
  await go(page, '#lesson-d2');
  const box = page.locator('#answer');
  await expect(box).toHaveValue(/Answer:/);
  await page.click('#send-btn');
  await expect(page.locator('#send-msg')).toContainText(/answer|write/i);
  await box.fill((await box.inputValue()).replace('Answer:', 'Answer: My sentences'));
  await page.reload();
  await expect(box).toHaveValue(/My sentences/);
  await page.fill('#mins', '12');
  await page.click('#send-btn');
  await expect(page.locator('.msg.ok')).toBeVisible();
  await expect(page.locator('#send-btn')).toContainText(/again/i);
});

test('progress page filters by subject and opens only the newest feedback', async ({ page }) => {
  await go(page, '#progress');
  await expect(page.locator('.chip')).toContainText(['All', 'English', 'Maths']);
  await expect(page.locator('details.mw').first()).toHaveAttribute('open', '');
  await expect(page.locator('details.mw').nth(1)).not.toHaveAttribute('open', '');
  await page.click('[data-subj=maths]');
  await expect(page.locator('.stat').first()).toContainText('Maths lessons with work sent');
  await expect(page.locator('details.mw')).toHaveCount(1);
  await expect(page.locator('details.mw summary')).toContainText('Percentages');
  await noSideScroll(page);
});

test('a student with a parent sees plans read-only', async ({ page }) => {
  const tt = await page.locator('a[href^="#timetable-"]').first().getAttribute('href');
  await go(page, tt);
  await expect(page.locator('.msg.info')).toBeVisible();
  await expect(page.locator('#t-save')).toHaveCount(0);
  await expect(page.locator('.msg.info')).toContainText(/parent/i);
  await expect(page.locator('a[href^="#plan-for-"]')).toHaveCount(0);
  await go(page, '#home');
  const course = await page.locator('.course').first().getAttribute('href');
  await go(page, course);
  await expect(page.locator('.timeline, .page-head').first()).toBeVisible();
  await expect(page.locator('a[href^="#edit-"]')).toHaveCount(0);
});

test('a past lesson with no work shows "Missed, please catch up"', async ({ page }) => {
  await page.clock.install({ time: Date.now() + 3 * 864e5 });
  await go(page, '#lessons');
  await expect(page.locator('.pill.missed').first()).toContainText('Missed, please catch up');
});

test('All lessons: subject and status filters work together', async ({ page }) => {
  await go(page, '#lessons');
  await expect(page.locator('[data-status]')).toContainText(['All', 'To do', 'Missed', 'Done']);
  await page.click('[data-status=done]');
  await expect(page.locator('.lesson-card')).toHaveCount(2); // d1 (English) and d3 (Maths) have work sent
  await page.click('[data-subj=maths]');
  await expect(page.locator('.lesson-card')).toHaveCount(1);
  await expect(page.locator('.lesson-card')).toContainText('Percentages');
  await page.click('[data-status=missed]');
  await expect(page.locator('.panel')).toContainText('Nothing missed');
  await noSideScroll(page);
});

test('All lessons: past weeks are folded with a summary', async ({ page }) => {
  await page.clock.install({ time: Date.now() + 21 * 864e5 });
  await go(page, '#lessons');
  const wk1 = page.locator('details[data-wk="1"]');
  await expect(wk1).not.toHaveAttribute('open', '');
  await expect(page.locator('.panel', { has: wk1 })).toContainText(/\d of \d done/);
  await wk1.locator('summary').click();
  await expect(wk1.locator('.lesson-card').first()).toBeVisible();
});

test('Write it from memory: covers the Learn it notes, counts words, nothing kept after closing', async ({ page }) => {
  await go(page, '#lesson-d2');
  await expect(page.locator('#memo')).toBeHidden();
  await page.click('#memo-open');
  await expect(page.locator('#memo')).toBeVisible();
  await expect(page.locator('.learn-zone')).toHaveClass(/covered/);
  await page.fill('.memo-text', 'Split long sentences at commas');
  await expect(page.locator('.memo-count')).toHaveText('5 words');
  await page.click('.memo-cover');
  await expect(page.locator('.learn-zone')).not.toHaveClass(/covered/);
  await page.click('.memo-clear');
  await expect(page.locator('.memo-text')).toHaveValue('');
  await page.fill('.memo-text', 'again');
  await page.click('.memo-x');
  await expect(page.locator('#memo')).toBeHidden();
  await expect(page.locator('.learn-zone')).not.toHaveClass(/covered/);
  await page.click('.memo-inline');
  await expect(page.locator('.memo-text')).toHaveValue('');
  // clicking into the real answer box clears and closes it
  await page.fill('.memo-text', 'something to copy');
  await page.click('#answer');
  await expect(page.locator('#memo')).toBeHidden();
  await page.click('#memo-open');
  await expect(page.locator('.memo-text')).toHaveValue('');
  await noSideScroll(page);
});

test('Rough paper: draw, undo, type, and add the page to the photos', async ({ page }) => {
  await go(page, '#lesson-d2');
  await page.click('#rough-open');
  await expect(page.locator('#rough')).toBeVisible();
  const box = await page.locator('#rough canvas').boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down(); await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 }); await page.mouse.up();
  await page.click('#rough [data-tool=type]');
  await page.fill('.rough-text', '15% of 300 = 45');
  await page.click('.rough-add');
  await expect(page.locator('.rough-add')).toHaveText('Type the question number');
  await page.fill('.rough-qn', 'Q1');
  await page.click('.rough-add');
  await expect(page.locator('.rough-add')).toHaveText('✔ Added');
  expect(await page.locator('#photos').evaluate((i) => [...i.files].map((f) => f.name))).toEqual(['rough-paper-Q1.png']);
  await expect(page.locator('.fc')).toHaveCount(1);
  await page.click('#rough .memo-x');
  await page.click('.fc-see'); // open it to check before sending
  await expect(page.locator('.fc-view img')).toBeVisible();
  await page.click('.fc-view-x');
  await expect(page.locator('.fc-view')).toHaveCount(0);
  await page.click('.fc-x');
  await expect(page.locator('.fc')).toHaveCount(0);
  expect(await page.locator('#photos').evaluate((i) => i.files.length)).toBe(0);
  await page.click('#rough-open');
  await page.locator('#answer').focus(); // rough paper stays open while answering
  await expect(page.locator('#rough')).toBeVisible();
  await page.click('#rough .memo-x');
  await expect(page.locator('#rough')).toBeHidden();
  await noSideScroll(page);
});
