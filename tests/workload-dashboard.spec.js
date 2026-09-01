// @ts-check
const { test, expect } = require('@playwright/test');

// Covers the Resource Workload Dashboard: daily/weekly/monthly aggregation,
// percentage vs hours units, overallocation highlighting, parent-task
// exclusion, and its own CSV export.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
  // Weekends off is on by default; turn it off so Mon-start day math in
  // these tests isn't sensitive to which day of the week "today" is.
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

test('a single resource at 100% for 2 days shows 100% each day, no overallocation', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '2', '2026-08-25', '', ''],
  ]);
  await page.evaluate(() => openWorkloadModal());
  await page.waitForTimeout(200);

  const cells = await page.locator('.workload-table tbody td.cell-ok').allTextContents();
  expect(cells).toEqual(['100%', '100%']);
  await expect(page.locator('.workload-table tbody td.cell-over')).toHaveCount(0);
});

test('two tasks overlapping the same resource on the same day sum and flag overallocation', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Alice', '60', '0', '2026-08-24', '1', '2026-08-24', '', ''],
    ['2', '2', 'Task B', 'Alice', '60', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  await page.evaluate(() => openWorkloadModal());
  await page.waitForTimeout(200);

  await expect(page.locator('.workload-table tbody td.cell-over')).toHaveCount(1);
  await expect(page.locator('.workload-table tbody td.cell-over')).toHaveText('120%');
});

test('parent/summary rows are excluded from the workload calculation', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', 'Bob', '100', '0', '', '', '', '', ''],
    ['2', '1.1', 'Child', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', '1'],
  ]);
  await page.evaluate(() => openWorkloadModal());
  await page.waitForTimeout(200);

  const names = await page.locator('.workload-table tbody td:first-child').allTextContents();
  expect(names).toEqual(['Alice']); // Bob (the parent) never shows up
});

test('Hours unit converts 100% of an 8-hour day correctly', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Alice', '50', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  await page.evaluate(() => openWorkloadModal());
  await page.selectOption('#workloadUnit', 'hours');
  await page.waitForTimeout(200);

  await expect(page.locator('.workload-table tbody td.cell-ok')).toHaveText('4h'); // 50% of 8h
});

test('multiple comma-separated resources on one task each get counted', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Pair task', 'Alice (50%), Bob (30%)', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  await page.evaluate(() => openWorkloadModal());
  await page.waitForTimeout(200);

  const rows = await page.locator('.workload-table tbody tr').evaluateAll((trs) =>
    trs.map((tr) => ({ name: tr.cells[0].textContent, val: tr.cells[1].textContent }))
  );
  expect(rows).toEqual(
    expect.arrayContaining([
      { name: 'Alice', val: '50%' },
      { name: 'Bob', val: '30%' },
    ])
  );
});

test('semicolon-separated resources on one task are also accepted, same as comma', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Pair task', 'Alice (50%); Bob (30%)', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  await page.evaluate(() => openWorkloadModal());
  await page.waitForTimeout(200);

  const rows = await page.locator('.workload-table tbody tr').evaluateAll((trs) =>
    trs.map((tr) => ({ name: tr.cells[0].textContent, val: tr.cells[1].textContent }))
  );
  expect(rows).toEqual(
    expect.arrayContaining([
      { name: 'Alice', val: '50%' },
      { name: 'Bob', val: '30%' },
    ])
  );
});

test('mixing comma and semicolon in the same Resource cell splits on both', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Trio task', 'Alice (50%), Bob (30%); Charlie (20%)', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  await page.evaluate(() => openWorkloadModal());
  await page.waitForTimeout(200);

  const rows = await page.locator('.workload-table tbody tr').evaluateAll((trs) =>
    trs.map((tr) => ({ name: tr.cells[0].textContent, val: tr.cells[1].textContent }))
  );
  expect(rows).toEqual(
    expect.arrayContaining([
      { name: 'Alice', val: '50%' },
      { name: 'Bob', val: '30%' },
      { name: 'Charlie', val: '20%' },
    ])
  );
});

test('Weekly view aggregates the max daily allocation across the week', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Alice', '40', '0', '2026-08-24', '5', '2026-08-28', '', ''], // Mon-Fri
  ]);
  await page.evaluate(() => openWorkloadModal());
  await page.selectOption('#workloadView', 'Week');
  await page.waitForTimeout(200);

  await expect(page.locator('.workload-table tbody td.cell-ok')).toHaveText('40%');
});

test('exporting the workload table downloads a CSV matching what is on screen', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  await page.evaluate(() => openWorkloadModal());
  await page.waitForTimeout(200);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportWorkloadCSV()"]'),
  ]);
  const csvPath = await download.path();
  const fs = require('fs');
  const content = fs.readFileSync(csvPath, 'utf8');
  expect(content).toContain('Alice');
  expect(content).toContain('100%');
});

test('no assigned tasks shows a helpful empty state, not a crash', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Unassigned task', '', '', '0', '', '', '', '', ''],
  ]);
  await page.evaluate(() => openWorkloadModal());
  await page.waitForTimeout(200);

  await expect(page.locator('#workloadTableContainer')).toContainText('No assigned tasks');
  expect(page.consoleErrors).toEqual([]);
});
