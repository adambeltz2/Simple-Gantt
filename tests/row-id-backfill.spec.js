// @ts-check
const { test, expect } = require('./fixtures');

// Regression coverage for a reported bug: right-click "Insert row" already
// auto-assigns a Task ID (see oninsertrow), but pasting a block of data over
// that freshly-inserted row can overwrite the Task ID cell with a blank
// value -- and since the Outline/WBS numbering pass in syncToGantt() skips
// any row with a blank ID entirely, that row's Task ID and Outline never
// populated again, no matter how many further edits were made to it.
// syncToGantt() now backfills any blank Task ID on every sync, not just at
// insert time, so a row can never get permanently stuck without one.
//
// A second, more serious bug in the same area (found while adding the "Add
// row inserts after the current selection" feature): jexcel's own
// insertRow(count, rowNumber, insertBefore) reports the *reference* row's
// index to oninsertrow, not the new row's, when insertBefore=0 (insert
// AFTER rowNumber -- "Insert row below," and now Add row too). oninsertrow
// used to trust that index blindly, so it silently overwrote the reference
// row's own real Task ID and Def. Alloc with freshly auto-assigned values --
// syncToGantt()'s own blank-ID backfill pass then separately fixed up the
// real new row moments later, which is exactly why this went unnoticed: the
// new row always ended up with *some* ID, just never checked against which
// row actually got corrupted in the process.

test('inserting a row via the context-menu path auto-assigns a Task ID and Outline to the new row, not the reference row', async ({ page }) => {
  const before = await page.evaluate(() => sheet.getData()[0]);

  await page.evaluate(() => sheet.insertRow(1, 0, 0));
  await page.waitForTimeout(300);

  const reference = await page.evaluate(() => sheet.getData()[0]);
  const inserted = await page.evaluate(() => sheet.getData()[1]);
  expect(reference[0]).toBe(before[0]); // reference row's own Task ID untouched
  expect(reference[4]).toBe(before[4]); // and its own Def. Alloc untouched
  expect(inserted[0]).not.toBe(''); // the new row got a Task ID
  expect(inserted[1]).not.toBe(''); // and an Outline
});

test('inserting a row after a selected one never corrupts that row\'s own Task ID or Def. Alloc', async ({ page }) => {
  const before = await page.evaluate(() => sheet.getData()[0]);
  expect(before[0]).not.toBe('');

  await page.evaluate(() => sheet.insertRow(1, 0, 0)); // insertBefore=0 -- the exact buggy path
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => sheet.getData()[0]);
  expect(after).toEqual(before);
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
