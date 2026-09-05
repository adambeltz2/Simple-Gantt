// @ts-check
const { test, expect } = require('@playwright/test');

// Covers backlog #21, moving a task relative to a specific Task ID (via the
// grid's row right-click menu -> "Move to Task ID..."), rather than only
// one-step-at-a-time drag/Move row up/down. Moving also reparents the task to
// match the target's own Parent -- treated as one action, since WBS/Outline
// numbering (syncToGantt()) groups purely by each row's own Parent field, so
// a repositioned row whose Parent still pointed elsewhere would show at the
// wrong outline depth for where it now visually sits.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;
  page.on('dialog', (dialog) => { page.lastDialogMessage = dialog.message(); dialog.accept(); });

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
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

async function idOrder(page) {
  return page.evaluate(() => sheet.getData().map((r) => r[0]));
}

test('opening the modal populates the target dropdown, excluding the source task itself', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
  ]);
  await page.evaluate(() => openMoveTaskModal(0));
  await expect(page.locator('#moveTaskModal')).toHaveClass(/active/);
  await expect(page.locator('#moveTaskSourceLabel')).toHaveText('1 - Task A');

  const optionValues = await page.locator('#moveTaskTargetId option').evaluateAll((opts) => opts.map((o) => o.value));
  expect(optionValues).toEqual(['2', '3']); // task 1 (the source) excluded
});

test('moving a task after a same-parent target reorders it, Parent unchanged', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
  ]);
  const result = await page.evaluate(() => moveTaskRelativeToId('1', '3', 'after'));
  expect(result.ok).toBe(true);
  await page.waitForTimeout(200);

  expect(await idOrder(page)).toEqual(['2', '3', '1']);
  const data = await page.evaluate(() => sheet.getData());
  expect(data.find((r) => r[COL.ID] === '1')[COL.PARENT]).toBe('');
});

test('moving a task before a target reorders it correctly', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
  ]);
  const result = await page.evaluate(() => moveTaskRelativeToId('3', '1', 'before'));
  expect(result.ok).toBe(true);
  await page.waitForTimeout(200);

  expect(await idOrder(page)).toEqual(['3', '1', '2']);
});

test('moving a task next to a target under a different parent reparents it to match', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Parent One', '', '', '0', '', '', '', '', ''),
    row('2', '1.1', 'Child of One', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', '1'),
    row('3', '2', 'Parent Two', '', '', '0', '', '', '', '', ''),
    row('4', '2.1', 'Child of Two', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', '3'),
  ]);
  // Move Child of One (id 2) to sit right after Child of Two (id 4, parent 3).
  const result = await page.evaluate(() => moveTaskRelativeToId('2', '4', 'after'));
  expect(result.ok).toBe(true);
  await page.waitForTimeout(200);

  expect(await idOrder(page)).toEqual(['1', '3', '4', '2']);
  const data = await page.evaluate(() => sheet.getData());
  const moved = data.find((r) => r[COL.ID] === '2');
  expect(moved[COL.PARENT]).toBe('3'); // reparented to match target's own parent
  expect(moved[COL.OUTLINE]).toBe('2.2'); // outline recomputed under the new parent
});

test('moving a task relative to itself is rejected', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
  ]);
  const result = await page.evaluate(() => moveTaskRelativeToId('1', '1', 'after'));
  expect(result.ok).toBe(false);
  expect(result.error).toContain("itself");
});

test('moving a task onto one of its own descendants is rejected, data left untouched', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Grandparent', '', '', '0', '', '', '', '', ''),
    row('2', '1.1', 'Parent', '', '', '0', '', '', '', '', '1'),
    row('3', '1.1.1', 'Child', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', '2'),
  ]);
  const before = await idOrder(page);

  // Moving task 1 (an ancestor of 3) next to task 3 (its own grandchild)
  // would make it a child of its own descendant -- must be rejected.
  const result = await page.evaluate(() => moveTaskRelativeToId('1', '3', 'after'));
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/descendant/i);

  expect(await idOrder(page)).toEqual(before);
  const data = await page.evaluate(() => sheet.getData());
  expect(data.find((r) => r[COL.ID] === '1')[COL.PARENT]).toBe('');
});

test('moving a task onto a nonexistent target ID is rejected', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
  ]);
  const result = await page.evaluate(() => moveTaskRelativeToId('1', '999', 'after'));
  expect(result.ok).toBe(false);
  expect(result.error).toContain("not found");
});

test('a move is a single Undo step -- one Undo reverts both the position and the reparent together', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Parent One', '', '', '0', '', '', '', '', ''),
    row('2', '1.1', 'Child of One', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', '1'),
    row('3', '2', 'Parent Two', '', '', '0', '', '', '', '', ''),
  ]);
  await page.evaluate(() => moveTaskRelativeToId('2', '3', 'after'));
  await page.waitForTimeout(200);
  expect(await idOrder(page)).toEqual(['1', '3', '2']);
  expect(await page.locator('#btnUndo').isDisabled()).toBe(false);

  await page.click('#btnUndo');
  await page.waitForTimeout(200);

  expect(await idOrder(page)).toEqual(['1', '2', '3']);
  const data = await page.evaluate(() => sheet.getData());
  expect(data.find((r) => r[COL.ID] === '2')[COL.PARENT]).toBe('1'); // reparent also reverted
  expect(await page.locator('#btnUndo').isDisabled()).toBe(true);
});

test('the "Move to Task ID..." context menu item is present in the row menu', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  const titles = await page.evaluate(() => sheet.options.contextMenu(sheet, 0, 0, {}).map((i) => i.title));
  expect(titles).toContain('🎯 Move to Task ID...');
});

test('Cancel closes the modal without moving anything', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
  ]);
  await page.evaluate(() => openMoveTaskModal(0));
  await page.click('button[onclick="closeMoveTaskModal()"]');
  await expect(page.locator('#moveTaskModal')).not.toHaveClass(/active/);
  expect(await idOrder(page)).toEqual(['1', '2']);
});

test('no console errors while opening, moving, and undoing', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''),
    row('2', '2', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''),
    row('3', '3', 'Task C', 'Carol', '100', '0', '2026-08-26', '1', '2026-08-26', '', ''),
  ]);
  await page.evaluate(() => openMoveTaskModal(0));
  await page.selectOption('#moveTaskTargetId', '3');
  await page.click('button[onclick="applyMoveTask()"]');
  await page.waitForTimeout(200);
  await page.click('#btnUndo');
  await page.waitForTimeout(200);
  expect(page.consoleErrors).toEqual([]);
});
