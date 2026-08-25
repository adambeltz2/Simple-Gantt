// @ts-check
const { test, expect } = require('@playwright/test');

// Covers Critical Path Highlighting (backlog item #5): an opt-in toolbar
// toggle ("Critical path", off by default) that runs a standard CPM
// forward/backward pass over the Depends graph, using the exact same
// working-day-aware date arithmetic the live scheduler already uses (so
// "zero slack" lines up with the app's own Start/End dates, not a separate
// model). Critical tasks get a small icon next to their name in the grid and
// an outlined bar in the chart; parallel branches with float are correctly
// left unmarked.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(500);
  // Weekends off, so calendar days == working days -- keeps the expected
  // dates in these tests simple regardless of which day of the week the
  // fixture's anchor date falls on.
  await page.evaluate(() => { document.getElementById('skipWeekends').checked = false; });
});

async function loadTasks(page, rows) {
  await page.evaluate((rows) => {
    appDB.projects[appDB.activeId].data = rows;
    renderGrid(rows);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

async function setCriticalPathToggle(page, on) {
  await page.evaluate((on) => {
    document.getElementById('showCriticalPath').checked = on;
    triggerSync();
  }, on);
  await page.waitForTimeout(300);
}

function nameCellHasIcon(page, rowIndex) {
  return page.evaluate((y) => sheet.records[y][2].textContent.includes('⚡'), rowIndex);
}

function barOutlineCount(page, taskId) {
  return page.locator(`.bar-wrapper[data-id="${taskId}"] rect.critical-path-outline`).count();
}

// Root(1, 2d) -> BranchA(2, 1d) \
//                                > Join(4, 1d)
// Root(1, 2d) -> BranchB(3, 5d) /
// BranchB is the long pole; BranchA has 4 days of float.
const PARALLEL_ROWS = [
  ['1', '1', 'Root', '', '', '0', '2026-08-24', '2', '2026-08-25', '', ''],
  ['2', '1', 'Branch A (short)', '', '', '0', '', '1', '', '1', ''],
  ['3', '1', 'Branch B (long)', '', '', '0', '', '5', '', '1', ''],
  ['4', '1', 'Join', '', '', '0', '', '1', '', '2;3', ''],
];

test('the toggle is off by default -- no icons, no outlines, no legend entry, even with a real critical path', async ({ page }) => {
  await loadTasks(page, PARALLEL_ROWS);

  for (let i = 0; i < 4; i++) {
    expect(await nameCellHasIcon(page, i)).toBe(false);
  }
  expect(await barOutlineCount(page, '1')).toBe(0);
  const legendText = await page.locator('#ganttLegend').textContent();
  expect(legendText).not.toContain('Critical path');
});

test('a linear chain is entirely on the critical path', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'A', '', '', '0', '2026-08-24', '2', '', '', ''],
    ['2', '1', 'B', '', '', '0', '', '3', '', '1', ''],
    ['3', '1', 'C', '', '', '0', '', '1', '', '2', ''],
  ]);
  await setCriticalPathToggle(page, true);

  for (let i = 0; i < 3; i++) {
    expect(await nameCellHasIcon(page, i)).toBe(true);
  }
  for (const id of ['1', '2', '3']) {
    expect(await barOutlineCount(page, id)).toBe(1);
  }
});

test('a parallel branch with float is correctly left off the critical path', async ({ page }) => {
  await loadTasks(page, PARALLEL_ROWS);
  await setCriticalPathToggle(page, true);

  // Root(0), Branch B(2), Join(3) are critical; Branch A(1) has float.
  expect(await nameCellHasIcon(page, 0)).toBe(true);
  expect(await nameCellHasIcon(page, 1)).toBe(false);
  expect(await nameCellHasIcon(page, 2)).toBe(true);
  expect(await nameCellHasIcon(page, 3)).toBe(true);

  expect(await barOutlineCount(page, '1')).toBe(1);
  expect(await barOutlineCount(page, '2')).toBe(0);
  expect(await barOutlineCount(page, '3')).toBe(1);
  expect(await barOutlineCount(page, '4')).toBe(1);
});

test('a milestone can sit on the critical path', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Root', '', '', '0', '2026-08-24', '2', '', '', ''],
    ['2', '1', 'Gate', '', '', '0', '', '0', '', '1', ''],
    ['3', '1', 'Final', '', '', '0', '', '1', '', '2', ''],
  ]);
  await setCriticalPathToggle(page, true);

  for (let i = 0; i < 3; i++) {
    expect(await nameCellHasIcon(page, i)).toBe(true);
  }
});

test('an isolated task that finishes well before the project end is not critical', async ({ page }) => {
  await loadTasks(page, [
    ...PARALLEL_ROWS,
    ['5', '1', 'Unrelated quick task', '', '', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  await setCriticalPathToggle(page, true);

  expect(await nameCellHasIcon(page, 4)).toBe(false);
});

test('a lone task with no dependencies is trivially its own critical path', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Solo task', '', '', '0', '2026-08-24', '3', '', '', ''],
  ]);
  await setCriticalPathToggle(page, true);

  expect(await nameCellHasIcon(page, 0)).toBe(true);
});

test('parent/summary rows are never marked critical themselves', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', ''],
    ['2', '1.1', 'Child', '', '', '0', '2026-08-24', '2', '', '', '1'],
  ]);
  await setCriticalPathToggle(page, true);

  expect(await nameCellHasIcon(page, 0)).toBe(false); // Parent
  expect(await nameCellHasIcon(page, 1)).toBe(true); // Child
});

test('critical path is suppressed while a dependency cycle exists', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'A', '', '', '0', '2026-08-24', '1', '2026-08-24', '2', ''],
    ['2', '1', 'B', '', '', '0', '2026-08-24', '1', '2026-08-24', '1', ''],
  ]);
  await setCriticalPathToggle(page, true);

  expect(await nameCellHasIcon(page, 0)).toBe(false);
  expect(await nameCellHasIcon(page, 1)).toBe(false);
  const legendText = await page.locator('#ganttLegend').textContent();
  expect(legendText).not.toContain('Critical path');
});

test('toggling critical path view never mutates the underlying task data', async ({ page }) => {
  await loadTasks(page, PARALLEL_ROWS);
  const before = await page.evaluate(() => sheet.getData());
  await setCriticalPathToggle(page, true);
  const after = await page.evaluate(() => sheet.getData());

  expect(after).toEqual(before);
});

test('the legend shows a Critical path entry only when the toggle is on and a path exists', async ({ page }) => {
  await loadTasks(page, PARALLEL_ROWS);
  await setCriticalPathToggle(page, true);
  expect(await page.locator('#ganttLegend').textContent()).toContain('Critical path');

  await setCriticalPathToggle(page, false);
  expect(await page.locator('#ganttLegend').textContent()).not.toContain('Critical path');
});

test('no uncaught JS errors while toggling critical path on and off', async ({ page }) => {
  await loadTasks(page, PARALLEL_ROWS);
  await setCriticalPathToggle(page, true);
  await setCriticalPathToggle(page, false);
  await setCriticalPathToggle(page, true);

  expect(page.consoleErrors).toEqual([]);
});
