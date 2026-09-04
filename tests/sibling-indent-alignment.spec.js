// @ts-check
const { test, expect } = require('@playwright/test');

// Covers a UI bug: formatCells() indents Task Name purely by outline depth
// (steps up the Parent chain), which is correct -- but only a row that is
// itself a parent gets a collapse/expand toggle icon prepended before its
// name text. That icon consumes ~17px of horizontal space that a childless
// sibling at the same depth never reserves, so the parent sibling's text
// renders shifted right relative to its childless sibling -- visually
// indistinguishable from being nested one level deeper, even though both
// rows share the exact same Parent and outline depth.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
});

test('a childless row aligns its Task Name text with a sibling that has children', async ({ page }) => {
  // Root (1) has two children at the same depth: 2 (which itself has a
  // child, 4 -- so it gets a collapse toggle) and 3 (a leaf, no toggle).
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].columns = [];
    const data = [
      ['1', '1', 'Root', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '', ''],
      ['2', '1.1', 'Sibling With Child', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '1', ''],
      ['3', '1.2', 'Sibling Without Child', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '1', ''],
      ['4', '1.1.1', 'Grandchild', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '2', ''],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  });
  await page.waitForTimeout(300);

  const offsets = await page.evaluate((COL_NAME) => {
    const rows = sheet.getData();
    const idxOf = (id) => rows.findIndex((r) => String(r[0]) === id);
    const nameCell = (id) => sheet.getCellFromCoords(COL_NAME, idxOf(id));

    const withChild = nameCell('2');
    const withoutChild = nameCell('3');

    const textLeft = (cell) => {
      const range = document.createRange();
      range.selectNode(cell.lastChild);
      return range.getBoundingClientRect().left;
    };

    return {
      withChildHasToggle: !!withChild.querySelector('.row-collapse-toggle'),
      withoutChildHasToggle: !!withoutChild.querySelector('.row-collapse-toggle'),
      withChildLeft: textLeft(withChild),
      withoutChildLeft: textLeft(withoutChild),
    };
  }, COL.NAME);

  expect(offsets.withChildHasToggle).toBe(true);
  expect(offsets.withoutChildHasToggle).toBe(false);
  expect(Math.abs(offsets.withChildLeft - offsets.withoutChildLeft)).toBeLessThan(1);
});
