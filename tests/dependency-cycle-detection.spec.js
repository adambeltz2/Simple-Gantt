// @ts-check
const { test, expect } = require('@playwright/test');

// Covers explicit dependency cycle detection (backlog item #3): a task
// depending on itself is already stripped elsewhere in syncToGantt, but a
// longer cycle (A depends on B depends on A, or a longer chain) previously
// went undetected -- the fixed-point scheduling loop would just keep
// changing dates every pass until it silently hit its own 100-iteration
// safety valve. This is purely additive: a status-bar warning plus a red
// outline on the ID cells involved, never a new constraint and never a
// mutation of the Depends column.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(500);
});

async function loadTasks(page, rows) {
  await page.evaluate((rows) => {
    appDB.projects[appDB.activeId].data = rows;
    renderGrid(rows);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

function idCellStyle(page, rowIndex) {
  return page.evaluate((y) => {
    const el = sheet.records[y][0]; // COL.ID
    return { boxShadow: el.style.boxShadow, title: el.title };
  }, rowIndex);
}

function statusText(page) {
  return page.evaluate(() => document.getElementById('saveStatusText').innerText);
}

test('a two-task cycle (A depends on B, B depends on A) is detected and both rows are outlined', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '', '', '0', '2026-08-24', '1', '2026-08-24', '2', ''],
    ['2', '1', 'Task B', '', '', '0', '2026-08-24', '1', '2026-08-24', '1', ''],
  ]);

  const styleA = await idCellStyle(page, 0);
  const styleB = await idCellStyle(page, 1);
  expect(styleA.boxShadow).toContain('220, 38, 38'); // #dc2626
  expect(styleB.boxShadow).toContain('220, 38, 38');
  expect(styleA.title).toContain('Dependency cycle');
  expect(styleB.title).toContain('Dependency cycle');

  const status = await statusText(page);
  expect(status).toContain('Dependency cycle detected');
});

test('a longer chain cycle (A -> B -> C -> A) flags all three tasks', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '', '', '0', '2026-08-24', '1', '2026-08-24', '3', ''],
    ['2', '1', 'Task B', '', '', '0', '2026-08-24', '1', '2026-08-24', '1', ''],
    ['3', '1', 'Task C', '', '', '0', '2026-08-24', '1', '2026-08-24', '2', ''],
  ]);

  const styles = await Promise.all([0, 1, 2].map((i) => idCellStyle(page, i)));
  styles.forEach((s) => expect(s.boxShadow).toContain('220, 38, 38'));
});

test('a normal linear dependency chain has no cycle warning or outline', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '', '', '0', '2026-08-24', '1', '2026-08-24', '', ''],
    ['2', '1', 'Task B', '', '', '0', '', '1', '', '1', ''],
    ['3', '1', 'Task C', '', '', '0', '', '1', '', '2', ''],
  ]);

  const styles = await Promise.all([0, 1, 2].map((i) => idCellStyle(page, i)));
  styles.forEach((s) => expect(s.boxShadow).toBe(''));
});

test('a diamond dependency shape (shared ancestor, not a cycle) is not a false positive', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Root', '', '', '0', '2026-08-24', '1', '2026-08-24', '', ''],
    ['2', '1', 'Branch A', '', '', '0', '', '1', '', '1', ''],
    ['3', '1', 'Branch B', '', '', '0', '', '1', '', '1', ''],
    ['4', '1', 'Join', '', '', '0', '', '1', '', '2;3', ''],
  ]);

  const styles = await Promise.all([0, 1, 2, 3].map((i) => idCellStyle(page, i)));
  styles.forEach((s) => expect(s.boxShadow).toBe(''));
});

test('cycle detection never mutates the Depends column data (view-only)', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '', '', '0', '2026-08-24', '1', '2026-08-24', '2', ''],
    ['2', '1', 'Task B', '', '', '0', '2026-08-24', '1', '2026-08-24', '1', ''],
  ]);

  const deps = await page.evaluate((COL) => sheet.getData().map((r) => r[COL.DEP]), COL);
  expect(deps).toEqual(['2', '1']);
});

test('a self-reference is stripped (existing behavior) and does not additionally trigger a cycle warning', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '', '', '0', '2026-08-24', '1', '2026-08-24', '1', ''],
  ]);

  const status = await statusText(page);
  expect(status).toContain('self-reference');
  expect(status).not.toContain('Dependency cycle');

  const style = await idCellStyle(page, 0);
  expect(style.boxShadow).toBe('');
});

test('fixing the cycle (removing one link) clears the outline and status', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '', '', '0', '2026-08-24', '1', '2026-08-24', '2', ''],
    ['2', '1', 'Task B', '', '', '0', '2026-08-24', '1', '2026-08-24', '1', ''],
  ]);
  expect((await idCellStyle(page, 0)).boxShadow).toContain('220, 38, 38');

  await page.evaluate((COL) => {
    const data = sheet.getData();
    data[1][COL.DEP] = ''; // Task B no longer depends on Task A
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  const styleA = await idCellStyle(page, 0);
  const styleB = await idCellStyle(page, 1);
  expect(styleA.boxShadow).toBe('');
  expect(styleB.boxShadow).toBe('');
});

test('no uncaught JS errors while detecting, displaying, and resolving a cycle', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '', '', '0', '2026-08-24', '1', '2026-08-24', '2', ''],
    ['2', '1', 'Task B', '', '', '0', '2026-08-24', '1', '2026-08-24', '1', ''],
  ]);
  await page.evaluate((COL) => {
    const data = sheet.getData();
    data[1][COL.DEP] = '';
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  expect(page.consoleErrors).toEqual([]);
});
