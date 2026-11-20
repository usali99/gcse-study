const { test, expect, signIn, go, noSideScroll } = require('./helpers');

test.beforeEach(async ({ page }) => { await signIn(page, 'usman'); });

test('marking: answer sheet opens and a mark saves', async ({ page }) => {
  await signInHadiAndSend(page);
  await signIn(page, 'usman');
  await go(page, '#marking');
  await page.locator('details.other summary').first().click();
  await expect(page.locator('details.other .lesson').first()).not.toContainText('Loading');
  await page.fill('input[id^=m-]', '8');
  await page.fill('input[id^=mm-]', '9');
  await page.fill('textarea[id^=fb-]', 'Good.');
  await page.locator('.mark-form button').first().click();
  await expect(page.locator('[data-filter=todo]')).toContainText('(0)');
});

test('marked work can be filtered by subject', async ({ page }) => {
  await go(page, '#marking-done');
  await page.click('[data-subj=english]');
  await expect(page.locator('form[data-mark]')).toHaveCount(1);
  await page.click('[data-subj=all]');
  await expect(page.locator('form[data-mark]')).toHaveCount(2);
});

test('parent sees answer sheets and "Missed" labels', async ({ page }) => {
  await go(page, '#lesson-d4');
  await expect(page.locator('#answer-sheet h2')).toBeAttached();
  await page.clock.install({ time: Date.now() + 3 * 864e5 });
  await go(page, '#lessons');
  await expect(page.locator('.pill.missed').first()).toHaveText('Missed');
});

test('weak topics status saves', async ({ page }) => {
  await go(page, '#topics');
  await page.selectOption('[data-topic="2"]', 'Improving');
  await expect(page.locator('#topic-msg')).toContainText('Saved');
  await noSideScroll(page);
});

test('weekly timetable saves, and a lesson update request is listed', async ({ page }) => {
  const tt = await page.locator('a[href^="#timetable-"]').first().getAttribute('href');
  await go(page, tt);
  await page.click('#t-save');
  await expect(page.locator('#t-msg .msg')).toBeVisible();
  await page.fill('#lu-note', 'More maths please');
  await page.click('#lu-send');
  await expect(page.locator('#lu-list li')).toContainText('More maths please');
  await expect(page.locator('#lu-send')).toContainText('Add another note');
  await noSideScroll(page);
});

test('edit plan accepts quarter hours and keeps ticked weeks', async ({ page }) => {
  const href = await page.locator('a.course[href^="#course-"]').first().getAttribute('href');
  await go(page, href.replace('course', 'edit'));
  await page.check('[data-done="0"]');
  await page.click('#save-weeks');
  await expect(page.locator('#e-msg .msg')).toBeVisible();
  await page.fill('#e-hours', '3.75');
  await page.click('#basics button');
  await expect(page.locator('#e-msg .msg.ok')).toBeVisible();
  await expect(page.locator('[data-done="0"]')).toBeChecked();
});

async function signInHadiAndSend(page) {
  await page.click('#signout');
  await signIn(page, 'hadi');
  await go(page, '#lesson-d2');
  const box = page.locator('#answer');
  await box.fill((await box.inputValue()).replace('Answer:', 'Answer: test'));
  await page.fill('#mins', '5');
  await page.click('#send-btn');
  await expect(page.locator('.msg.ok')).toBeVisible();
  await page.click('#signout');
}

test('weak topics can be filtered by subject', async ({ page }) => {
  await go(page, '#topics');
  await expect(page.locator('.chip')).toContainText(['All', 'English', 'Maths']);
  await page.click('[data-subj=maths]');
  await expect(page.locator('[data-topic]')).toHaveCount(1);
  await page.click('[data-subj=english]');
  await expect(page.locator('[data-topic]')).toHaveCount(2);
  await page.selectOption('[data-topic="2"]', 'Secure');
  await expect(page.locator('#topic-msg')).toContainText('Saved');
});

test('marking shows every subject button, even with nothing to mark', async ({ page }) => {
  await go(page, '#marking');
  await expect(page.locator('.chip')).toContainText(['All', 'English', 'Maths']);
  await page.click('[data-subj=maths]');
  await expect(page.locator('.panel')).toContainText('No Maths work waiting');
});
