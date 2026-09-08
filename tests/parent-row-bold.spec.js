// @ts-check
const { test, expect } = require('./fixtures');

// User-reported bug: parent rows nested under another parent (depth > 0)
// weren't rendered bold in the grid, even though they clearly have their
// own children (a collapse/expand toggle showed on them). Root cause in
// formatCells(): the bold-if-parent line lived inside the `else` branch of
// `if (depth > 0) { ... } else { ...fontWeight... }` -- an accidental
// coupling of two unrelated concerns (indentation vs. boldness) that meant
// only a top-level (depth === 0) parent ever got bolded. A parent nested at
// any depth got the indentation but never the bold weight.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

async function loadHierarchy(page) {
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].columns = [];
    const data = [
      ['1', '1', 'Root Parent', '', '', '0', '2026-08-24', '1', '2026-08-24', '', ''],
      ['2', '1.1', 'Nested Parent', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '1'],
      ['3', '1.1.1', 'Grandchild Leaf', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '2'],
      ['4', '1.2', 'Childless Sibling', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '1'],
    ]; // 1 (parent, depth 0) -> 2 (parent, depth 1) -> 3 (leaf, depth 2); 4 is a childless leaf at depth 1
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  });
  await page.waitForTimeout(300);
}

async function nameCellFontWeight(page, id) {
  return page.evaluate(({ COL_NAME, id }) => {
    const rows = sheet.getData();
    const idx = rows.findIndex((r) => String(r[0]) === id);
    const cell = sheet.getCellFromCoords(COL_NAME, idx);
    return getComputedStyle(cell).fontWeight;
  }, { COL_NAME: COL.NAME, id });
}

test('a top-level (depth 0) parent row is bold', async ({ page }) => {
  await loadHierarchy(page);
  const weight = await nameCellFontWeight(page, '1');
  expect(['bold', '700']).toContain(weight);
});

test('a parent row nested under another parent (depth > 0) is also bold', async ({ page }) => {
  await loadHierarchy(page);
  const weight = await nameCellFontWeight(page, '2');
  expect(['bold', '700']).toContain(weight);
});

test('a leaf row at depth 0 is not bold', async ({ page }) => {
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].columns = [];
    const data = [
      ['1', '1', 'Lone Leaf', '', '', '0', '2026-08-24', '1', '2026-08-24', '', ''],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  });
  await page.waitForTimeout(300);
  const weight = await nameCellFontWeight(page, '1');
  expect(['normal', '400']).toContain(weight);
});

test('a leaf row nested at depth > 0 (a grandchild with no children of its own) is not bold', async ({ page }) => {
  await loadHierarchy(page);
  const weight = await nameCellFontWeight(page, '3');
  expect(['normal', '400']).toContain(weight);
});

test('a childless sibling of a nested parent, at the same depth, is not bold', async ({ page }) => {
  await loadHierarchy(page);
  const weight = await nameCellFontWeight(page, '4');
  expect(['normal', '400']).toContain(weight);
});
