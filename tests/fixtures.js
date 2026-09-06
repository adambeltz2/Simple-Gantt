// @ts-check
// Shared Playwright fixture for the whole suite. Every spec was independently
// re-navigating to the app and re-wiring an identical pageerror listener in
// its own test.beforeEach, then (in most files) replaying one more scenario
// at the end of the file just to assert that listener came back empty --
// meaning a JS error thrown during any of a file's *other* tests went
// unchecked unless that exact action sequence happened to be replayed again
// in the dedicated "no errors" test. Centralizing navigation + error capture
// here instead means every single test in the suite is automatically checked
// for uncaught errors, not just whichever one scenario a file bothered to
// duplicate for that purpose.
const base = require('@playwright/test');

const test = base.test.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.consoleErrors = errors;

    await page.goto('/index.html');
    await page.waitForSelector('#spreadsheet .jexcel');
    // jexcel's own row/cell construction and the app's initial syncToGantt()
    // pass both run synchronously in the same tick that creates this element,
    // so by the time it's queryable, both have already finished; this is just
    // a small cushion for frappe-gantt's one-frame label-position rAF.
    await page.waitForTimeout(150);

    await use(page);

    base.expect(errors, `uncaught JS error(s): ${errors.join('; ')}`).toEqual([]);
  },
});

module.exports = { test, expect: base.expect };
