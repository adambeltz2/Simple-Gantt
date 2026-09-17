// @ts-check
const { test, expect } = require('./fixtures');

// Covers the "Renumber Task IDs" action: an explicit, opt-in, one-way Tools
// menu item that reassigns Task ID 1, 2, 3... in current row order to close
// gaps left by deleted tasks (for cleaner CSV/PDF exports), while rewriting
// every structural reference to the old IDs in lockstep -- Depends, Parent,
// and the collapsed/flagged view-state arrays -- so nothing silently breaks.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12, STATUS: 13 };

async function loadFixture(page, rows) {
  await page.evaluate((data) => {
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(200);
}

test('renumbering closes a gap left by a deleted task, in current row order', async ({ page }) => {
  await loadFixture(page, [
    ['3', '1', 'Parent', '', '', '0', '', '', '', '', '', '', '', ''],
    ['7', '1.1', 'Child A', '', '100', '0', '', '', '', '', '3', '', '', ''],
    ['9', '1.2', 'Child B', '', '100', '0', '', '', '', '', '3', '', '', ''],
  ]);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => renumberTaskIds());
  await page.waitForTimeout(300);

  const ids = await page.evaluate(() => sheet.getData().map((r) => r[0]));
  expect(ids).toEqual(['1', '2', '3']);
});

test('Depends references are rewritten to the new IDs, preserving the link', async ({ page }) => {
  await loadFixture(page, [
    ['5', '1', 'A', '', '100', '0', '', '', '', '', '', '', '', ''],
    ['8', '2', 'B', '', '100', '0', '', '', '', '5', '', '', '', ''],
  ]);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => renumberTaskIds());
  await page.waitForTimeout(300);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.ID]).toBe('1');
  expect(data[1][COL.ID]).toBe('2');
  expect(data[1][COL.DEP]).toBe('1'); // was "5", now points at the renamed row
});

test('a multi-value Depends list (semicolon-separated) is rewritten entry by entry', async ({ page }) => {
  await loadFixture(page, [
    ['10', '1', 'A', '', '100', '0', '', '', '', '', '', '', '', ''],
    ['20', '2', 'B', '', '100', '0', '', '', '', '', '', '', '', ''],
    ['30', '3', 'C', '', '100', '0', '', '', '', '10;20', '', '', '', ''],
  ]);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => renumberTaskIds());
  await page.waitForTimeout(300);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[2][COL.DEP]).toBe('1;2');
});

test('Parent references are rewritten to the new IDs', async ({ page }) => {
  await loadFixture(page, [
    ['4', '1', 'Parent', '', '', '0', '', '', '', '', '', '', '', ''],
    ['6', '1.1', 'Child', '', '100', '0', '', '', '', '', '4', '', '', ''],
  ]);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => renumberTaskIds());
  await page.waitForTimeout(300);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[1][COL.PARENT]).toBe('1'); // was "4"
});

test('a dangling Depends reference (pointing at a nonexistent ID) is left untouched, not dropped', async ({ page }) => {
  await loadFixture(page, [
    ['5', '1', 'A', '', '100', '0', '', '', '', '999', '', '', '', ''],
  ]);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => renumberTaskIds());
  await page.waitForTimeout(300);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.ID]).toBe('1');
  expect(data[0][COL.DEP]).toBe('999'); // unresolvable ref, left as-is rather than dropped
});

test('collapsed and flagged state follow their rows to the new IDs', async ({ page }) => {
  await loadFixture(page, [
    ['3', '1', 'Parent', '', '', '0', '', '', '', '', '', '', '', ''],
    ['7', '1.1', 'Child', '', '100', '0', '', '', '', '', '3', '', '', ''],
  ]);
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].collapsed = ['3'];
    appDB.projects[appDB.activeId].flagged = ['7'];
  });

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => renumberTaskIds());
  await page.waitForTimeout(300);

  const proj = await page.evaluate(() => appDB.projects[appDB.activeId]);
  expect(proj.collapsed).toEqual(['1']);
  expect(proj.flagged).toEqual(['2']);
});

test('canceling the confirm makes no changes at all', async ({ page }) => {
  await loadFixture(page, [
    ['5', '1', 'A', '', '100', '0', '', '', '', '', '', '', '', ''],
    ['9', '2', 'B', '', '100', '0', '', '', '', '', '', '', '', ''],
  ]);

  page.once('dialog', (d) => d.dismiss());
  await page.evaluate(() => renumberTaskIds());
  await page.waitForTimeout(200);

  const ids = await page.evaluate(() => sheet.getData().map((r) => r[0]));
  expect(ids).toEqual(['5', '9']);
});

test('already-sequential IDs report a no-op status without showing a confirm dialog', async ({ page }) => {
  await loadFixture(page, [
    ['1', '1', 'A', '', '100', '0', '', '', '', '', '', '', '', ''],
    ['2', '2', 'B', '', '100', '0', '', '', '', '', '', '', '', ''],
  ]);

  let dialogFired = false;
  page.on('dialog', (d) => { dialogFired = true; d.dismiss(); });
  await page.evaluate(() => renumberTaskIds());
  await page.waitForTimeout(200);

  expect(dialogFired).toBe(false);
  await expect(page.locator('#saveStatusText')).toHaveText('IDs are already sequential');
});

test('renumbering is a single Undo step -- Ctrl+Z restores every old ID and reference at once', async ({ page }) => {
  await loadFixture(page, [
    ['5', '1', 'A', '', '100', '0', '', '', '', '', '', '', '', ''],
    ['9', '2', 'B', '', '100', '0', '', '', '', '5', '', '', '', ''],
  ]);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => renumberTaskIds());
  await page.waitForTimeout(300);
  await expect(page.locator('#btnUndo')).toBeEnabled();

  await page.click('#btnUndo');
  await page.waitForTimeout(300);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.ID]).toBe('5');
  expect(data[1][COL.ID]).toBe('9');
  expect(data[1][COL.DEP]).toBe('5');
});

test('CSV export reflects the renumbered IDs and their rewritten Depends/Parent links', async ({ page }) => {
  await loadFixture(page, [
    ['4', '1', 'Parent', '', '', '0', '', '', '', '', '', '', '', ''],
    ['8', '1.1', 'Child', '', '100', '0', '', '', '', '', '4', '', '', ''],
  ]);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => renumberTaskIds());
  await page.waitForTimeout(300);

  const exportData = await page.evaluate(() => sheet.getData());
  expect(exportData[0][COL.ID]).toBe('1');
  expect(exportData[1][COL.PARENT]).toBe('1');
});
