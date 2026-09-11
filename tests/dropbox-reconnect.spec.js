// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #24: a user's Dropbox session/token can expire or be
// revoked while they're actively working. The old handleDropboxAuthError()
// treated any 401 -- including one from a silent, 60s-debounced auto-backup
// firing on its own timer with no regard for what the user was doing --
// by nuking the token, showing a blocking alert(), and unconditionally
// location.reload()-ing. Grid data was always safe either way (localStorage,
// not Dropbox, is its source of truth), but an open Notes modal's not-yet-
// saved edit could be silently discarded by that forced reload.
//
// None of this needs a real Dropbox account or network access -- `dbx` is a
// plain top-level variable in the page's own script, so these tests inject a
// fake client directly and call the real app functions against it, the same
// pattern tests/dropbox-pagination.spec.js already established.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12 };

test('a 401 disconnects Dropbox in place -- no reload, no blocking alert', async ({ page }) => {
  let dialogFired = false;
  page.on('dialog', (dialog) => { dialogFired = true; dialog.dismiss(); });

  const result = await page.evaluate(() => {
    // Simulate an already-connected session.
    dbx = {};
    localStorage.setItem('dropbox_token', 'fake-token-for-test');
    document.getElementById('btnDbxLogout').style.display = '';
    window.__reconnectTestMarker = 'still here';

    const handled = handleDropboxAuthError({ status: 401 });

    return {
      handled,
      dbxIsNull: dbx === null,
      tokenRemoved: localStorage.getItem('dropbox_token') === null,
      saveBtnText: document.getElementById('btnDbxSave').innerHTML,
      loadBtnHidden: document.getElementById('btnDbxLoad').style.display === 'none',
      logoutBtnHidden: document.getElementById('btnDbxLogout').style.display === 'none',
      cloudStatusText: document.getElementById('cloudStatus').textContent,
      cloudStatusClass: document.getElementById('cloudStatus').className,
      markerSurvived: window.__reconnectTestMarker === 'still here',
    };
  });

  expect(result.handled).toBe(true);
  expect(result.dbxIsNull).toBe(true);
  expect(result.tokenRemoved).toBe(true);
  expect(result.saveBtnText).toContain('Login to Dropbox');
  expect(result.loadBtnHidden).toBe(true);
  expect(result.logoutBtnHidden).toBe(true);
  expect(result.cloudStatusText).toContain('Dropbox session expired');
  expect(result.cloudStatusClass).toBe('dirty');
  expect(result.markerSurvived).toBe(true);
  expect(dialogFired).toBe(false);
});

test('the pending auto-backup timer is cancelled on disconnect', async ({ page }) => {
  const timerCleared = await page.evaluate(() => {
    dbx = {};
    scheduleAutoBackup();
    const hadTimer = dbxAutoBackupTimer !== null;
    handleDropboxAuthError({ status: 401 });
    return hadTimer && dbxAutoBackupTimer === null;
  });
  expect(timerCleared).toBe(true);
});

test('a non-401 error is left untouched -- dbx stays connected', async ({ page }) => {
  const result = await page.evaluate(() => {
    dbx = { marker: 'still-connected' };
    localStorage.setItem('dropbox_token', 'fake-token-for-test');
    const handled = handleDropboxAuthError({ status: 500 });
    return { handled, dbxIntact: dbx && dbx.marker === 'still-connected', tokenIntact: localStorage.getItem('dropbox_token') === 'fake-token-for-test' };
  });
  expect(result.handled).toBe(false);
  expect(result.dbxIntact).toBe(true);
  expect(result.tokenIntact).toBe(true);
});

test('an auto-backup hitting a 401 disconnects silently -- no alert, grid data untouched', async ({ page }) => {
  let dialogFired = false;
  page.on('dialog', (dialog) => { dialogFired = true; dialog.dismiss(); });

  const result = await page.evaluate(() => {
    return new Promise((resolve) => {
      dbx = {
        filesUpload: () => Promise.reject({ status: 401 }),
      };
      localStorage.setItem('dropbox_token', 'fake-token-for-test');
      backupToDropbox(true);
      // backupToDropbox's Promise.all(...).catch() runs on a microtask;
      // give it a tick to settle before reading state back out.
      setTimeout(() => resolve({
        dbxIsNull: dbx === null,
        gridDataIntact: sheet.getData()[0][0] !== undefined,
      }), 50);
    });
  });

  expect(result.dbxIsNull).toBe(true);
  expect(result.gridDataIntact).toBe(true);
  expect(dialogFired).toBe(false);
});

test('flushPendingNotesEdits saves a dirty in-progress task Notes edit', async ({ page }) => {
  const flagHandle = await page.evaluateHandle(([c, y]) => sheet.records[y][c].querySelector('.notes-flag'), [COL.NOTES, 0]);
  const flag = flagHandle.asElement();
  await flag.click();
  await expect(page.locator('#notesModal')).toHaveClass(/active/);

  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', 'saved via pre-reconnect flush');

  const storedBeforeFlush = await page.evaluate((c) => sheet.getData()[0][c], COL.NOTES);
  expect(storedBeforeFlush).not.toBe('saved via pre-reconnect flush');

  await page.evaluate(() => flushPendingNotesEdits());

  const storedAfterFlush = await page.evaluate((c) => sheet.getData()[0][c], COL.NOTES);
  expect(storedAfterFlush).toBe('saved via pre-reconnect flush');
});

test('flushPendingNotesEdits saves a dirty in-progress project Notes edit', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', 'project note saved via pre-reconnect flush');

  const storedBeforeFlush = await page.evaluate(() => appDB.projects[appDB.activeId].projectNotes || '');
  expect(storedBeforeFlush).not.toBe('project note saved via pre-reconnect flush');

  await page.evaluate(() => flushPendingNotesEdits());

  const storedAfterFlush = await page.evaluate(() => appDB.projects[appDB.activeId].projectNotes);
  expect(storedAfterFlush).toBe('project note saved via pre-reconnect flush');
});

test('flushPendingNotesEdits is a harmless no-op when no notes modal is open', async ({ page }) => {
  await expect(page.evaluate(() => { flushPendingNotesEdits(); return 'ok'; })).resolves.toBe('ok');
});
