// @ts-check
const { test, expect } = require('@playwright/test');

// Regression coverage for a reported bug: right-click "Insert row" already
// auto-assigns a Task ID (see oninsertrow), but pasting a block of data over
// that freshly-inserted row can overwrite the Task ID cell with a blank
// value -- and since the Outline/WBS numbering pass in syncToGantt() skips
// any row with a blank ID entirely, that row's Task ID and Outline never
// populated again, no matter how many further edits were made to it.
// syncToGantt() now backfills any blank Task ID on every sync, not just at
// insert time, so a row can never get permanently stuck without one.

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
});

test('inserting a row via the context-menu path auto-assigns a Task ID and Outline', async ({ page }) => {
  await page.evaluate(() => sheet.insertRow(1, 0, 0));
  await page.waitForTimeout(300);

  const row = await page.evaluate(() => sheet.getData()[1]);
  expect(row[0]).not.toBe(''); // Task ID
  expect(row[1]).not.toBe(''); // Outline
});

test('a row left with a blank Task ID (simulating a paste that overwrote it) gets one backfilled, and its Outline populates too', async ({ page }) => {
  await page.evaluate(() => sheet.insertRow(1, 0, 0));
  await page.waitForTimeout(300);

  // Simulate a paste blanking out the just-assigned ID/Outline cells --
  // paste, like the insert-row auto-assignment itself, writes with force
  // and bypasses the readOnly flag on these columns.
  await page.evaluate(() => {
    sheet.setValueFromCoords(0, 1, '', true);
    sheet.setValueFromCoords(1, 1, '', true);
  });
  let row = await page.evaluate(() => sheet.getData()[1]);
  expect(row[0]).toBe('');
  expect(row[1]).toBe('');

  // Any further edit to the row (leaving the record) triggers a sync.
  await page.evaluate(() => sheet.setValueFromCoords(2, 1, 'Newly pasted task', true));
  await page.locator('.jexcel td').first().click(); // fire onchange/blur
  await page.waitForTimeout(300);

  row = await page.evaluate(() => sheet.getData()[1]);
  expect(row[0]).not.toBe('');
  expect(row[1]).not.toBe('');
});

test('backfilled Task IDs are unique when more than one row is blanked at once', async ({ page }) => {
  await page.evaluate(() => {
    sheet.insertRow(1, 0, 0);
    sheet.insertRow(1, 0, 0);
  });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    sheet.setValueFromCoords(0, 1, '', true);
    sheet.setValueFromCoords(0, 2, '', true);
  });

  await page.evaluate(() => { if (typeof forceRecalc === 'function') forceRecalc(); });
  await page.waitForTimeout(300);

  const data = await page.evaluate(() => sheet.getData());
  const ids = data.map((r) => r[0]).filter((id) => id !== '');
  expect(new Set(ids).size).toBe(ids.length); // no duplicates
  expect(data[1][0]).not.toBe('');
  expect(data[2][0]).not.toBe('');
});

test('no uncaught JS errors while backfilling a blanked Task ID', async ({ page }) => {
  await page.evaluate(() => sheet.insertRow(1, 0, 0));
  await page.waitForTimeout(200);
  await page.evaluate(() => sheet.setValueFromCoords(0, 1, '', true));
  await page.evaluate(() => { if (typeof forceRecalc === 'function') forceRecalc(); });
  await page.waitForTimeout(200);

  expect(page.consoleErrors).toEqual([]);
});
