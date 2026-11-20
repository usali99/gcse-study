const { test, expect, go, noSideScroll, isPhone } = require('./helpers');

test('landing page shows the brand and the example dashboard', async ({ page }, info) => {
  await go(page, '');
  await expect(page).toHaveTitle(/Ninegrade/);
  await expect(page.locator('.logo-mark').first()).toHaveText('9');
  await expect(page.getByText('Everything a study year needs, in one place')).toBeVisible();
  await expect(page.locator('#dh-wrap')).toBeVisible();
  await expect(page.locator('.tracks-band')).toContainText('Kent Test');
  // Made-up data only in the marketing picture.
  await expect(page.locator('#dh-wrap')).not.toContainText('Hadi');
  await noSideScroll(page);
  if (isPhone(info)) await expect(page.locator('#dh-wrap .dh-laptop')).toBeHidden();
});

test('student sign-up has a "Request an invite" link', async ({ page }) => {
  await go(page, '#signup');
  await page.click('[data-role=student]');
  await page.click('a[href="#request"]');
  await expect(page).toHaveURL(/#request/);
});
