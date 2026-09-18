// @ts-check
const { test, expect } = require('./fixtures');

// User-reported: "Add row" always inserted at the bottom of the grid,
// regardless of what was selected. It now inserts right after the last row
// of whatever's currently selected (a single-cell click counts as a
// one-row selection), falling back to appending at the bottom when nothing
// is selected -- e.g. right after a project switch/reload, before any
// selection has ever been made.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

function row(id, name) {
  const r = Array(12).fill('');
  r[COL.ID] = id; r[COL.OUTLINE] = id; r[COL.NAME] = name;
  return r;
}

async function loadTasks(page, rows) {
  await page.evaluate((rows) => {
    appDB.projects[appDB.activeId].data = rows;
    renderGrid(rows);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

// Same call jexcel's own mouse-drag/click selection handling makes
// internally -- see tests/bulk-edit.spec.js for the same precedent.
async function selectRows(page, rowTop, rowBottom) {
  await page.evaluate(({ rowTop, rowBottom }) => {
    sheet.updateSelectionFromCoords(0, rowTop, sheet.options.columns.length - 1, rowBottom);
  }, { rowTop, rowBottom });
}

test('with nothing selected, Add row appends at the bottom (unchanged default)', async ({ page }) => {
  await loadTasks(page, [row('1', 'A'), row('2', 'B'), row('3', 'C')]);

  await page.click('button[onclick="addRow()"]');
  await page.waitForTimeout(300);

  const names = await page.evaluate(() => sheet.getData().map((r) => r[2]));
  expect(names).toEqual(['A', 'B', 'C', '']);
});

test('with a single cell selected in the middle, Add row inserts immediately after that row', async ({ page }) => {
  await loadTasks(page, [row('1', 'A'), row('2', 'B'), row('3', 'C')]);

  await selectRows(page, 0, 0); // select row "A"
  await page.click('button[onclick="addRow()"]');
  await page.waitForTimeout(300);

  const names = await page.evaluate(() => sheet.getData().map((r) => r[2]));
  expect(names).toEqual(['A', '', 'B', 'C']);
});

test('with a multi-row drag selection, Add row inserts after the LAST selected row', async ({ page }) => {
  await loadTasks(page, [row('1', 'A'), row('2', 'B'), row('3', 'C'), row('4', 'D')]);

  await selectRows(page, 0, 1); // select rows "A" and "B"
  await page.click('button[onclick="addRow()"]');
  await page.waitForTimeout(300);

  const names = await page.evaluate(() => sheet.getData().map((r) => r[2]));
  expect(names).toEqual(['A', 'B', '', 'C', 'D']);
});

test('the new row still gets an auto-assigned Task ID and Def. Alloc, wherever it lands', async ({ page }) => {
  await loadTasks(page, [row('1', 'A'), row('2', 'B'), row('3', 'C')]);

  await selectRows(page, 0, 0);
  await page.click('button[onclick="addRow()"]');
  await page.waitForTimeout(300);

  const inserted = await page.evaluate(() => sheet.getData()[1]);
  expect(inserted[COL.ID]).toBe('4');
  expect(inserted[COL.ALLOC]).toBe('100');
});

test('after a project switch clears the selection, Add row falls back to appending at the bottom', async ({ page }) => {
  await loadTasks(page, [row('1', 'A'), row('2', 'B'), row('3', 'C')]);
  await selectRows(page, 0, 0);

  page.once('dialog', (d) => d.accept('Second Project'));
  await page.evaluate(() => createNewProject());
  await page.waitForTimeout(200);
  await loadTasks(page, [row('1', 'X'), row('2', 'Y')]);

  await page.click('button[onclick="addRow()"]');
  await page.waitForTimeout(300);

  const names = await page.evaluate(() => sheet.getData().map((r) => r[2]));
  expect(names).toEqual(['X', 'Y', '']);
});

test('inserting after a selected row is recorded as a single Undo step', async ({ page }) => {
  await loadTasks(page, [row('1', 'A'), row('2', 'B'), row('3', 'C')]);

  await selectRows(page, 0, 0);
  await page.click('button[onclick="addRow()"]');
  await page.waitForTimeout(300);
  await expect(page.locator('#btnUndo')).toBeEnabled();

  await page.click('#btnUndo');
  await page.waitForTimeout(300);

  const names = await page.evaluate(() => sheet.getData().map((r) => r[2]));
  expect(names).toEqual(['A', 'B', 'C']);
});
