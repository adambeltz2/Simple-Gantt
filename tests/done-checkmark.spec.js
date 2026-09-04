// @ts-check
const { test, expect } = require('@playwright/test');

// Covers the 100%-done checkmark (backlog #19a): a task at 100% gets a
// small ✓ marker next to its name in the spreadsheet grid, in the same
// slot the critical-path ⚡ icon already uses. Per the feature request this
// is grid-only -- no effect on the Gantt chart, the underlying task data,
// or CSV export -- and applies to parent rows too, since their % Done is
// itself a live weighted rollup of their children.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
});

async function loadTasks(page, rows) {
  await page.evaluate((rows) => {
    appDB.projects[appDB.activeId].data = rows;
    renderGrid(rows);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

function nameCellHasCheckmark(page, rowIndex) {
  return page.evaluate((y) => sheet.records[y][2].textContent.includes('✓'), rowIndex);
}

test('a task at 100% gets a checkmark next to its name; one that is not does not', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Done task', '', '', '100', '2026-08-24', '1', '2026-08-24', '', '', ''],
    ['2', '1', 'In-flight task', '', '', '60', '2026-08-24', '1', '2026-08-24', '', '', ''],
    ['3', '1', 'Not started', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '', ''],
  ]);

  expect(await nameCellHasCheckmark(page, 0)).toBe(true);
  expect(await nameCellHasCheckmark(page, 1)).toBe(false);
  expect(await nameCellHasCheckmark(page, 2)).toBe(false);
});

test('editing % Done to 100 live-adds the checkmark; editing it back off removes it', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task', '', '', '50', '2026-08-24', '1', '2026-08-24', '', '', ''],
  ]);
  expect(await nameCellHasCheckmark(page, 0)).toBe(false);

  await page.evaluate(() => sheet.setValueFromCoords(5, 0, '100', true));
  await page.waitForTimeout(300);
  expect(await nameCellHasCheckmark(page, 0)).toBe(true);

  await page.evaluate(() => sheet.setValueFromCoords(5, 0, '90', true));
  await page.waitForTimeout(300);
  expect(await nameCellHasCheckmark(page, 0)).toBe(false);
});

test('a parent row shows the checkmark once its rolled-up % Done reaches 100', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', '', ''],
    ['2', '1.1', 'Child A', '', '', '100', '2026-08-24', '1', '', '', '1', ''],
    ['3', '1.2', 'Child B', '', '', '60', '2026-08-25', '1', '', '', '1', ''],
  ]);

  // Parent's rollup % Done is a weighted average of its children -- not
  // yet 100 while Child B is still at 60%.
  expect(await nameCellHasCheckmark(page, 0)).toBe(false);
  expect(await nameCellHasCheckmark(page, 1)).toBe(true);
  expect(await nameCellHasCheckmark(page, 2)).toBe(false);

  await page.evaluate(() => sheet.setValueFromCoords(5, 2, '100', true));
  await page.waitForTimeout(300);
  expect(await nameCellHasCheckmark(page, 0)).toBe(true);
});

test('checkmark has no effect on the Gantt chart', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task', '', '', '50', '2026-08-24', '1', '2026-08-24', '', '', ''],
  ]);
  const barsBefore = await page.locator('.gantt .bar-wrapper').count();
  const classesBefore = await page.locator('.gantt .bar-wrapper').evaluateAll((els) => els.map((e) => e.className.baseVal));

  await page.evaluate(() => sheet.setValueFromCoords(5, 0, '100', true));
  await page.waitForTimeout(300);
  expect(await nameCellHasCheckmark(page, 0)).toBe(true); // grid did pick up the change

  const barsAfter = await page.locator('.gantt .bar-wrapper').count();
  const classesAfter = await page.locator('.gantt .bar-wrapper').evaluateAll((els) => els.map((e) => e.className.baseVal));

  expect(barsAfter).toBe(barsBefore);
  // Same status-driven class set a 100%-done bar already got before this
  // feature existed (e.g. "is-complete") -- unaffected by the grid marker.
  expect(classesAfter.every((c) => !c.includes('checkmark'))).toBe(true);
});

test('checkmark never changes the underlying grid data or adds a column', async ({ page }) => {
  const before = await page.evaluate(() => sheet.getData());
  const headersBefore = await page.evaluate(() => sheet.options.columns.map((c) => c.title));

  await loadTasks(page, [
    ['1', '1', 'Done task', '', '', '100', '2026-08-24', '1', '2026-08-24', '', '', ''],
  ]);

  const after = await page.evaluate(() => sheet.getData());
  const headersAfter = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(after[0][COL.NAME]).toBe('Done task');
  expect(headersAfter).toEqual(headersBefore);
});

test('checkmark and the critical-path icon can both show on the same row', async ({ page }) => {
  await page.evaluate(() => { document.getElementById('skipWeekends').checked = false; });
  await loadTasks(page, [
    ['1', '1', 'Solo critical task, done', '', '', '100', '2026-08-24', '3', '', '', '', ''],
  ]);
  await page.evaluate(() => { document.getElementById('showCriticalPath').checked = true; triggerSync(); });
  await page.waitForTimeout(300);

  const text = await page.evaluate(() => sheet.records[0][2].textContent);
  expect(text).toContain('⚡');
  expect(text).toContain('✓');
});

test('no uncaught JS errors while toggling % Done to and from 100', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task', '', '', '50', '2026-08-24', '1', '2026-08-24', '', '', ''],
  ]);
  await page.evaluate(() => sheet.setValueFromCoords(5, 0, '100', true));
  await page.waitForTimeout(200);
  await page.evaluate(() => sheet.setValueFromCoords(5, 0, '0', true));
  await page.waitForTimeout(200);

  expect(page.consoleErrors).toEqual([]);
});
