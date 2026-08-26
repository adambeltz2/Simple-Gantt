// @ts-check
const { test, expect } = require('@playwright/test');

// End is inclusive: it's the last day of work, not the day after. This was
// found from a real bug report -- a multi-level parent (itself a child of a
// grandparent, and a parent of its own leaf children) was showing a stale
// End date that didn't reflect its children's actual dates. Root cause:
// calculateEndDate/calculateWorkingDays used an exclusive-end convention
// (End = day after the last day of work), which also meant frappe-gantt --
// which itself renders bars using an INCLUSIVE end date, confirmed by direct
// testing -- was rendering every non-milestone bar one day too wide, and the
// chart's "overdue" coloring was one day later than it should have been.
//
// Fixing the convention fixes all three symptoms from one root cause; these
// tests cover the date-math functions directly, the exact multi-level
// rollup scenario from the bug report, and the Gantt bar width.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
});

test('calculateEndDate is inclusive: a 1-day task has End === Start', async ({ page }) => {
  const end = await page.evaluate(() => calculateEndDate('2026-08-20', 1));
  expect(end).toBe('2026-08-20');
});

test('calculateEndDate spans exactly N working days inclusively', async ({ page }) => {
  // Mon 8/24 + 3 working days (skipping weekends) = Mon, Tue, Wed = ends 8/26
  const end = await page.evaluate(() => calculateEndDate('2026-08-24', 3));
  expect(end).toBe('2026-08-26');
});

test('calculateWorkingDays is the exact inverse of calculateEndDate', async ({ page }) => {
  const results = await page.evaluate(() => {
    return [1, 2, 3, 5, 10].map((dur) => {
      const end = calculateEndDate('2026-08-24', dur);
      return { dur, roundTrip: calculateWorkingDays('2026-08-24', end) };
    });
  });
  results.forEach(({ dur, roundTrip }) => expect(roundTrip).toBe(dur));
});

test('reproduces the reported bug: a multi-level parent picks up its children\'s dates with no staleness', async ({ page }) => {
  // Exact shape from the bug report: grandparent "7" -> mid "43" (itself
  // dur=0, stale pre-sync dates) -> leaf children "44"/"45" ending 8/20.
  const row43 = await page.evaluate((COL) => {
    const data = [
      ['7', '1', 'Style Workflow', '', '', '0', '2026-07-30', '19', '2026-08-26', '', ''],
      ['43', '1.1', 'Style List of Values', '', '', '43', '2026-08-19', '0', '2026-08-19', '', '7'],
      ['44', '1.1.1', 'LOV Applied 1', 'Adam', '100', '100', '2026-08-20', '1', '2026-08-20', '', '43'],
      ['45', '1.1.2', 'LOV Applied 2', 'Adam', '100', '100', '2026-08-20', '1', '2026-08-20', '', '43'],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
    return sheet.getData().find((r) => r[COL.ID] === '43');
  }, COL);

  expect(row43[COL.START]).toBe('2026-08-20');
  expect(row43[COL.END]).toBe('2026-08-20');
});

test('a second bug found while reproducing the first: the grandparent also rolls up correctly (parent rollup now runs to a fixed point, not just one pass)', async ({ page }) => {
  // Same shape as above, but this checks task "7" (the grandparent, itself
  // a child of nothing) rather than "43". A single-pass rollup processes
  // parentIDs in the order their IDs are first referenced in the raw data --
  // here that's "7" before "43", so "7" would roll up using "43"'s stale
  // pre-rollup values unless the rollup loop iterates to a fixed point.
  const row7 = await page.evaluate((COL) => {
    const data = [
      ['7', '1', 'Style Workflow', '', '', '0', '2026-07-30', '19', '2026-08-26', '', ''],
      ['43', '1.1', 'Style List of Values', '', '', '43', '2026-08-19', '0', '2026-08-19', '', '7'],
      ['44', '1.1.1', 'LOV Applied 1', 'Adam', '100', '100', '2026-08-20', '1', '2026-08-20', '', '43'],
      ['45', '1.1.2', 'LOV Applied 2', 'Adam', '100', '100', '2026-08-20', '1', '2026-08-20', '', '43'],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
    return sheet.getData().find((r) => r[COL.ID] === '7');
  }, COL);

  expect(row7[COL.START]).toBe('2026-08-20');
  expect(row7[COL.END]).toBe('2026-08-20');
  expect(row7[COL.PCT]).toBe(100);
});

test('Gantt bars render at inclusive width -- a 3-day span is exactly 3x a 1-day span', async ({ page }) => {
  // Self-contained ratio check (no reliance on undocumented frappe-gantt
  // internals): if End were still exclusive, a "3-day" span computed via
  // calculateEndDate would render 4x as wide as a 1-day span, not 3x.
  const { oneDayWidth, threeDayWidth } = await page.evaluate(() => {
    document.getElementById('gantt').innerHTML = '';
    const oneDayEnd = calculateEndDate('2026-08-24', 1);
    const threeDayEnd = calculateEndDate('2026-08-24', 3);
    const tasks = [
      { id: 'one', name: '1 day', start: '2026-08-24', end: oneDayEnd, progress: 0 },
      { id: 'three', name: '3 days', start: '2026-08-24', end: threeDayEnd, progress: 0 },
    ];
    new Gantt('#gantt', tasks, { view_mode: 'Day' });
    const bars = document.querySelectorAll('.gantt .bar-wrapper .bar');
    return {
      oneDayWidth: parseFloat(bars[0].getAttribute('width')),
      threeDayWidth: parseFloat(bars[1].getAttribute('width')),
    };
  });
  expect(threeDayWidth / oneDayWidth).toBeCloseTo(3, 1);
});

test('a task due exactly today is not yet colored overdue in the chart', async ({ page }) => {
  const customClass = await page.evaluate((COL) => {
    const todayStr = format(new Date());
    const data = [['1', '1', 'Due today', '', '', '50', todayStr, '1', todayStr, '', '']];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
    const bar = document.querySelector('.gantt .bar-wrapper');
    return bar ? bar.className.baseVal : null;
  }, COL);

  expect(customClass).not.toContain('is-overdue');
});
