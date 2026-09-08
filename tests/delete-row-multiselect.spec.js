// @ts-check
const { test, expect } = require('./fixtures');

// User-reported bug: dragging to select multiple rows in the grid, then
// right-click -> "Delete row", only deleted the one row under the cursor
// instead of the whole selection. The row context menu's "Delete row" item
// always called sheet.deleteRow(parseInt(y), 1) -- a hardcoded single row --
// ignoring lastSelectionRange entirely, unlike Bulk Edit (backlog #14) which
// already reads that same tracked range. Fixed by having "Delete row" delete
// the full lastSelectionRange when the right-clicked row falls inside a real
// (2+ row) selection, and fall back to the single row otherwise.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

function row(id, outline, name, resource, alloc, pct, start, dur, end, dep, parent) {
  const r = Array(12).fill('');
  r[COL.ID] = id; r[COL.OUTLINE] = outline; r[COL.NAME] = name;
  r[COL.RESOURCE] = resource; r[COL.ALLOC] = alloc; r[COL.PCT] = pct;
  r[COL.START] = start; r[COL.DUR] = dur; r[COL.END] = end;
  r[COL.DEP] = dep; r[COL.PARENT] = parent;
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

// Same technique bulk-edit.spec.js uses: jexcel's own internal call for a
// real mouse-drag row selection, which fires the onselection callback the
// app tracks into lastSelectionRange.
async function selectRows(page, rowTop, rowBottom) {
  await page.evaluate(({ rowTop, rowBottom }) => {
    sheet.updateSelectionFromCoords(0, rowTop, sheet.options.columns.length - 1, rowBottom);
  }, { rowTop, rowBottom });
}

async function idOrder(page) {
  return page.evaluate(() => sheet.getData().map((r) => r[0]));
}

async function clickDeleteRow(page, rowIdx) {
  await page.evaluate((rowIdx) => {
    const items = sheet.options.contextMenu(sheet, undefined, String(rowIdx), {});
    items.find((i) => i.title === 'Delete row').onclick();
  }, rowIdx);
  await page.waitForTimeout(200);
}

test('right-clicking a single row with no multi-selection deletes only that row', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
  ]);
  await clickDeleteRow(page, 1);
  expect(await idOrder(page)).toEqual(['1', '3']);
});

test('right-clicking inside a dragged multi-row selection deletes the whole selection', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
    row('4', '4', 'Task D', 'Dave', '100', '0', '2026-08-27', '1', '2026-08-27', '', ''),
  ]);
  await selectRows(page, 0, 2); // select rows 0-2 (Task A, B, C)
  await clickDeleteRow(page, 1); // right-click lands on Task B, inside the selection
  expect(await idOrder(page)).toEqual(['4']);
});

test('right-clicking outside a stale multi-row selection deletes only the clicked row', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
  ]);
  await selectRows(page, 0, 1); // select rows 0-1 (Task A, B)
  await clickDeleteRow(page, 2); // right-click Task C, outside that selection
  expect(await idOrder(page)).toEqual(['1', '2']);
});

test('deleting a multi-row selection updates the Gantt chart and triggers a sync', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
  ]);
  await selectRows(page, 0, 1);
  await clickDeleteRow(page, 0);
  await page.waitForTimeout(300);

  const bars = await page.locator('.gantt .bar-wrapper').count();
  expect(bars).toBe(1);
  await expect(page.locator('#saveStatusText')).not.toHaveText('');
});
