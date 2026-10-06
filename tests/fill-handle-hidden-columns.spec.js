// @ts-check
const { test, expect } = require('./fixtures');

// User-reported: "if the columns are hidden and you begin filling out
// information or copy a row it puts it in the wrong places" -- with a
// screenshot showing a row whose Start/End both read a garbage
// "...00:00:0" value and other cells showing "1900-03-3..." (an Excel-epoch-
// looking artifact).
//
// This app has no custom copy/paste/fill code of its own -- it relies
// entirely on jspreadsheet-ce 4.15.0's own native mechanisms. Root-caused by
// tracing that exact pinned version's source: the fill-handle (the small
// square at the corner of a selection, dragged to replicate a row's values
// into other rows -- distinct from, and the only one of the three affected
// by this bug, unlike ordinary Ctrl+C/Ctrl+V or column navigation) builds
// its source-value array via `getData(true, true)`, which filters to only
// "highlight"-classed cells and re-indexes the result from 0. Hidden cells
// never carry that class, so the array ends up shorter than the real column
// count whenever a hidden column sits inside the source row's range -- but
// the fill-placement loop walks the *raw*, hidden-inclusive column range and
// advances its source-array index in lockstep with that raw walk, not with
// the filtered array's shorter length. The two index spaces drift apart the
// moment a hidden column is skipped, corrupting every value after it for
// the rest of the row.
//
// Fixed in patchFillHandleHiddenColumnBug() (index.html) by intercepting
// just that one getData(true, true) call for the duration of a fill and
// handing back a correctly-shaped replacement built from
// sheet.selectedContainer (the real source selection) and sheet.options.data
// directly -- none of the library's own fill logic (auto-increment,
// formulas, style copying) needed to change, it was only ever fed the wrong
// input. Re-applied after every renderGrid() since jspreadsheet.destroy()
// recreates `sheet` from scratch on every project switch/reload.
//
// None of this needs real mouse-drag pixel coordinates: `sheet` exposes the
// exact same internal methods (updateSelectionFromCoords, selectedCorner,
// updateCopySelection, copyData) a real corner-drag invokes, in the same
// order, so driving them directly is a faithful, deterministic reproduction
// of the real gesture.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12, STATUS: 13 };

async function hideSixColumns(page) {
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].hiddenColumns = ['Resource', 'Def. Alloc', 'Dur.', 'Depends', 'Labels', 'Notes'];
    saveToLocal();
    applyColumnVisibility();
  });
}

// Drives the real fill-handle internals in the same order a real corner-drag
// does: select the source row (shows the corner handle) -> mousedown on it
// (selectedCorner=true) -> drag to the target row (updateCopySelection,
// building sheet.selection) -> mouseup (copyData, then clear the preview).
async function fillDragRow(page, sourceRow, targetRow) {
  await page.evaluate(([sourceRow, targetRow]) => {
    const lastCol = sheet.options.data[0].length - 1;
    sheet.updateSelectionFromCoords(0, sourceRow, lastCol, sourceRow);
    sheet.selectedCorner = true;
    sheet.updateCopySelection(String(lastCol), String(targetRow));
    sheet.selectedCorner = false;
    if (sheet.selection.length > 0) {
      sheet.copyData(sheet.selection[0], sheet.selection[sheet.selection.length - 1]);
      sheet.removeCopySelection();
    }
  }, [sourceRow, targetRow]);
  await page.waitForTimeout(300);
}

test('drag-filling a row down lands every visible column correctly, with hidden columns untouched', async ({ page }) => {
  await page.evaluate(() => {
    sheet.insertColumn(1, 13, false);
    sheet.setHeader(14, 'JIRA');
    syncColumnsToDB();
  });
  await hideSixColumns(page);
  await page.evaluate(() => sheet.setValueFromCoords(14, 0, 'JIRA-SOURCE', true));
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => ({ row0: sheet.getData()[0], row1: sheet.getData()[1] }));

  await fillDragRow(page, 0, 1);

  const after = await page.evaluate(() => sheet.getData()[1]);

  expect(after[COL.NAME]).toBe(before.row0[COL.NAME]);
  expect(after[COL.PCT]).toBe(before.row0[COL.PCT]);
  expect(after[COL.PARENT]).toBe(before.row0[COL.PARENT]);
  expect(after[14]).toBe(before.row0[14]); // JIRA custom column

  // Hidden columns must be completely untouched by the fill.
  expect(after[COL.RESOURCE]).toBe(before.row1[COL.RESOURCE]);
  expect(after[COL.ALLOC]).toBe(before.row1[COL.ALLOC]);
  expect(after[COL.DEP]).toBe(before.row1[COL.DEP]);
  expect(after[COL.LABELS]).toBe(before.row1[COL.LABELS]);
  expect(after[COL.NOTES]).toBe(before.row1[COL.NOTES]);

  // No garbage values (the reported "1900-03-3...", "NaN-NaN-NaN" symptoms).
  expect(after.join('|')).not.toContain('NaN');
  expect(after.join('|')).not.toMatch(/1900-0/);
});

test('drag-filling down across multiple rows keeps every row correctly aligned', async ({ page }) => {
  await page.evaluate(() => {
    sheet.insertColumn(1, 13, false);
    sheet.setHeader(14, 'JIRA');
    syncColumnsToDB();
  });
  await hideSixColumns(page);
  await page.evaluate(() => sheet.setValueFromCoords(14, 0, 'JIRA-SOURCE', true));
  await page.waitForTimeout(200);

  const row0 = await page.evaluate(() => sheet.getData()[0]);
  const hiddenBefore = await page.evaluate(() => ({ row1: sheet.getData()[1], row2: sheet.getData()[2] }));

  await fillDragRow(page, 0, 2); // fills rows 1 and 2

  const after = await page.evaluate(() => ({ row1: sheet.getData()[1], row2: sheet.getData()[2] }));

  for (const row of [after.row1, after.row2]) {
    expect(row[COL.NAME]).toBe(row0[COL.NAME]);
    expect(row[COL.PCT]).toBe(row0[COL.PCT]);
    expect(row[14]).toBe(row0[14]);
    expect(row.join('|')).not.toContain('NaN');
  }
  // Hidden columns stay exactly as they were in each row, not copied from row0.
  expect(after.row1[COL.RESOURCE]).toBe(hiddenBefore.row1[COL.RESOURCE]);
  expect(after.row2[COL.RESOURCE]).toBe(hiddenBefore.row2[COL.RESOURCE]);
});

test('ordinary Ctrl+C / Ctrl+V (not drag-fill) was never affected -- still lands correctly with hidden columns', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => {
    sheet.insertColumn(1, 13, false);
    sheet.setHeader(14, 'JIRA');
    syncColumnsToDB();
  });
  await hideSixColumns(page);
  await page.evaluate(() => sheet.setValueFromCoords(14, 0, 'JIRA-SOURCE', true));
  await page.waitForTimeout(200);

  const row0 = await page.evaluate(() => sheet.getData()[0]);

  await page.click('#spreadsheet tbody tr:nth-child(1) td.jexcel_row');
  await page.keyboard.press('Control+C');
  await page.waitForTimeout(150);
  await page.click('#spreadsheet tbody tr:nth-child(2) td.jexcel_row');
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(300);

  const row1 = await page.evaluate(() => sheet.getData()[1]);
  expect(row1[COL.NAME]).toBe(row0[COL.NAME]);
  expect(String(row1[COL.PCT])).toBe(String(row0[COL.PCT])); // Ctrl+V's clipboard round-trip stringifies; a type-only difference isn't a misalignment
  expect(row1[14]).toBe(row0[14]);
  expect(row1.join('|')).not.toContain('NaN');
});

test('drag-fill with nothing hidden still works exactly as before (no regression from the patch)', async ({ page }) => {
  const row0 = await page.evaluate(() => sheet.getData()[0]);

  await fillDragRow(page, 0, 1);

  const row1 = await page.evaluate(() => sheet.getData()[1]);
  expect(row1[COL.NAME]).toBe(row0[COL.NAME]);
  expect(row1[COL.PCT]).toBe(row0[COL.PCT]);
  expect(row1[COL.PARENT]).toBe(row0[COL.PARENT]);
});

test('the fix is reapplied after a project switch rebuilds the grid', async ({ page }) => {
  // renderGrid() calls jspreadsheet.destroy() and recreates `sheet` from
  // scratch on every project switch -- patchFillHandleHiddenColumnBug()
  // must be re-invoked each time, not just once at page load.
  await page.evaluate(() => {
    sheet.insertColumn(1, 13, false);
    sheet.setHeader(14, 'JIRA');
    syncColumnsToDB();
    createNewProject();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    sheet.insertColumn(1, 13, false);
    sheet.setHeader(14, 'JIRA2');
    syncColumnsToDB();
  });
  await hideSixColumns(page);
  await page.evaluate(() => sheet.setValueFromCoords(14, 0, 'JIRA-IN-NEW-PROJECT', true));
  await page.waitForTimeout(200);

  const row0 = await page.evaluate(() => sheet.getData()[0]);
  await fillDragRow(page, 0, 1);
  const row1 = await page.evaluate(() => sheet.getData()[1]);

  expect(row1[COL.NAME]).toBe(row0[COL.NAME]);
  expect(row1[14]).toBe(row0[14]);
  expect(row1.join('|')).not.toContain('NaN');
});
