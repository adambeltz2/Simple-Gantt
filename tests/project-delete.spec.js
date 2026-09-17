// @ts-check
const { test, expect } = require('./fixtures');

// Covers the project-deletion flow after the "Reset" button was removed for
// being too dangerous (it wiped every project in one shot with no per-project
// Dropbox cleanup). Delete is now the only way to clear data, including your
// last remaining project -- gated behind the same type-to-confirm friction
// Reset used to have, and it leaves the app on a fresh blank project
// afterward rather than an empty project list. Separately, the Dropbox
// follow-up question ("delete those backups too?") moved from a native
// confirm() -- whose buttons just say ambiguous "OK"/"Cancel" -- to a custom
// modal with explicit "Yes, delete from Dropbox" / "No, keep backups" labels.

test('the Reset button no longer exists', async ({ page }) => {
  await expect(page.locator('button:has-text("Reset")')).toHaveCount(0);
  await expect(page.locator('#deleteLastProjectModal')).toHaveCount(1);
});

test('deleting one of several projects still uses a plain confirm, and removes it', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Second Project'));
  await page.evaluate(() => createNewProject());
  await page.waitForTimeout(200);

  page.once('dialog', (d) => {
    expect(d.message()).toContain('Second Project');
    d.accept();
  });
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);

  const names = await page.evaluate(() => Object.values(appDB.projects).map((p) => p.name));
  expect(names).toEqual(['Example Project']);
  await expect(page.locator('#deleteLastProjectModal.active')).toHaveCount(0);
});

test('canceling that confirm leaves the project untouched', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Second Project'));
  await page.evaluate(() => createNewProject());
  await page.waitForTimeout(200);

  page.once('dialog', (d) => d.dismiss());
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);

  const names = await page.evaluate(() => Object.values(appDB.projects).map((p) => p.name));
  expect(names.sort()).toEqual(['Example Project', 'Second Project'].sort());
});

test('deleting your only remaining project opens a type-to-confirm modal instead of deleting immediately', async ({ page }) => {
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);

  await expect(page.locator('#deleteLastProjectModal')).toHaveClass(/active/);
  await expect(page.locator('#deleteLastProjectName')).toHaveText('Example Project');
  const names = await page.evaluate(() => Object.values(appDB.projects).map((p) => p.name));
  expect(names).toEqual(['Example Project']); // untouched -- nothing deleted yet
});

test('the Delete Project button in that modal stays disabled until "DELETE" is typed', async ({ page }) => {
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);

  await expect(page.locator('#deleteLastProjectConfirmBtn')).toBeDisabled();
  await page.fill('#deleteLastProjectInput', 'delete'); // wrong case
  await expect(page.locator('#deleteLastProjectConfirmBtn')).toBeDisabled();
  await page.fill('#deleteLastProjectInput', 'DELETE');
  await expect(page.locator('#deleteLastProjectConfirmBtn')).toBeEnabled();
});

test('Cancel on the last-project modal leaves the project untouched', async ({ page }) => {
  await page.evaluate(() => deleteProject());
  await page.click('#deleteLastProjectModal button:has-text("Cancel")');
  await page.waitForTimeout(200);

  await expect(page.locator('#deleteLastProjectModal.active')).toHaveCount(0);
  const names = await page.evaluate(() => Object.values(appDB.projects).map((p) => p.name));
  expect(names).toEqual(['Example Project']);
});

test('confirming deletes the last project and replaces it with a fresh blank project', async ({ page }) => {
  await page.evaluate(() => deleteProject());
  await page.fill('#deleteLastProjectInput', 'DELETE');
  await page.click('#deleteLastProjectConfirmBtn');
  await page.waitForTimeout(300);

  const projects = await page.evaluate(() => appDB.projects);
  const ids = Object.keys(projects);
  expect(ids.length).toBe(1);
  expect(projects[ids[0]].name).toBe('New Project');
  expect(projects[ids[0]].data.length).toBe(1);
  expect(projects[ids[0]].columns).toEqual([]);

  // The app is left in a working state on the new project, not stuck.
  const rowCount = await page.evaluate(() => sheet.getData().length);
  expect(rowCount).toBe(1);
});

test('a project with Dropbox backups shows the explicit Yes/No modal instead of a native confirm', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Second Project'));
  await page.evaluate(() => createNewProject());
  await page.evaluate(() => { appDB.projects[appDB.activeId].dropboxProjectId = 'remote-id-123'; dbx = {}; });
  await page.waitForTimeout(200);

  let dialogFired = false;
  page.once('dialog', (d) => { dialogFired = true; d.accept(); });
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);

  expect(dialogFired).toBe(true); // the plain "are you sure you want to delete" confirm
  await expect(page.locator('#dropboxDeleteModal')).toHaveClass(/active/);
  await expect(page.locator('#dropboxDeleteProjectName')).toHaveText('Second Project');
  await expect(page.locator('#dropboxDeleteModal button:has-text("Yes, delete from Dropbox")')).toHaveCount(1);
  await expect(page.locator('#dropboxDeleteModal button:has-text("No, keep backups")')).toHaveCount(1);
});

test('clicking "No, keep backups" closes the modal without touching Dropbox', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Second Project'));
  await page.evaluate(() => createNewProject());
  await page.evaluate(() => { appDB.projects[appDB.activeId].dropboxProjectId = 'remote-id-123'; dbx = {}; });
  await page.waitForTimeout(200);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);

  await page.click('#dropboxDeleteModal button:has-text("No, keep backups")');
  await page.waitForTimeout(200);
  await expect(page.locator('#dropboxDeleteModal.active')).toHaveCount(0);
});

test('clicking "Yes, delete from Dropbox" calls filesDeleteV2 on the project\'s own folder', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Second Project'));
  await page.evaluate(() => createNewProject());
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].dropboxProjectId = 'remote-id-123';
    window.__deletedPath = null;
    dbx = { filesDeleteV2: ({ path }) => { window.__deletedPath = path; return Promise.resolve(); } };
  });
  await page.waitForTimeout(200);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);

  await page.click('#dropboxDeleteModal button:has-text("Yes, delete from Dropbox")');
  await page.waitForTimeout(200);

  const deletedPath = await page.evaluate(() => window.__deletedPath);
  expect(deletedPath).toBe('/Simple Gantt Backups/remote-id-123');
  await expect(page.locator('#dropboxDeleteModal.active')).toHaveCount(0);
});

test('a project with Dropbox backups but not logged in falls back to an informational alert, no decision modal', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Second Project'));
  await page.evaluate(() => createNewProject());
  await page.evaluate(() => { appDB.projects[appDB.activeId].dropboxProjectId = 'remote-id-123'; dbx = null; });
  await page.waitForTimeout(200);

  const dialogMessages = [];
  page.on('dialog', (d) => { dialogMessages.push(d.message()); d.accept(); });
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);

  expect(dialogMessages.length).toBe(2); // the delete confirm, then the informational alert
  expect(dialogMessages[1]).toContain("weren't deleted");
  await expect(page.locator('#dropboxDeleteModal.active')).toHaveCount(0);
});

test('a project with no Dropbox backups shows no Dropbox modal at all', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Second Project'));
  await page.evaluate(() => createNewProject());
  await page.waitForTimeout(200);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);

  await expect(page.locator('#dropboxDeleteModal.active')).toHaveCount(0);
});

test('the last-project modal warns about Dropbox backups only when the project actually has any', async ({ page }) => {
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);
  await expect(page.locator('#deleteLastProjectDropboxNote')).toBeHidden();
  await page.click('#deleteLastProjectModal button:has-text("Cancel")');

  await page.evaluate(() => { appDB.projects[appDB.activeId].dropboxProjectId = 'remote-id-123'; });
  await page.evaluate(() => deleteProject());
  await page.waitForTimeout(200);
  await expect(page.locator('#deleteLastProjectDropboxNote')).toBeVisible();
});
