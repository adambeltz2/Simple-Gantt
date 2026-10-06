// @ts-check
const { test, expect } = require('./fixtures');

// User-reported, with a screenshot: a deeply nested outline (6-7 levels
// isn't unusual on a real project, e.g. "1.2.1.5.71.1.1") burned a third of
// the Task Name column on left padding alone, at the original flat 20px per
// outline level. Tightened to 12px/level (plus a smaller 6px base, down
// from 8px) -- same mechanism, just a smaller per-level step -- which still
// leaves nesting visually obvious while giving deep rows meaningfully more
// room for the text itself.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  await page.evaluate((COL) => {
    appDB.projects[appDB.activeId].columns = [];
    const data = [
      ['1', '1', 'Root', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '', ''],
      ['2', '1.1', 'Child', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '1', ''],
      ['3', '1.1.1', 'Grandchild', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '2', ''],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);
});

test('a top-level Task Name cell keeps the original flat 8px padding', async ({ page }) => {
  const padding = await page.evaluate((COL_NAME) => sheet.getCellFromCoords(COL_NAME, 0).style.paddingLeft, COL.NAME);
  expect(padding).toBe('8px');
});

test('depth 1 and depth 2 Task Name cells use the tightened 12px-per-level step, not the original 20px', async ({ page }) => {
  const paddings = await page.evaluate((COL_NAME) => [
    sheet.getCellFromCoords(COL_NAME, 1).style.paddingLeft,
    sheet.getCellFromCoords(COL_NAME, 2).style.paddingLeft,
  ], COL.NAME);

  expect(paddings[0]).toBe('18px'); // 6 + 1*12
  expect(paddings[1]).toBe('30px'); // 6 + 2*12
});

test('a nested row still gets the left border marking it as indented', async ({ page }) => {
  const borders = await page.evaluate((COL_NAME) => [
    sheet.getCellFromCoords(COL_NAME, 0).style.borderLeft,
    sheet.getCellFromCoords(COL_NAME, 1).style.borderLeft,
  ], COL.NAME);

  expect(borders[0]).toBe('none');
  expect(borders[1]).toBe('3px solid rgb(203, 213, 225)'); // #cbd5e1
});
