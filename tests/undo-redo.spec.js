// @ts-check
const { test, expect } = require('@playwright/test');

// Covers backlog #11, Undo/redo. Deliberately whole-snapshot, not a per-cell
// diff/command log: a cell edit can cascade through dependency scheduling and
// parent rollup (a changed Start/Dur recomputes End, which recomputes a
// parent's rolled-up Start/End/% Done, all the way up through grandparents),
// so reverting just the touched cell would leave every computed field
// downstream of it stale. Undo/redo instead restores a full prior snapshot of
// the task data and lets the existing render+sync pipeline recompute
// everything fresh -- these tests specifically check that cascade comes back
// correctly, not just the one field a user directly touched.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById('skipWeekends').checked = false; });
});

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

test('Undo and Redo buttons start disabled with no history', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
  ]);
  expect(await page.locator('#btnUndo').isDisabled()).toBe(true);
  expect(await page.locator('#btnRedo').isDisabled()).toBe(true);
});

test('editing a cell enables Undo; clicking it reverts the value and re-disables Undo', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
  ]);
  await page.evaluate(() => sheet.setValueFromCoords(3, 0, 'Bob', true));
  await page.waitForTimeout(200);
  expect(await page.locator('#btnUndo').isDisabled()).toBe(false);

  await page.click('#btnUndo');
  await page.waitForTimeout(200);
  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.RESOURCE]).toBe('Alice');
  expect(await page.locator('#btnUndo').isDisabled()).toBe(true);
  expect(await page.locator('#btnRedo').isDisabled()).toBe(false);
});

test('Redo re-applies an undone change', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
  ]);
  await page.evaluate(() => sheet.setValueFromCoords(3, 0, 'Bob', true));
  await page.waitForTimeout(200);
  await page.click('#btnUndo');
  await page.waitForTimeout(200);
  await page.click('#btnRedo');
  await page.waitForTimeout(200);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.RESOURCE]).toBe('Bob');
  expect(await page.locator('#btnRedo').isDisabled()).toBe(true);
});

test('undoing a Duration change also reverts the dependent task\'s cascaded Start/End, not just the raw cell', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '2', '2026-08-25', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-26', '1', '2026-08-26', '1', ''),
  ]);
  const before = await page.evaluate(() => sheet.getData());
  expect(before[1][COL.START]).toBe('2026-08-26'); // B starts the day after A ends

  // Extend A's duration to 5 days -- B's Start should cascade forward.
  await page.evaluate(() => sheet.setValueFromCoords(7, 0, '5', true));
  await page.waitForTimeout(300);
  const afterEdit = await page.evaluate(() => sheet.getData());
  expect(afterEdit[1][COL.START]).not.toBe('2026-08-26');

  await page.click('#btnUndo');
  await page.waitForTimeout(300);
  const afterUndo = await page.evaluate(() => sheet.getData());
  expect(afterUndo[0][COL.DUR]).toBe('2');
  expect(afterUndo[1][COL.START]).toBe('2026-08-26'); // cascade correctly reverted, not just the raw Duration cell
});

test('undoing a child\'s % Done change also reverts the parent\'s rolled-up % Done', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Parent', '', '', '0', '', '', '', '', ''),
    row('2', '1.1', 'Child A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', '1'),
    row('3', '1.2', 'Child B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', '1'),
  ]);
  const before = await page.evaluate(() => sheet.getData());
  expect(String(before[0][COL.PCT])).toBe('0');

  await page.evaluate(() => sheet.setValueFromCoords(5, 1, '100', true)); // Child A -> 100%
  await page.waitForTimeout(300);
  const afterEdit = await page.evaluate(() => sheet.getData());
  expect(parseInt(afterEdit[0][COL.PCT], 10)).toBeGreaterThan(0); // parent rolled up

  await page.click('#btnUndo');
  await page.waitForTimeout(300);
  const afterUndo = await page.evaluate(() => sheet.getData());
  expect(String(afterUndo[0][COL.PCT])).toBe('0'); // parent rollup correctly reverted too
  expect(String(afterUndo[1][COL.PCT])).toBe('0');
});

test('a Bulk Edit across multiple rows undoes as a single step', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
  ]);
  await page.evaluate(() => sheet.updateSelectionFromCoords(0, 0, sheet.options.columns.length - 1, 2));
  await page.evaluate(() => openBulkEditModal());
  await page.selectOption('#bulkEditField', 'RESOURCE');
  await page.fill('#bulkEditValueText', 'Dave');
  await page.click('button[onclick="applyBulkEdit()"]');
  await page.waitForTimeout(200);

  const afterBulk = await page.evaluate(() => sheet.getData());
  expect(afterBulk[0][COL.RESOURCE]).toBe('Dave');
  expect(afterBulk[1][COL.RESOURCE]).toBe('Dave');
  expect(afterBulk[2][COL.RESOURCE]).toBe('Dave');

  await page.click('#btnUndo');
  await page.waitForTimeout(200);
  const afterUndo = await page.evaluate(() => sheet.getData());
  expect(afterUndo[0][COL.RESOURCE]).toBe('Alice');
  expect(afterUndo[1][COL.RESOURCE]).toBe('Bob');
  expect(afterUndo[2][COL.RESOURCE]).toBe('Carol');
  // One Bulk Edit -> one undo step, not three -- nothing left to undo further back.
  expect(await page.locator('#btnUndo').isDisabled()).toBe(true);
});

test('a new edit after Undo clears the Redo stack', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
  ]);
  await page.evaluate(() => sheet.setValueFromCoords(3, 0, 'Bob', true));
  await page.waitForTimeout(200);
  await page.click('#btnUndo');
  await page.waitForTimeout(200);
  expect(await page.locator('#btnRedo').isDisabled()).toBe(false);

  await page.evaluate(() => sheet.setValueFromCoords(3, 0, 'Carol', true));
  await page.waitForTimeout(200);
  expect(await page.locator('#btnRedo').isDisabled()).toBe(true);
});

test('Ctrl+Z inside the grid triggers app-level undo', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
  ]);
  await page.evaluate(() => sheet.setValueFromCoords(3, 0, 'Bob', true));
  await page.waitForTimeout(200);

  await page.click('.jexcel td', { position: { x: 2, y: 2 } }).catch(() => {});
  await page.locator('#spreadsheet').click();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);

  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.RESOURCE]).toBe('Alice');
});

test('Ctrl+Z while typing in the Bulk Edit modal\'s text field does not trigger grid-level undo', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  await page.evaluate(() => sheet.setValueFromCoords(3, 0, 'Zed', true));
  await page.waitForTimeout(200);

  await page.evaluate(() => sheet.updateSelectionFromCoords(0, 0, sheet.options.columns.length - 1, 1));
  await page.evaluate(() => openBulkEditModal());
  await page.selectOption('#bulkEditField', 'RESOURCE');
  await page.locator('#bulkEditValueText').click();
  await page.keyboard.type('Something');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);

  // Grid data must be untouched by that keystroke -- app-level undo was not invoked.
  const data = await page.evaluate(() => sheet.getData());
  expect(data[0][COL.RESOURCE]).toBe('Zed');
  await page.click('button[onclick="closeBulkEditModal()"]');
});

test('undo/redo history is kept separate per project', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
  ]);
  await page.evaluate(() => sheet.setValueFromCoords(3, 0, 'Bob', true));
  await page.waitForTimeout(200);
  expect(await page.locator('#btnUndo').isDisabled()).toBe(false);

  // Switch to a second project directly (bypassing the prompt() UI) to isolate
  // just the per-project stack behavior.
  await page.evaluate(() => {
    appDB.projects['proj_test2'] = { name: 'Second', columns: [], data: [['1', '1', '', '', '100', '0', '', '', '', '', '', '']], collapsed: [], flagged: [], resources: [] };
    appDB.activeId = 'proj_test2';
    updateUndoRedoButtons();
    renderGrid();
    syncToGantt(true);
  });
  await page.waitForTimeout(200);

  expect(await page.locator('#btnUndo').isDisabled()).toBe(true);
});

test('no console errors across an undo/redo cycle', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
  ]);
  await page.evaluate(() => sheet.setValueFromCoords(5, 0, '50', true));
  await page.waitForTimeout(200);
  await page.click('#btnUndo');
  await page.waitForTimeout(200);
  await page.click('#btnRedo');
  await page.waitForTimeout(200);
  expect(page.consoleErrors).toEqual([]);
});
