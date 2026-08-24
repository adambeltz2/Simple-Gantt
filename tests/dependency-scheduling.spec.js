// @ts-check
const { test, expect } = require('@playwright/test');

// Covers the two scheduling relationships and the "Sync Dependencies" button:
//
// - "Depends" is a finish-to-start date constraint: a task's Start is pushed
//   to the day after its dependency's (inclusive) End -- calendar date only,
//   skipping to the next working day if that lands on a weekend. % Done is
//   never consulted -- it's on the user to keep dates accurate, not the app
//   to infer readiness from completion percentage.
// - "Parent" is a rollup: a parent's Start/End span the min/max of its
//   children's dates, computed live on every edit.
//
// Both rules already run automatically inside syncToGantt() on every edit.
// The "Sync Dependencies" button is just a manual full-recompute trigger for
// peace of mind (e.g. after a bulk paste) -- it must not be the only thing
// that applies these rules, and the old buggy standalone implementation of
// this (which misread the Depends column as a parent/child rollup) must be
// gone for good.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(500);
});

test('a dependent task starts the working day after its dependency\'s (inclusive) end date', async ({ page }) => {
  // Sample data: task 3 (UI Design) Depends on task 2 (Discovery), which is
  // already 100% done. This should already hold true without touching the
  // Sync Dependencies button, since the rule runs on every edit.
  const [task2End, task3Start] = await page.evaluate((COL) => {
    const data = sheet.getData();
    const row2 = data.find((r) => r[COL.ID] === '2');
    const row3 = data.find((r) => r[COL.ID] === '3');
    return [row2[COL.END], row3[COL.START]];
  }, COL);

  const end = new Date(task2End);
  const start = new Date(task3Start);
  // Strictly after -- End is now inclusive (the dependency's last day of
  // work), so the successor can never start on that same day.
  expect(start.getTime()).toBeGreaterThan(end.getTime());
  // And it's the very next working day, not some arbitrary later date.
  let expected = new Date(end);
  expected.setDate(expected.getDate() + 1);
  if (expected.getDay() === 6) expected.setDate(expected.getDate() + 2);
  if (expected.getDay() === 0) expected.setDate(expected.getDate() + 1);
  expect(start.getTime()).toBe(expected.getTime());
});

test('scheduling ignores % Done entirely -- only dates matter', async ({ page }) => {
  const before = await page.evaluate((COL) => {
    const data = sheet.getData();
    const row3 = data.find((r) => r[COL.ID] === '3');
    return row3[COL.START];
  }, COL);

  // Drop task 2's completion to 0% -- if the app were gating on completion,
  // this would un-schedule task 3. It must not.
  await page.evaluate((COL) => {
    const data = sheet.getData();
    const rowIndex = data.findIndex((r) => r[COL.ID] === '2');
    sheet.setValueFromCoords(COL.PCT, rowIndex, '0', false);
  }, COL);
  await page.waitForTimeout(300);

  const after = await page.evaluate((COL) => {
    const data = sheet.getData();
    const row3 = data.find((r) => r[COL.ID] === '3');
    return row3[COL.START];
  }, COL);

  expect(after).toBe(before);
});

test('parent dates roll up from children live, without the button', async ({ page }) => {
  const [parent, children] = await page.evaluate((COL) => {
    const data = sheet.getData();
    const parentRow = data.find((r) => r[COL.ID] === '1');
    const childRows = data.filter((r) => r[COL.PARENT] === '1');
    return [
      { start: parentRow[COL.START], end: parentRow[COL.END] },
      childRows.map((r) => ({ start: r[COL.START], end: r[COL.END] })),
    ];
  }, COL);

  const childStarts = children.map((c) => new Date(c.start).getTime());
  const childEnds = children.map((c) => new Date(c.end || c.start).getTime());
  expect(new Date(parent.start).getTime()).toBe(Math.min(...childStarts));
  expect(new Date(parent.end).getTime()).toBe(Math.max(...childEnds));
});

test('Sync Dependencies forces a resync and reports success, with no errors', async ({ page }) => {
  await page.click('button[onclick="syncDependencies()"]');
  await page.waitForTimeout(300);

  await expect(page.locator('#saveStatusText')).toHaveText('Dates recalculated');
  expect(page.consoleErrors).toEqual([]);
});

test('Sync Dependencies is idempotent on already-converged data', async ({ page }) => {
  const before = await page.evaluate(() => sheet.getData());
  await page.click('button[onclick="syncDependencies()"]');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => sheet.getData());

  expect(after).toEqual(before);
});

test('the old buggy standalone recalculation function no longer exists', async ({ page }) => {
  const exists = await page.evaluate(() => typeof window.recalculateDatesUpstream);
  expect(exists).toBe('undefined');
});
