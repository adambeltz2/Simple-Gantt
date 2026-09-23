// @ts-check
const { test, expect } = require('./fixtures');

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
    appDB.projects[newId] = { name: 'Project B', columns: [], data: [['1', '1', '', '', '', '0', '', '', '', '', '', '', '']], collapsed: [], flagged: [], resources: [] };
    appDB.activeId = newId;
    renderGrid();
    syncToGantt(true);
  });
  await page.waitForTimeout(200);

  await page.click('#btnProjectNotes');
  await expect(page.locator('#projectNotesModalTitle')).toHaveText('Project Notes — Project B');
  await expect(page.locator('#projectNotesBody')).toContainText('No project notes yet');
});

test('clicking outside the modal while editing never closes it -- only the explicit Close button can', async ({ page }) => {
  // User-reported regression: clicking outside the modal while editing
  // could close it without warning. Rather than relying on a confirm()
  // dialog to catch every possible way of clicking outside (backdrop click,
  // a drag that lands outside, etc.), the backdrop's click-to-close
  // listener is removed entirely -- the modal now only ever closes via a
  // deliberate click on the red "Close" button, which still guards unsaved
  // edits with the same confirm() dirty-check as before.
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', 'unsaved draft');

  let dialogFired = false;
  page.on('dialog', (dialog) => { dialogFired = true; dialog.dismiss(); });
  await page.click('#projectNotesModal', { position: { x: 5, y: 5 } });
  await page.waitForTimeout(100);

  expect(dialogFired).toBe(false);
  await expect(page.locator('#projectNotesModal')).toHaveClass(/active/);
  await expect(page.locator('#projectNotesEditTextarea')).toHaveValue('unsaved draft');
});

test('clicking outside the modal with no unsaved changes also never closes it', async ({ page }) => {
  await page.click('#btnProjectNotes');

  let dialogFired = false;
  page.once('dialog', (dialog) => { dialogFired = true; dialog.dismiss(); });
  await page.click('#projectNotesModal', { position: { x: 5, y: 5 } });
  await page.waitForTimeout(100);

  expect(dialogFired).toBe(false);
  await expect(page.locator('#projectNotesModal')).toHaveClass(/active/);
});

test('the explicit Close button still prompts before discarding unsaved changes', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', 'unsaved draft');

  let dialogMessage = '';
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });
  await page.click('#projectNotesModal .modal-content button:has-text("Close")');
  expect(dialogMessage).toContain('unsaved changes');
  await expect(page.locator('#projectNotesModal')).toHaveClass(/active/);
  await expect(page.locator('#projectNotesEditTextarea')).toHaveValue('unsaved draft');

  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#projectNotesModal .modal-content button:has-text("Close")');
  await expect(page.locator('#projectNotesModal')).not.toHaveClass(/active/);

  const stored = await page.evaluate(() => appDB.projects[appDB.activeId].projectNotes);
  expect(stored).not.toBe('unsaved draft');
});

test('project notes have no footprint in CSV export headers', async ({ page }) => {
  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers).toEqual([
    'Task ID', 'Outline', 'Task Name', 'Resource', 'Def. Alloc',
    '% Done', 'Start', 'Dur.', 'End', 'Depends', 'Parent', 'Labels', 'Notes', 'Status',
  ]);
});

test('the modal window itself is resizable, with sensible bounds', async ({ page }) => {
  // User-requested: "Can we resize the project notes so that the window can
  // be resizable?" The one previously-resizable element was the edit
  // textarea itself (resize:vertical), which only let you grow it taller,
  // not wider, and only while actively editing. The outer modal-content box
  // is now the single resizable surface (both axes), so the whole window
  // can be made bigger whether viewing or editing -- the edit textarea's own
  // resize handle was removed (resize:none) to avoid two overlapping resize
  // grips in the same corner.
  await page.click('#btnProjectNotes');
  const modalContent = page.locator('#projectNotesModal .modal-content');

  const style = await modalContent.evaluate((el) => {
    const computed = getComputedStyle(el);
    return { resize: computed.resize, overflow: computed.overflowY, minWidth: computed.minWidth, minHeight: computed.minHeight };
  });
  expect(style.resize).toBe('both');
  expect(style.overflow).not.toBe('visible'); // resize has no effect without this
  expect(parseInt(style.minWidth, 10)).toBeGreaterThan(0);
  expect(parseInt(style.minHeight, 10)).toBeGreaterThan(0);

  const before = await modalContent.boundingBox();
  await modalContent.evaluate((el) => { el.style.width = '900px'; el.style.height = '700px'; });
  const after = await modalContent.boundingBox();
  expect(after.width).toBeGreaterThan(before.width);
  expect(after.height).toBeGreaterThan(before.height);
});

test('the edit textarea no longer has its own resize handle (the outer window is the single resize affordance)', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  const resize = await page.locator('#projectNotesEditTextarea').evaluate((el) => getComputedStyle(el).resize);
  expect(resize).toBe('none');
});
