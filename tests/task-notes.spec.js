// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #22: Task-level Notes as a permanent core field. Every
// task now always has a Notes column (COL.NOTES, index 12, right after
// Labels) -- no need to add a custom column named "Notes" by hand the way
// tests/notes-field.spec.js's legacy convention still requires. Reuses the
// exact same click-to-expand Markdown modal/renderer as that legacy
// convention and the project-level Notes field (tests/project-notes.spec.js);
// this file focuses on what's specific to it being a permanent core column:
// always present, fixed position, can't be renamed/deleted, and the
// migration paths that fold old data into it.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12 };

async function notesFlag(page, row) {
  const handle = await page.evaluateHandle(
    ([c, y]) => sheet.records[y][c].querySelector('.notes-flag'),
    [COL.NOTES, row]
  );
  return handle.asElement();
}

test('every project has a Notes column, right after Labels, with no setup needed', async ({ page }) => {
  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers[COL.NOTES]).toBe('Notes');
  expect(headers[COL.LABELS]).toBe('Labels');
});

test('a brand new project also gets the Notes column', async ({ page }) => {
  await page.evaluate(() => {
    const newId = 'proj_' + Date.now();
    appDB.projects[newId] = { name: 'Fresh Project', columns: [], data: [['1', '1', '', '', '100', '0', '', '', '', '', '', '', '']], collapsed: [], flagged: [], resources: [] };
    appDB.activeId = newId;
    renderGrid();
    syncToGantt(true);
  });
  await page.waitForTimeout(200);

  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers[COL.NOTES]).toBe('Notes');
});

test('the Notes column is readOnly at the cell level, edited only through the modal', async ({ page }) => {
  const readOnly = await page.evaluate((c) => sheet.options.columns[c].readOnly, COL.NOTES);
  expect(readOnly).toBe(true);
});

test('an empty note shows a "+" flag, a filled one shows the note icon', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  expect(await flag.textContent()).toBe('+');

  await page.evaluate((c) => sheet.setValueFromCoords(c, 0, 'Some **note**', true), COL.NOTES);
  await page.waitForTimeout(200);

  const flagAfter = await notesFlag(page, 0);
  expect(await flagAfter.textContent()).toBe('📝');
});

test('clicking the flag opens the modal, edits Markdown, and saves back to the row', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await expect(page.locator('#notesModal')).toHaveClass(/active/);

  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', 'Task-specific context:\n- **key** decision\n- see [spec](https://example.com)');
  await page.click('#notesSaveBtn');

  const stored = await page.evaluate((c) => sheet.getData()[0][c], COL.NOTES);
  expect(stored).toBe('Task-specific context:\n- **key** decision\n- see [spec](https://example.com)');

  await expect(page.locator('#notesBody strong')).toHaveText('key');
  await expect(page.locator('#notesBody a')).toHaveAttribute('href', 'https://example.com');
});

test('user-typed HTML in a task note is escaped, not executed', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', '<img src=x onerror=alert(1)>');
  await page.click('#notesSaveBtn');

  const imgCount = await page.locator('#notesBody img').count();
  expect(imgCount).toBe(0);
  const bodyText = await page.locator('#notesBody').textContent();
  expect(bodyText).toContain('<img src=x onerror=alert(1)>');
});

test('right-clicking the Notes column header offers no rename/delete, only Insert Column Right', async ({ page }) => {
  const titles = await page.evaluate((c) => sheet.options.contextMenu(sheet, c, null, {}).map((i) => i.title), COL.NOTES);
  expect(titles.some((t) => t.includes('Insert Column Right'))).toBe(true);
  expect(titles.some((t) => t.includes('Rename Column'))).toBe(false);
  expect(titles.some((t) => t.includes('Delete Column'))).toBe(false);
});

test('right-clicking Labels no longer offers Insert Column Right (Notes must stay immediately after it)', async ({ page }) => {
  const titles = await page.evaluate((c) => sheet.options.contextMenu(sheet, c, null, {}).map((i) => i.title), COL.LABELS);
  expect(titles.some((t) => t.includes('Core columns cannot be modified'))).toBe(true);
});

test('clicking outside the modal while editing prompts before discarding unsaved changes', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', 'unsaved draft');

  let dialogMessage = '';
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });
  await page.click('#notesModal', { position: { x: 5, y: 5 } });
  expect(dialogMessage).toContain('unsaved changes');
  await expect(page.locator('#notesModal')).toHaveClass(/active/);
  await expect(page.locator('#notesEditTextarea')).toHaveValue('unsaved draft');

  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#notesModal', { position: { x: 5, y: 5 } });
  await expect(page.locator('#notesModal')).not.toHaveClass(/active/);

  const stored = await page.evaluate((c) => sheet.getData()[0][c], COL.NOTES);
  expect(stored).not.toBe('unsaved draft');
});

test('clicking outside the modal does not prompt when there are no unsaved changes', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();

  let dialogFired = false;
  page.once('dialog', (dialog) => { dialogFired = true; dialog.dismiss(); });
  await page.click('#notesModal', { position: { x: 5, y: 5 } });
  await page.waitForTimeout(100);

  expect(dialogFired).toBe(false);
  await expect(page.locator('#notesModal')).not.toHaveClass(/active/);
});

test('Notes round-trips through CSV export/import at its fixed core position', async ({ page }) => {
  const fs = require('fs');
  await page.evaluate((c) => sheet.setValueFromCoords(c, 0, 'Exported note', true), COL.NOTES);
  await page.waitForTimeout(200);

  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const csvBuffer = fs.readFileSync(await download.path());
  const headerLine = csvBuffer.toString('utf8').split('\n')[0].trim();
  expect(headerLine.split(',')).toEqual([
    'Task ID', 'Outline', 'Task Name', 'Resource', 'Def. Alloc',
    '% Done', 'Start', 'Dur.', 'End', 'Depends', 'Parent', 'Labels', 'Notes',
  ]);

  await page.setInputFiles('#csvFile', { name: 'export.csv', mimeType: 'text/csv', buffer: csvBuffer });
  await page.waitForTimeout(400);

  const reimported = await page.evaluate((c) => sheet.getData()[0][c], COL.NOTES);
  expect(reimported).toBe('Exported note');
});

test('a CSV exported before Notes existed (no Notes header) imports with a blank Notes column, not misaligned custom columns', async ({ page }) => {
  const csv = [
    'Task ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent,Labels,JIRA',
    '1,1,Legacy Task,Alice,100,0,2026-08-24,1,2026-08-24,,,,PROJ-9',
  ].join('\n');
  await page.setInputFiles('#csvFile', { name: 'legacy.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForTimeout(400);

  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers[COL.NOTES]).toBe('Notes');
  expect(headers[13]).toBe('JIRA');

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.NOTES]).toBe('');
  expect(row[13]).toBe('PROJ-9');
});

test('a legacy in-memory project with a custom "Notes" column folds it into the core field on load (localStorage migration path)', async ({ page }) => {
  const before = await page.evaluate(() => {
    // Simulate what a pre-#22 save looked like: "Notes" as the project's
    // only custom column, sitting right after the (then-final) Labels
    // column, exactly as normalizeData()/migrateLegacyNotesColumn() expect
    // to find it on a real localStorage load.
    const legacyProject = {
      name: 'Legacy Project',
      columns: ['Notes'],
      data: [
        ['1', '1', 'Old task with a note', '', '', '0', '', '', '', '', '', '', 'Legacy **note**'],
        ['2', '2', 'Old task without one', '', '', '0', '', '', '', '', '', '', ''],
      ],
      collapsed: [], flagged: [], resources: [],
    };
    legacyProject.data = normalizeData(legacyProject.data, legacyProject.columns.length);
    migrateLegacyNotesColumn(legacyProject);
    return legacyProject;
  });

  expect(before.columns).toEqual([]); // the legacy custom "Notes" column is gone
  expect(before.data[0][COL.NOTES]).toBe('Legacy **note**');
  expect(before.data[1][COL.NOTES]).toBe('');
  expect(before.data[0].length).toBe(13); // no leftover trailing custom-column slot
});
