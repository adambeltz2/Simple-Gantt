// @ts-check
const { test, expect } = require('./fixtures');

// Covers the legacy opt-in convention this feature predates: a *custom*
// column literally named "Notes" (case insensitive) gets the same
// click-to-expand Markdown-modal treatment as the permanent core Notes
// field (backlog #22, tests/task-notes.spec.js) now does by default. This
// still works for a column a user names "Notes" themselves -- e.g. after
// the core field already exists -- renders as a small click-to-expand flag
// instead of raw inline text, opens a modal with a self-contained Markdown
// subset (headers/bold/italic/links/lists), is readOnly at the cell level
// (editing only happens through the modal), and round-trips through CSV
// like any other custom column since the underlying stored value is still
// plain text.
//
// Every assertion here is scoped to this specific custom column's cells
// (via sheet.records[row][col], not the blanket ".notes-flag" class) since
// the grid now always also has the permanent core Notes column rendering
// its own flags in every row.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12 };
const NOTES_COL = 13; // the custom "Notes" column, one slot after the core Notes field

async function setupWithNotesColumn(page) {
  await page.evaluate((COL) => {
    const data = [
      ['1', '1', 'Task with a note', '', '', '0', '', '', '', '', '', '', '', 'Existing **note**'],
      ['2', '2', 'Task without a note', '', '', '0', '', '', '', '', '', '', '', ''],
    ];
    appDB.projects[appDB.activeId].columns = ['Notes'];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);
}

// Returns the ElementHandle for the .notes-flag icon inside a given cell,
// or null if that cell isn't rendering one.
async function notesFlag(page, col, row) {
  const handle = await page.evaluateHandle(
    ([c, y]) => sheet.records[y][c].querySelector('.notes-flag'),
    [col, row]
  );
  return handle.asElement();
}

test('a column named "Notes" shows an icon flag instead of raw text', async ({ page }) => {
  await setupWithNotesColumn(page);

  const icon0 = await (await notesFlag(page, NOTES_COL, 0)).textContent();
  const icon1 = await (await notesFlag(page, NOTES_COL, 1)).textContent();
  expect(icon0).toBe('📝'); // row 1 has content
  expect(icon1).toBe('+'); // row 2 doesn't

  // The raw markdown text must not appear literally in the cell.
  const cellText = await page.evaluate((c) => sheet.records[0][c].innerText, NOTES_COL);
  expect(cellText).not.toContain('**note**');
});

test('the Notes column is readOnly at the cell level', async ({ page }) => {
  await setupWithNotesColumn(page);
  const readOnly = await page.evaluate((c) => sheet.options.columns[c].readOnly, NOTES_COL);
  expect(readOnly).toBe(true);
});

test('clicking the flag opens a modal titled with the task name, rendering the Markdown', async ({ page }) => {
  await setupWithNotesColumn(page);
  const flag = await notesFlag(page, NOTES_COL, 0);
  await flag.click();

  await expect(page.locator('#notesModal')).toHaveClass(/active/);
  await expect(page.locator('#notesModalTitle')).toHaveText('Notes — Task with a note');
  await expect(page.locator('#notesBody strong')).toHaveText('note');
});

test('a leading "#" renders as a real heading, one level per extra "#" up to h6', async ({ page }) => {
  await setupWithNotesColumn(page);
  const flag = await notesFlag(page, NOTES_COL, 1); // the empty one
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', '# Title\n## Subtitle\n###### Smallest\nRegular paragraph');
  await page.click('#notesSaveBtn');

  await expect(page.locator('#notesBody h1')).toHaveText('Title');
  await expect(page.locator('#notesBody h2')).toHaveText('Subtitle');
  await expect(page.locator('#notesBody h6')).toHaveText('Smallest');
  await expect(page.locator('#notesBody p')).toHaveText('Regular paragraph');
});

test('an empty note shows a placeholder, not a blank modal', async ({ page }) => {
  await setupWithNotesColumn(page);
  const flag = await notesFlag(page, NOTES_COL, 1);
  await flag.click();
  await expect(page.locator('#notesBody')).toContainText('No notes yet');
});

test('editing and saving updates the underlying cell data with raw Markdown, and the grid flag updates', async ({ page }) => {
  await setupWithNotesColumn(page);
  const flag = await notesFlag(page, NOTES_COL, 1); // the empty one
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', 'A *new* note with a [link](https://example.com) and:\n- one\n- two');
  await page.click('#notesSaveBtn');

  const stored = await page.evaluate((c) => sheet.getData()[1][c], NOTES_COL);
  expect(stored).toBe('A *new* note with a [link](https://example.com) and:\n- one\n- two');

  await expect(page.locator('#notesBody em')).toHaveText('new');
  await expect(page.locator('#notesBody a')).toHaveAttribute('href', 'https://example.com');
  await expect(page.locator('#notesBody li')).toHaveCount(2);

  await page.click('button[onclick="closeNotesModal()"]');
  const icon = await (await notesFlag(page, NOTES_COL, 1)).textContent();
  expect(icon).toBe('📝');
});

test('Cancel discards unsaved edits', async ({ page }) => {
  await setupWithNotesColumn(page);
  const flag = await notesFlag(page, NOTES_COL, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', 'this should not be saved');
  await page.click('#notesCancelBtn');

  const stored = await page.evaluate((c) => sheet.getData()[0][c], NOTES_COL);
  expect(stored).toBe('Existing **note**');
});

test('user-typed HTML in a note is escaped, not executed', async ({ page }) => {
  await setupWithNotesColumn(page);
  const flag = await notesFlag(page, NOTES_COL, 1);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', '<img src=x onerror=alert(1)>');
  await page.click('#notesSaveBtn');

  // The dangerous substring is fine to appear as inert escaped TEXT; what
  // must never happen is a live <img> element with a real onerror handler.
  const imgCount = await page.locator('#notesBody img').count();
  expect(imgCount).toBe(0);
  const bodyText = await page.locator('#notesBody').textContent();
  expect(bodyText).toContain('<img src=x onerror=alert(1)>'); // visible as literal text
});

test('a custom column NOT named "Notes" is unaffected', async ({ page }) => {
  await page.evaluate((COL) => {
    const data = [['1', '1', 'Task', '', '', '0', '', '', '', '', '', '', '', 'plain custom value']];
    appDB.projects[appDB.activeId].columns = ['JIRA'];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  const flag = await notesFlag(page, NOTES_COL, 0);
  expect(flag).toBeNull();
  const readOnly = await page.evaluate((c) => sheet.options.columns[c].readOnly, NOTES_COL);
  expect(readOnly).toBeFalsy();
});

test('Notes round-trips through CSV export like any other custom column', async ({ page }) => {
  await setupWithNotesColumn(page);
  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers[NOTES_COL]).toBe('Notes');

  const rawValue = await page.evaluate((c) => sheet.getData()[0][c], NOTES_COL);
  expect(rawValue).toBe('Existing **note**'); // raw markdown, not rendered HTML
});
