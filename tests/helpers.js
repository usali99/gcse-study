// Shared test helpers. Every test starts with an empty preview, and fails on any page error.
const base = require('@playwright/test');

const test = base.test.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?preview');
    await page.evaluate(() => localStorage.clear());
    await use(page);
    base.expect(errors, 'JavaScript errors on the page').toEqual([]);
  },
});
const expect = base.expect;

// Demo accounts: usman (owner, Hadi's parent), hadi (student with a parent),
// sam (student on their own), teacher, head (school admin).
async function signIn(page, acct) {
  await page.goto('/?preview#signin');
  await page.click(`[data-acct=${acct}]`);
  await page.waitForSelector('.page-head, .study-strip, .lesson-card');
}
async function signOut(page) {
  await page.click('#signout');
}
async function go(page, hash) {
  await page.goto('/?preview' + hash);
}
async function noSideScroll(page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, 'page is wider than the screen').toBeLessThanOrEqual(1);
}
const isPhone = (testInfo) => testInfo.project.name === 'phone';

module.exports = { test, expect, signIn, signOut, go, noSideScroll, isPhone };
