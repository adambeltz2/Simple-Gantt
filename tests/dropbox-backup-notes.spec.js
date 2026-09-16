// @ts-check
const { test, expect } = require('./fixtures');

// User-reported gap: Dropbox backup only ever uploaded the task-grid CSV
// plus a meta.json carrying {name, updatedAt} -- the project-level Notes
// field (projectNotes, distinct from a task's own Notes column) was never
// part of that payload, so it silently never round-tripped through backup,
// restore, or cross-device discovery/import, contrary to the app's own
// "back up so you don't lose anything" promise.
//
// None of this needs a real Dropbox account or network access -- `dbx` is a
// plain top-level variable in the page's own script, so these tests inject
// a fake client directly, the same pattern tests/dropbox-pagination.spec.js
// already established.

const SAMPLE_CSV = 'ID,Outline,Task Name,Resource,Allocation,% Done,Start,Duration,End,Depends,Parent,Labels,Notes\n1,1,Restored Task,,100,0,2026-01-05,1,2026-01-05,,,,';

test('backing up to Dropbox includes projectNotes in meta.json', async ({ page }) => {
  const metaContents = await page.evaluate(() => {
    return new Promise((resolve) => {
      appDB.projects[appDB.activeId].projectNotes = 'Scope notes for backup';
      dbx = {
        filesUpload: (opts) => {
          if (opts.path.endsWith('meta.json')) resolve(opts.contents);
          return Promise.resolve();
        },
        filesListFolder: () => Promise.resolve({ result: { entries: [], has_more: false } }),
      };
      backupToDropbox(false);
    });
  });

  expect(JSON.parse(metaContents).projectNotes).toBe('Scope notes for backup');
});

test('editing project notes schedules an auto-backup, and the backup it eventually runs carries the new note', async ({ page }) => {
  // setProjectNotes() (what saveProjectNotesEdit() calls) routes through the
  // same saveToLocal() -> scheduleAutoBackup() path as any grid edit -- a
  // project-notes change is not a special case that needs its own wiring.
  // This fast-forwards past the real 60s debounce (AUTO_BACKUP_DELAY_MS)
  // rather than waiting for it, since scheduleAutoBackup() itself is a
  // trivial setTimeout wrapper already covered by the assertion below.
  const result = await page.evaluate(() => {
    dbx = { filesListFolder: () => Promise.resolve({ result: { entries: [], has_more: false } }) };

    setProjectNotes('Freshly edited project notes');
    const scheduledAfterEdit = dbxAutoBackupTimer !== null;

    return new Promise((resolve) => {
      dbx.filesUpload = (opts) => {
        if (opts.path.endsWith('meta.json')) resolve({ scheduledAfterEdit, metaContents: opts.contents });
        return Promise.resolve();
      };
      backupToDropbox(true);
    });
  });

  expect(result.scheduledAfterEdit).toBe(true);
  expect(JSON.parse(result.metaContents).projectNotes).toBe('Freshly edited project notes');
});

test('restoring a backup applies the project notes captured in its meta.json', async ({ page }) => {
  await page.evaluate(() => { appDB.projects[appDB.activeId].projectNotes = 'Old notes before restore'; saveToLocal(); });
  page.once('dialog', (d) => d.accept());

  await page.evaluate((csv) => {
    dbx = {
      filesDownload: ({ path }) => {
        if (path.endsWith('meta.json')) {
          return Promise.resolve({ result: { fileBlob: new Blob([JSON.stringify({ name: 'X', updatedAt: 'now', projectNotes: 'Notes from that backup' })]) } });
        }
        return Promise.resolve({ result: { fileBlob: new Blob([csv]) } });
      },
    };
    restoreBackup('/Simple Gantt Backups/id123/2026-01-05_120000.csv');
  }, SAMPLE_CSV);
  await page.waitForTimeout(300);

  const notes = await page.evaluate(() => appDB.projects[appDB.activeId].projectNotes);
  expect(notes).toBe('Notes from that backup');
});

test('restoring a pre-v2.40.0 backup (no projectNotes in its meta.json) leaves current notes untouched', async ({ page }) => {
  await page.evaluate(() => { appDB.projects[appDB.activeId].projectNotes = 'Keep me'; saveToLocal(); });
  page.once('dialog', (d) => d.accept());

  await page.evaluate((csv) => {
    dbx = {
      filesDownload: ({ path }) => {
        if (path.endsWith('meta.json')) {
          return Promise.resolve({ result: { fileBlob: new Blob([JSON.stringify({ name: 'X', updatedAt: 'now' })]) } }); // no projectNotes field at all
        }
        return Promise.resolve({ result: { fileBlob: new Blob([csv]) } });
      },
    };
    restoreBackup('/Simple Gantt Backups/id123/2026-01-05_120000.csv');
  }, SAMPLE_CSV);
  await page.waitForTimeout(300);

  const notes = await page.evaluate(() => appDB.projects[appDB.activeId].projectNotes);
  expect(notes).toBe('Keep me');
});

test('restoring when meta.json itself fails to load leaves current notes untouched (and still restores the CSV)', async ({ page }) => {
  await page.evaluate(() => { appDB.projects[appDB.activeId].projectNotes = 'Still here'; saveToLocal(); });
  page.once('dialog', (d) => d.accept());

  await page.evaluate((csv) => {
    dbx = {
      filesDownload: ({ path }) => {
        if (path.endsWith('meta.json')) return Promise.reject(new Error('not found'));
        return Promise.resolve({ result: { fileBlob: new Blob([csv]) } });
      },
    };
    restoreBackup('/Simple Gantt Backups/id123/2026-01-05_120000.csv');
  }, SAMPLE_CSV);
  await page.waitForTimeout(300);

  const notes = await page.evaluate(() => appDB.projects[appDB.activeId].projectNotes);
  expect(notes).toBe('Still here');

  const taskName = await page.evaluate(() => sheet.getData()[0][2]);
  expect(taskName).toBe('Restored Task');
});

test('discoverDropboxProjects carries projectNotes from meta.json into the discovered candidate', async ({ page }) => {
  const discovered = await page.evaluate(() => {
    dbx = {
      filesListFolder: () => Promise.resolve({ result: { entries: [{ '.tag': 'folder', name: 'remote-id', path_lower: '/simple gantt backups/remote-id' }], has_more: false } }),
      filesDownload: () => Promise.resolve({ result: { fileBlob: new Blob([JSON.stringify({ name: 'Remote Project', projectNotes: 'Notes from another device' })]) } }),
    };
    return new Promise((resolve) => {
      const originalOpen = window.openDiscoveryModal;
      window.openDiscoveryModal = function(found) { resolve(found); originalOpen(found); };
      discoverDropboxProjects(true);
    });
  });

  expect(discovered[0].projectNotes).toBe('Notes from another device');
});

test('importing a discovered cross-device project applies its projectNotes to the new local project', async ({ page }) => {
  const newProjectNotes = await page.evaluate((csv) => {
    dbx = {
      filesListFolder: () => Promise.resolve({ result: { entries: [{ '.tag': 'file', name: 'backup.csv', path_lower: '/x/backup.csv', client_modified: '2026-01-05T00:00:00Z' }], has_more: false } }),
      filesDownload: () => Promise.resolve({ result: { fileBlob: new Blob([csv]) } }),
    };
    return importDiscoveredProject({ id: 'remote-id', pathLower: '/x', name: 'Remote Project', projectNotes: 'Imported notes' })
      .then(() => Object.values(appDB.projects).find((p) => p.name === 'Remote Project').projectNotes);
  }, SAMPLE_CSV);

  expect(newProjectNotes).toBe('Imported notes');
});

test('importing a discovered project with no captured notes defaults to an empty string, not undefined', async ({ page }) => {
  const newProjectNotes = await page.evaluate((csv) => {
    dbx = {
      filesListFolder: () => Promise.resolve({ result: { entries: [{ '.tag': 'file', name: 'backup.csv', path_lower: '/x/backup.csv', client_modified: '2026-01-05T00:00:00Z' }], has_more: false } }),
      filesDownload: () => Promise.resolve({ result: { fileBlob: new Blob([csv]) } }),
    };
    return importDiscoveredProject({ id: 'remote-id-2', pathLower: '/x', name: 'Notes-less Project' })
      .then(() => Object.values(appDB.projects).find((p) => p.name === 'Notes-less Project').projectNotes);
  }, SAMPLE_CSV);

  expect(newProjectNotes).toBe('');
});
