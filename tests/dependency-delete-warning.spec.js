// @ts-check
const { test, expect } = require('./fixtures');

// User-reported gap: deleting a task that other tasks list in their own
// Depends column was completely silent -- no warning, no cleanup. The
// survivors' Depends cell keeps referencing a Task ID that no longer
// exists, and syncToGantt's scheduling loop just skips a dangling
// dependency ID with no explanation (see the `if (dep)` guard around the
// dependency date-resolution loop), so the dependent task quietly stops
// being scheduled relative to anything.
//
// Two additive, view-only pieces close this gap, mirroring how dependency
// cycle detection (tests/dependency-cycle-detection.spec.js) is built:
// (1) a 🔗 indicator on the ID cell of any task that OTHER rows depend on
// (the reverse of what the Depends column itself shows), and (2) a confirm()
// before "Delete row" actually removes a row, naming every surviving task
// that would be left with a dangling Depends reference.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12 };

function row(id, outline, name, dep, parent) {
  const r = Array(13).fill('');
  r[COL.ID] = id; r[COL.OUTLINE] = outline; r[COL.NAME] = name;
  r[COL.PCT] = '0'; r[COL.START] = '2026-08-24'; r[COL.DUR] = '1'; r[COL.END] = '2026-08-24';
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

function idCellLinkTitle(page, rowIndex) {
  return page.evaluate((y) => {
    const el = sheet.records[y][0].querySelector('.depended-on-indicator'); // COL.ID
    return el ? el.title : null;
  }, rowIndex);
}

async function selectRows(page, rowTop, rowBottom) {
  await page.evaluate(({ rowTop, rowBottom }) => {
    sheet.updateSelectionFromCoords(0, rowTop, sheet.options.columns.length - 1, rowBottom);
  }, { rowTop, rowBottom });
}

function clickDeleteRow(page, rowIdx) {
  return page.evaluate((rowIdx) => {
    const items = sheet.options.contextMenu(sheet, undefined, String(rowIdx), {});
    items.find((i) => i.title === 'Delete row').onclick();
  }, rowIdx);
}

async function idOrder(page) {
  return page.evaluate(() => sheet.getData().map((r) => r[0]));
}

test('a task other rows depend on shows a 🔗 indicator naming its dependents', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Design', '', ''),
    row('2', '2', 'Build', '1', ''),
    row('3', '3', 'Test', '1', ''),
  ]);

  const title = await idCellLinkTitle(page, 0);
  expect(title).toContain('Depended on by');
  expect(title).toContain('2 (Build)');
  expect(title).toContain('3 (Test)');
});

test('a task nothing depends on shows no indicator', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Design', '', ''),
    row('2', '2', 'Build', '', ''),
  ]);

  expect(await idCellLinkTitle(page, 0)).toBeNull();
  expect(await idCellLinkTitle(page, 1)).toBeNull();
});

test('a task that only depends on others (not depended on itself) shows no indicator', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Design', '', ''),
    row('2', '2', 'Build', '1', ''),
  ]);

  expect(await idCellLinkTitle(page, 1)).toBeNull();
});

test('deleting a task with a dependent shows a confirm naming it, and cancelling keeps the row', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Design', '', ''),
    row('2', '2', 'Build', '1', ''),
  ]);

  let dialogMessage = null;
  page.once('dialog', (dialog) => { dialogMessage = dialog.message(); dialog.dismiss(); });

  await clickDeleteRow(page, 0);
  await page.waitForTimeout(200);

  expect(dialogMessage).toContain('break the Depends link for 1 other task');
  expect(dialogMessage).toContain('2 (Build)');
  expect(await idOrder(page)).toEqual(['1', '2']); // nothing deleted
});

test('deleting a task with a dependent proceeds once the confirm is accepted', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Design', '', ''),
    row('2', '2', 'Build', '1', ''),
  ]);

  page.once('dialog', (dialog) => dialog.accept());
  await clickDeleteRow(page, 0);
  await page.waitForTimeout(200);

  expect(await idOrder(page)).toEqual(['2']);
});

test('deleting a task nobody depends on shows no confirm at all', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Design', '', ''),
    row('2', '2', 'Build', '', ''),
  ]);

  let dialogFired = false;
  page.on('dialog', (dialog) => { dialogFired = true; dialog.dismiss(); });

  await clickDeleteRow(page, 0);
  await page.waitForTimeout(200);

  expect(dialogFired).toBe(false);
  expect(await idOrder(page)).toEqual(['2']);
});

test('deleting a multi-row selection that already contains the only dependent shows no confirm', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Design', '', ''),
    row('2', '2', 'Build', '1', ''),
    row('3', '3', 'Ship', '', ''),
  ]);

  let dialogFired = false;
  page.on('dialog', (dialog) => { dialogFired = true; dialog.dismiss(); });

  await selectRows(page, 0, 1); // Design + Build, its only dependent, both go together
  await clickDeleteRow(page, 0);
  await page.waitForTimeout(200);

  expect(dialogFired).toBe(false);
  expect(await idOrder(page)).toEqual(['3']);
});

test('deleting a multi-row selection warns about a dependent left outside it', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Design', '', ''),
    row('2', '2', 'Spec', '', ''),
    row('3', '3', 'Build', '1;2', ''),
  ]);

  let dialogMessage = null;
  page.once('dialog', (dialog) => { dialogMessage = dialog.message(); dialog.dismiss(); });

  await selectRows(page, 0, 1); // Design + Spec, but Build (outside) depends on both
  await clickDeleteRow(page, 0);
  await page.waitForTimeout(200);

  expect(dialogMessage).toContain('break the Depends link for 1 other task');
  expect(dialogMessage).toContain('3 (Build)');
  expect(await idOrder(page)).toEqual(['1', '2', '3']); // nothing deleted
});
