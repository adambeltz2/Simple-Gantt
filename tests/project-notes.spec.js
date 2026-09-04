// @ts-check
const { test, expect } = require('@playwright/test');

// Covers the system/project-level Notes field (backlog #19b): a single
// Markdown note for the whole project, not tied to any task row. Distinct
// from the per-task "Notes" custom column (tests/notes-field.spec.js) --
// opened via its own toolbar button rather than a grid cell, and stored as
// appDB.projects[id].projectNotes rather than a column value. Reuses the
// same click-to-expand-and-edit Markdown UX/renderer as the per-task Notes
// column. Deliberately localStorage-only, same tier as the named-resources
// registry and the "in progress" flag -- not part of CSV export (there's no
// row for it to belong to) and not part of a Dropbox backup (which is a CSV
// export of the grid data, not a JSON dump of the project object).

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
});

test('the toolbar button opens a modal titled with the project name', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await expect(page.locator('#projectNotesModal')).toHaveClass(/active/);
  await expect(page.locator('#projectNotesModalTitle')).toHaveText('Project Notes — Example Project');
});

test('an empty project note shows a placeholder, not a blank modal', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await expect(page.locator('#projectNotesBody')).toContainText('No project notes yet');
});

test('editing and saving persists to the project object and re-renders the Markdown', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', 'Scope notes:\n- **v1** ships grid only\n- see [issue](https://example.com)');
  await page.click('#projectNotesSaveBtn');

  const stored = await page.evaluate(() => appDB.projects[appDB.activeId].projectNotes);
  expect(stored).toBe('Scope notes:\n- **v1** ships grid only\n- see [issue](https://example.com)');

  await expect(page.locator('#projectNotesBody strong')).toHaveText('v1');
  await expect(page.locator('#projectNotesBody a')).toHaveAttribute('href', 'https://example.com');
  await expect(page.locator('#projectNotesBody li')).toHaveCount(2);
});

test('Cancel discards unsaved edits', async ({ page }) => {
  await page.evaluate(() => { appDB.projects[appDB.activeId].projectNotes = 'Original note'; saveToLocal(); });
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', 'this should not be saved');
  await page.click('#projectNotesCancelBtn');

  const stored = await page.evaluate(() => appDB.projects[appDB.activeId].projectNotes);
  expect(stored).toBe('Original note');
  await expect(page.locator('#projectNotesBody')).toContainText('Original note');
});

test('user-typed HTML in the project note is escaped, not executed', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', '<img src=x onerror=alert(1)>');
  await page.click('#projectNotesSaveBtn');

  const imgCount = await page.locator('#projectNotesBody img').count();
  expect(imgCount).toBe(0);
  const bodyText = await page.locator('#projectNotesBody').textContent();
  expect(bodyText).toContain('<img src=x onerror=alert(1)>');
  expect(page.consoleErrors).toEqual([]);
});

test('Close then reopening shows the saved note, not stale edit-mode state', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', 'Saved note');
  await page.click('#projectNotesSaveBtn');
  await page.click('button[onclick="closeProjectNotesModal()"]');
  await expect(page.locator('#projectNotesModal')).not.toHaveClass(/active/);

  await page.click('#btnProjectNotes');
  await expect(page.locator('#projectNotesBody')).toContainText('Saved note');
  await expect(page.locator('#projectNotesEditBtn')).toBeVisible();
  await expect(page.locator('#projectNotesSaveBtn')).toBeHidden();
});

test('the project note persists across a reload', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', 'Persisted note');
  await page.click('#projectNotesSaveBtn');

  await page.reload();
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);

  const stored = await page.evaluate(() => appDB.projects[appDB.activeId].projectNotes);
  expect(stored).toBe('Persisted note');
});

test('project notes are per-project, not shared globally', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', 'Note for project A');
  await page.click('#projectNotesSaveBtn');
  await page.click('button[onclick="closeProjectNotesModal()"]');

  await page.evaluate(() => {
    const newId = 'proj_test_2';
    appDB.projects[newId] = { name: 'Project B', columns: [], data: [['1', '1', '', '', '', '0', '', '', '', '', '', '']], collapsed: [], flagged: [], resources: [] };
    appDB.activeId = newId;
    renderGrid();
    syncToGantt(true);
  });
  await page.waitForTimeout(200);

  await page.click('#btnProjectNotes');
  await expect(page.locator('#projectNotesModalTitle')).toHaveText('Project Notes — Project B');
  await expect(page.locator('#projectNotesBody')).toContainText('No project notes yet');
});

test('project notes have no footprint in CSV export headers', async ({ page }) => {
  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers).toEqual([
    'Task ID', 'Outline', 'Task Name', 'Resource', 'Def. Alloc',
    '% Done', 'Start', 'Dur.', 'End', 'Depends', 'Parent', 'Labels',
  ]);
});

test('no uncaught JS errors while opening, editing, saving, and closing project notes', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', 'Some note');
  await page.click('#projectNotesSaveBtn');
  await page.click('button[onclick="closeProjectNotesModal()"]');

  expect(page.consoleErrors).toEqual([]);
});
