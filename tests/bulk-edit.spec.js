// @ts-check
const { test, expect } = require('@playwright/test');

// Covers backlog #14, Bulk edit / multi-row select: select 2+ rows in the
// grid and apply a single Resource/% Done/Parent value to all of them at
// once. Selection is driven through jexcel's own updateSelectionFromCoords()
// (the same internal call a real mouse drag ends up making), which fires the
// onselection callback the app uses to track the range -- this is a more
// faithful simulation than clicking a single cell and typing coordinates by
// hand, and exercises the exact same code path a user's drag would.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;
  page.on('dialog', (dialog) => { page.lastDialogMessage = dialog.message(); dialog.accept(); });

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

function row(id, outline, name, resource, alloc, pct, start, dur, end, dep, parent) {
  const r = Array(12).fill('');
  r[COL.ID] = id; r[COL.OUTLINE] = outline; r[COL.NAME] = name;
  r[COL.RESOURCE] = resource; r[COL.ALLOC] = alloc; r[COL.PCT] = pct;
  r[COL.START] = start; r[COL.DUR] = dur; r[COL.END] = end;
  r[COL.DEP] = dep; r[COL.PARENT] = parent;
  return r;
}

// Simulates a click-and-drag row selection from rowTop to rowBottom (0-indexed),
// the same call jexcel's own mouse-drag handling makes internally.
async function selectRows(page, rowTop, rowBottom) {
  await page.evaluate(({ rowTop, rowBottom }) => {
    sheet.updateSelectionFromCoords(0, rowTop, sheet.options.columns.length - 1, rowBottom);
  }, { rowTop, rowBottom });
}

test('clicking Bulk Edit with no selection shows a helpful alert, does not open the modal', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  await page.evaluate(() => openBulkEditModal());
  expect(page.lastDialogMessage).toContain('Click and drag across 2 or more rows');
  await expect(page.locator('#bulkEditModal')).not.toHaveClass(/active/);
});

test('a single-row selection also shows the alert instead of opening the modal', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  await selectRows(page, 0, 0);
  await page.evaluate(() => openBulkEditModal());
  expect(page.lastDialogMessage).toContain('Click and drag across 2 or more rows');
  await expect(page.locator('#bulkEditModal')).not.toHaveClass(/active/);
});

test('selecting 2+ rows and opening Bulk Edit shows the correct row count', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
  ]);
  await selectRows(page, 0, 2);
  await page.evaluate(() => openBulkEditModal());
  await expect(page.locator('#bulkEditModal')).toHaveClass(/active/);
  await expect(page.locator('#bulkEditRowCount')).toHaveText('(3 rows)');
});

test('bulk-setting Resource applies the same value to every selected row', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
  ]);
  await selectRows(page, 0, 2);
  await page.evaluate(() => openBulkEditModal());
  await page.selectOption('#bulkEditField', 'RESOURCE');
  await page.fill('#bulkEditValueText', 'Dave');
  await page.click('button[onclick="applyBulkEdit()"]');
  await page.waitForTimeout(200);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.RESOURCE]).toBe('Dave');
  expect(data[1][COL.RESOURCE]).toBe('Dave');
  expect(data[2][COL.RESOURCE]).toBe('Dave');
  await expect(page.locator('#bulkEditModal')).not.toHaveClass(/active/);
  expect(page.consoleErrors).toEqual([]);
});

test('bulk-setting % Done validates the value is a number 0-100', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  await selectRows(page, 0, 1);
  await page.evaluate(() => openBulkEditModal());
  await page.selectOption('#bulkEditField', 'PCT');
  await page.fill('#bulkEditValuePct', '150');
  await page.click('button[onclick="applyBulkEdit()"]');
  expect(page.lastDialogMessage).toContain('0 to 100');
  // Modal stays open, data untouched, since validation rejected the value.
  await expect(page.locator('#bulkEditModal')).toHaveClass(/active/);
  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.PCT]).toBe('0');
});

test('bulk-setting % Done applies a valid value to every selected row', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  await selectRows(page, 0, 1);
  await page.evaluate(() => openBulkEditModal());
  await page.selectOption('#bulkEditField', 'PCT');
  await page.fill('#bulkEditValuePct', '75');
  await page.click('button[onclick="applyBulkEdit()"]');
  await page.waitForTimeout(200);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.PCT]).toBe('75');
  expect(data[1][COL.PCT]).toBe('75');
});

test('a read-only row (a parent task\'s % Done) is skipped and counted separately', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Parent Task', 'Alice', '100', '0', '', '', '', '', ''),
    row('2', '1.1', 'Child A', 'Bob', '100', '0', '2026-08-24', '1', '2026-08-24', '', '1'),
    row('3', '1.2', 'Child B', 'Carol', '100', '0', '2026-08-25', '1', '2026-08-25', '', '1'),
  ]);
  await selectRows(page, 0, 2);
  await page.evaluate(() => openBulkEditModal());
  await page.selectOption('#bulkEditField', 'PCT');
  await page.fill('#bulkEditValuePct', '50');
  await page.click('button[onclick="applyBulkEdit()"]');
  await page.waitForTimeout(200);

  // Parent's % Done is computed/read-only -- must stay untouched by the bulk edit.
  const data = await page.evaluate(() => sheet.getData());
  expect(data[1][COL.PCT]).toBe('50');
  expect(data[2][COL.PCT]).toBe('50');

  await expect(page.locator('#saveStatusText')).toContainText('2 rows (1 skipped, read-only)');
});

test('bulk-setting Parent applies the same parent to every selected row', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Parent Task', 'Alice', '100', '0', '', '', '', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  await selectRows(page, 1, 2);
  await page.evaluate(() => openBulkEditModal());
  await page.selectOption('#bulkEditField', 'PARENT');
  await page.selectOption('#bulkEditValueParent', '1');
  await page.click('button[onclick="applyBulkEdit()"]');
  await page.waitForTimeout(200);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[1][COL.PARENT]).toBe('1');
  expect(data[2][COL.PARENT]).toBe('1');
});

test('bulk edit only touches the targeted column, leaving other data on those rows intact', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  await selectRows(page, 0, 1);
  await page.evaluate(() => openBulkEditModal());
  await page.selectOption('#bulkEditField', 'RESOURCE');
  await page.fill('#bulkEditValueText', 'Erin');
  await page.click('button[onclick="applyBulkEdit()"]');
  await page.waitForTimeout(200);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.NAME]).toBe('Task A');
  expect(data[1][COL.NAME]).toBe('Task B');
  expect(data[0][COL.START]).toBe('2026-08-24');
  expect(data[1][COL.START]).toBe('2026-08-25');
});

test('Cancel closes the modal without applying any change', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  await selectRows(page, 0, 1);
  await page.evaluate(() => openBulkEditModal());
  await page.fill('#bulkEditValueText', 'ShouldNotApply');
  await page.click('button[onclick="closeBulkEditModal()"]');

  await expect(page.locator('#bulkEditModal')).not.toHaveClass(/active/);
  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.RESOURCE]).toBe('Alice');
  expect(data[1][COL.RESOURCE]).toBe('Bob');
});

test('bulk edit updates the Gantt chart, no console errors', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  await selectRows(page, 0, 1);
  await page.evaluate(() => openBulkEditModal());
  await page.selectOption('#bulkEditField', 'PCT');
  await page.fill('#bulkEditValuePct', '100');
  await page.click('button[onclick="applyBulkEdit()"]');
  await page.waitForTimeout(300);

  const bars = await page.locator('.gantt .bar-wrapper').count();
  expect(bars).toBeGreaterThan(0);
  expect(page.consoleErrors).toEqual([]);
});
