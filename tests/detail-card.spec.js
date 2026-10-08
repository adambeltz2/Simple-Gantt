// @ts-check
const { test, expect } = require('./fixtures');

// User-requested, with a screenshot of the grid's right-click context menu:
// a single form ("Edit Details...") showing every field of one task, instead
// of tabbing cell-to-cell across the grid. Deliberately staged, not live:
// every edit lands in a local pending object until Save, which applies every
// changed field in one isSyncing-suppressed batch (same pattern as
// applyBulkEdit) so one card edit is one Undo step. Cancel/X/Esc never need
// to revert anything, since nothing was ever written to the sheet -- and
// unlike every other modal in this app, clicking the backdrop does nothing,
// since this card can hold several pending edits at once.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12, STATUS: 13 };

function row(overrides) {
  const r = Array(14).fill('');
  Object.assign(r, overrides);
  return r;
}

async function loadTasks(page, rows, extra) {
  await page.evaluate(({ rows, extra }) => {
    appDB.projects[appDB.activeId].data = rows;
    appDB.projects[appDB.activeId].resources = (extra && extra.resources) || [];
    appDB.projects[appDB.activeId].labels = (extra && extra.labels) || [];
    appDB.projects[appDB.activeId].columns = (extra && extra.columns) || [];
    renderGrid(rows);
    syncToGantt(true);
  }, { rows, extra });
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
  await loadTasks(page, [
    row({ [COL.ID]: '1', [COL.OUTLINE]: '1', [COL.NAME]: 'Parent Task', [COL.PCT]: '50', [COL.START]: '2026-08-24', [COL.DUR]: '5', [COL.END]: '2026-08-28' }),
    row({ [COL.ID]: '2', [COL.OUTLINE]: '1.1', [COL.NAME]: 'Child Task', [COL.RESOURCE]: 'Alice (50%)', [COL.ALLOC]: '100', [COL.PCT]: '40', [COL.START]: '2026-08-24', [COL.DUR]: '3', [COL.END]: '2026-08-26', [COL.PARENT]: '1', [COL.LABELS]: 'Design' }),
  ], { resources: ['Alice', 'Bob'], labels: ['Design', 'Dev'] });
});

test('the row context menu includes "Edit Details..." between Notes and Move row up', async ({ page }) => {
  const titles = await page.evaluate(() => sheet.options.contextMenu(sheet, undefined, '1', {}).map(i => i.title));
  const notesIdx = titles.findIndex(t => t.includes('Notes'));
  const detailsIdx = titles.indexOf('📋 Edit Details...');
  const moveUpIdx = titles.findIndex(t => t.includes('Move row up'));
  expect(detailsIdx).toBeGreaterThan(-1);
  expect(detailsIdx).toBeGreaterThan(notesIdx);
  expect(detailsIdx).toBeLessThan(moveUpIdx);
});

test('opening the card populates header and fields from the row', async ({ page }) => {
  await page.evaluate(() => sheet.options.contextMenu(sheet, undefined, '1', {}).find(i => i.title === '📋 Edit Details...').onclick());
  await expect(page.locator('#detailCardModal')).toHaveClass(/active/);
  await expect(page.locator('#detailCardTaskName')).toHaveText('Child Task');
  await expect(page.locator('#detailCardTaskMeta')).toHaveText('Task ID 2 · Outline 1.1');

  const pending = await page.evaluate(() => detailCardContext.pending);
  expect(pending.resource).toBe('Alice (50%)');
  expect(pending.start).toBe('2026-08-24');
  expect(pending.labels).toBe('Design');
});

test('clicking the backdrop does not close the card', async ({ page }) => {
  await page.evaluate(() => openDetailCardModal(1));
  await page.locator('#detailCardModal').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#detailCardModal')).toHaveClass(/active/);
});

test('Escape closes the card without saving', async ({ page }) => {
  await page.evaluate(() => openDetailCardModal(1));
  await page.evaluate(() => { detailCardContext.pending.name = 'Changed But Discarded'; });
  await page.keyboard.press('Escape');
  await expect(page.locator('#detailCardModal')).not.toHaveClass(/active/);
  const row = await page.evaluate(() => sheet.getData()[1]);
  expect(row[COL.NAME]).toBe('Child Task');
});

test('Cancel button closes without saving, X behaves the same', async ({ page }) => {
  await page.evaluate(() => openDetailCardModal(1));
  await page.evaluate(() => { detailCardContext.pending.name = 'Changed But Discarded'; });
  await page.click('#detailCardModal button:has-text("Cancel")');
  await expect(page.locator('#detailCardModal')).not.toHaveClass(/active/);
  let r = await page.evaluate(() => sheet.getData()[1]);
  expect(r[COL.NAME]).toBe('Child Task');

  await page.evaluate(() => openDetailCardModal(1));
  await page.evaluate(() => { detailCardContext.pending.name = 'Changed But Discarded'; });
  await page.click('#detailCardModal span[title="Cancel"]');
  await expect(page.locator('#detailCardModal')).not.toHaveClass(/active/);
  r = await page.evaluate(() => sheet.getData()[1]);
  expect(r[COL.NAME]).toBe('Child Task');
});

test('Save applies every changed field as a single Undo step', async ({ page }) => {
  await page.evaluate(() => openDetailCardModal(1));
  await page.evaluate(() => {
    detailCardContext.pending.name = 'Renamed Task';
    detailCardContext.pending.pct = '75';
  });
  await page.click('#detailCardModal button:has-text("Save")');
  await expect(page.locator('#detailCardModal')).not.toHaveClass(/active/);

  const r = await page.evaluate(() => sheet.getData()[1]);
  expect(r[COL.NAME]).toBe('Renamed Task');
  expect(r[COL.PCT]).toBe('75');

  const undoDisabled = await page.evaluate(() => document.getElementById('btnUndo').disabled);
  expect(undoDisabled).toBe(false);
  await page.click('#btnUndo');
  const reverted = await page.evaluate(() => sheet.getData()[1]);
  expect(reverted[COL.NAME]).toBe('Child Task');
  expect(reverted[COL.PCT]).toBe('40');
});

test('% Done must be 0-100 on Save, same bound Bulk Edit enforces', async ({ page }) => {
  let dialogMessage = '';
  page.on('dialog', (d) => { dialogMessage = d.message(); d.accept(); });
  await page.evaluate(() => openDetailCardModal(1));
  await page.evaluate(() => { detailCardContext.pending.pct = '150'; });
  await page.click('#detailCardModal button:has-text("Save")');
  expect(dialogMessage).toContain('% Done must be a number from 0 to 100');
  await expect(page.locator('#detailCardModal')).toHaveClass(/active/);
});

test('toggling a Resource chip updates the pending comma-joined value, preserving allocation suffixes', async ({ page }) => {
  await page.evaluate(() => openDetailCardModal(1));
  // Alice is already on (with her suffix intact); Bob is off.
  await page.click('.dc-chip:has-text("Bob")');
  const pending = await page.evaluate(() => detailCardContext.pending.resource);
  expect(pending).toBe('Alice (50%), Bob');

  await page.click('.dc-chip:has-text("Alice")');
  const pending2 = await page.evaluate(() => detailCardContext.pending.resource);
  expect(pending2).toBe('Bob');
});

test('toggling a Labels chip updates the pending comma-joined value', async ({ page }) => {
  await page.evaluate(() => openDetailCardModal(1));
  await page.click('.dc-chip:has-text("Dev")');
  const pending = await page.evaluate(() => detailCardContext.pending.labels);
  expect(pending).toBe('Design, Dev');
});

test('the Parent select excludes the row itself and writes the chosen id on Save', async ({ page }) => {
  await loadTasks(page, [
    row({ [COL.ID]: '1', [COL.OUTLINE]: '1', [COL.NAME]: 'Task A' }),
    row({ [COL.ID]: '2', [COL.OUTLINE]: '2', [COL.NAME]: 'Task B' }),
    row({ [COL.ID]: '3', [COL.OUTLINE]: '3', [COL.NAME]: 'Task C' }),
  ]);
  await page.evaluate(() => openDetailCardModal(0));
  const optionValues = await page.locator('#detailCardBody select option').evaluateAll(opts => opts.map(o => o.value));
  expect(optionValues).toEqual(['', '2', '3']); // (none), then every row except the source itself

  await page.evaluate(() => { detailCardContext.pending.parent = '2'; });
  await page.click('#detailCardModal button:has-text("Save")');
  const r = await page.evaluate(() => sheet.getData()[0]);
  expect(r[COL.PARENT]).toBe('2');
});

test('checking a Depends checkbox writes a semicolon-joined id list on Save', async ({ page }) => {
  await loadTasks(page, [
    row({ [COL.ID]: '1', [COL.OUTLINE]: '1', [COL.NAME]: 'Task A' }),
    row({ [COL.ID]: '2', [COL.OUTLINE]: '2', [COL.NAME]: 'Task B' }),
    row({ [COL.ID]: '3', [COL.OUTLINE]: '3', [COL.NAME]: 'Task C' }),
  ]);
  await page.evaluate(() => openDetailCardModal(0));
  await page.locator('.detailCardDependsCheckbox[value="2"]').check();
  await page.locator('.detailCardDependsCheckbox[value="3"]').check();
  await page.click('#detailCardModal button:has-text("Save")');
  const r = await page.evaluate(() => sheet.getData()[0]);
  expect(r[COL.DEP]).toBe('2;3');
});

test('a parent row shows Start/Duration/End/% Done/Def. Alloc as read-only, matching the grid', async ({ page }) => {
  await page.evaluate(() => openDetailCardModal(0)); // row 0 is the Parent Task, has a child
  const readOnlyCount = await page.locator('#detailCardBody div').filter({ hasText: /^(2026-08-24|5|2026-08-28|50)$/ }).count();
  expect(readOnlyCount).toBeGreaterThan(0);

  // Attempting to save a pending change to a read-only field is silently skipped.
  await page.evaluate(() => { detailCardContext.pending.pct = '999'; }); // would fail validation if it were writable
  const roCheck = await page.evaluate(() => sheet.isReadOnly([5, 0])); // COL.PCT on the parent row
  expect(roCheck).toBe(true);
});

test('editing End directly back-solves Duration instead of being silently reverted by the Start+Duration sync', async ({ page }) => {
  await page.evaluate(() => openDetailCardModal(1)); // Child Task: Start 2026-08-24, Dur 3, End 2026-08-26
  await page.evaluate(() => {
    detailCardContext.pending.end = '2026-08-28';
    detailCardContext.endTouched = true;
  });
  await page.click('#detailCardModal button:has-text("Save")');
  const r = await page.evaluate(() => sheet.getData()[1]);
  expect(r[COL.END]).toBe('2026-08-28');
  expect(parseInt(r[COL.DUR], 10)).toBeGreaterThan(3);
});

test('a custom column field is editable and saves', async ({ page }) => {
  await loadTasks(page, [
    row({ [COL.ID]: '1', [COL.OUTLINE]: '1', [COL.NAME]: 'Task A' }),
  ], { columns: ['JIRA'] });
  await page.evaluate(() => openDetailCardModal(0));
  await page.evaluate(() => { detailCardContext.customCols[0].value = 'TMD-971'; });
  await page.click('#detailCardModal button:has-text("Save")');
  const r = await page.evaluate(() => sheet.getData()[0]);
  expect(r[14]).toBe('TMD-971');
});

test('the Notes link opens the Notes modal, confirming first if the card has unsaved edits', async ({ page }) => {
  let confirmed = false;
  page.on('dialog', (d) => { confirmed = true; d.accept(); });
  await page.evaluate(() => openDetailCardModal(1));
  await page.evaluate(() => { detailCardContext.pending.name = 'Dirty Edit'; });
  await page.click('.detailCardOpenNotes');
  expect(confirmed).toBe(true);
  await expect(page.locator('#notesModal')).toHaveClass(/active/);
  await expect(page.locator('#detailCardModal')).not.toHaveClass(/active/);
});

test('the Notes link opens Notes without confirming when the card has no unsaved edits', async ({ page }) => {
  let confirmed = false;
  page.on('dialog', (d) => { confirmed = true; d.accept(); });
  await page.evaluate(() => openDetailCardModal(1));
  await page.click('.detailCardOpenNotes');
  expect(confirmed).toBe(false);
  await expect(page.locator('#notesModal')).toHaveClass(/active/);
});
