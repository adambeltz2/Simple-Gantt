// @ts-check
const { test, expect } = require('./fixtures');

// User-reported bug (screenshot): a parent with ~30 children showed 100%
// Done even though only 1 child had an actual schedule/progress and the
// rest were completely blank (no Start, no Duration, no % Done). Root cause
// in syncToGantt()'s parent rollup: the % Done weighted average was computed
// over the SAME child subset used for the date-span rollup (Start/End min/
// max), which only includes children with a valid schedule. An unscheduled
// child was therefore invisible to the % Done average entirely, rather than
// counting as 0% of the parent's total work -- so a parent with 1 scheduled
// child at 100% and 29 blank children still averaged to 100%. Fixed by
// rolling up % Done from every child (weighted by Duration when known,
// falling back to a weight of 1 for an unscheduled child), independently of
// which children have valid dates for the separate date-span rollup.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

async function loadTasks(page, rows) {
  await page.evaluate((rows) => {
    appDB.projects[appDB.activeId].data = rows;
    renderGrid(rows);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

async function pctOf(page, rowIndex) {
  const val = await page.evaluate((y) => sheet.getData()[y][5], rowIndex);
  return Number(val);
}

test('an unscheduled (blank Start/Duration) child counts as 0% in the parent rollup, not excluded from it', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', '', ''],
    ['2', '1.1', 'Scheduled child at 100%', '', '', '100', '2026-08-24', '1', '', '', '1', ''],
    ['3', '1.2', 'Blank child A', '', '', '', '', '', '', '', '1', ''],
    ['4', '1.3', 'Blank child B', '', '', '', '', '', '', '', '1', ''],
    ['5', '1.4', 'Blank child C', '', '', '', '', '', '', '', '1', ''],
    ['6', '1.5', 'Blank child D', '', '', '', '', '', '', '', '1', ''],
  ]);

  // 1 scheduled child (weight 1, pct 100) + 4 unscheduled children (weight 1
  // each, pct 0 since blank) = 100 / 5 = 20%, matching the reported bug's
  // shape (1 real child out of many blank ones should pull the average way
  // down, not leave it at the lone child's own 100%).
  expect(await pctOf(page, 0)).toBe(20);
});

test('a parent with every child unscheduled and blank rolls up to 0%, not 100%', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', '', ''],
    ['2', '1.1', 'Blank child A', '', '', '', '', '', '', '', '1', ''],
    ['3', '1.2', 'Blank child B', '', '', '', '', '', '', '', '1', ''],
  ]);
  expect(await pctOf(page, 0)).toBe(0);
});

test('a scheduled child with a blank % Done cell is treated as 0%, same as any other blank value', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', '', ''],
    ['2', '1.1', 'Scheduled, blank % Done', '', '', '', '2026-08-24', '4', '', '', '1', ''],
    ['3', '1.2', 'Scheduled, 100%', '', '', '100', '2026-08-25', '4', '', '', '1', ''],
  ]);
  // Both children have Duration 4, weighted equally: (4*0 + 4*100) / 8 = 50.
  expect(await pctOf(page, 0)).toBe(50);
});

test('date-span rollup still only uses children with a real schedule (unaffected by the % Done fix)', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', '', ''],
    ['2', '1.1', 'Scheduled child', '', '', '50', '2026-08-24', '3', '', '', '1', ''],
    ['3', '1.2', 'Blank child', '', '', '', '', '', '', '', '1', ''],
  ]);
  const parentRow = await page.evaluate(() => sheet.getData()[0]);
  expect(parentRow[COL.START]).toBe('2026-08-24');
  expect(parentRow[COL.DUR]).toBe(3);
});

test('a multi-level hierarchy still rolls % Done up correctly through an unscheduled mid-level parent', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Grandparent', '', '', '0', '', '', '', '', '', ''],
    ['2', '1.1', 'Mid parent (all children blank)', '', '', '0', '', '', '', '', '1', ''],
    ['3', '1.1.1', 'Blank grandchild', '', '', '', '', '', '', '', '2', ''],
    ['4', '1.2', 'Sibling leaf at 100%', '', '', '100', '2026-08-24', '1', '', '', '1', ''],
  ]);
  // Mid parent rolls up to 0% (its one child is blank). Grandparent then
  // averages the mid parent (weight 1, 0%) with the sibling leaf (weight 1,
  // 100%) = 50%.
  expect(await pctOf(page, 1)).toBe(0);
  expect(await pctOf(page, 0)).toBe(50);
});
