// @ts-check
const { test, expect } = require('./fixtures');

// Covers the Dropbox-adapter refactor (backlog #29/#30's step 1): every
// cloud-sync function (backupToDropbox, restoreBackup, discoverDropboxProjects,
// importDiscoveredProject, pruneOldBackups, deleteDropboxProjectFolder,
// readMetaJson) now calls through `dropboxAdapter` -- {uploadFile, listFolder,
// downloadFile, deleteFile, deleteFolder, isConnected, login, logout,
// ensureFreshToken} -- instead of touching the raw `dbx` Dropbox SDK client
// directly. This is a pure extraction: dropboxAdapter's own methods still
// read the live `dbx` global at call time, so every pre-existing test that
// mocks `dbx` directly (tests/dropbox-pagination.spec.js, dropbox-reconnect,
// dropbox-backup-notes) keeps exercising the exact same code path unchanged.
//
// Two things are specifically worth proving here that those existing tests
// don't already cover:
// 1. dropboxAdapter's own methods translate correctly onto the real Dropbox
//    SDK shape (upload mode/autorename, delete, download-to-text).
// 2. The decoupling is real, not cosmetic -- swapping out dropboxAdapter's
//    methods for synthetic fakes with zero relationship to `dbx`/the Dropbox
//    SDK shape still lets backup/restore/discover/import/prune succeed,
//    while `dbx`'s own methods (set to throw) are never touched. If any
//    business-logic function still reached into `dbx` directly, this would
//    fail loudly instead of silently passing.

test.describe('dropboxAdapter methods translate correctly onto the dbx SDK', () => {
  test('uploadFile with overwrite:false uses add mode with autorename (matches CSV backup)', async ({ page }) => {
    const call = await page.evaluate(() => {
      let captured = null;
      dbx = { filesUpload: (opts) => { captured = opts; return Promise.resolve(); } };
      return dropboxAdapter.uploadFile('/a/b.csv', 'contents', { overwrite: false }).then(() => captured);
    });
    expect(call).toEqual({ path: '/a/b.csv', contents: 'contents', mode: { '.tag': 'add' }, autorename: true });
  });

  test('uploadFile with overwrite:true uses overwrite mode, no autorename (matches meta.json)', async ({ page }) => {
    const call = await page.evaluate(() => {
      let captured = null;
      dbx = { filesUpload: (opts) => { captured = opts; return Promise.resolve(); } };
      return dropboxAdapter.uploadFile('/a/meta.json', '{}', { overwrite: true }).then(() => captured);
    });
    expect(call).toEqual({ path: '/a/meta.json', contents: '{}', mode: { '.tag': 'overwrite' }, autorename: false });
  });

  test('listFolder walks pagination the same way listAllDropboxEntries does', async ({ page }) => {
    const entries = await page.evaluate(() => {
      dbx = {
        filesListFolder: () => Promise.resolve({ result: { entries: ['a'], has_more: true, cursor: 'c1' } }),
        filesListFolderContinue: () => Promise.resolve({ result: { entries: ['b'], has_more: false } }),
      };
      return dropboxAdapter.listFolder('/x');
    });
    expect(entries).toEqual(['a', 'b']);
  });

  test('downloadFile resolves the file contents as text', async ({ page }) => {
    const text = await page.evaluate(() => {
      dbx = { filesDownload: ({ path }) => Promise.resolve({ result: { fileBlob: new Blob([`contents of ${path}`]) } }) };
      return dropboxAdapter.downloadFile('/a/b.csv');
    });
    expect(text).toBe('contents of /a/b.csv');
  });

  test('downloadFile propagates a dbx.filesDownload rejection (e.g. a 401)', async ({ page }) => {
    const rejected = await page.evaluate(() => {
      dbx = { filesDownload: () => Promise.reject({ status: 401 }) };
      return dropboxAdapter.downloadFile('/a/b.csv').then(() => ({ rejected: false }), (err) => ({ rejected: true, status: err.status }));
    });
    expect(rejected).toEqual({ rejected: true, status: 401 });
  });

  test('deleteFile and deleteFolder both call dbx.filesDeleteV2 with the given path', async ({ page }) => {
    const result = await page.evaluate(() => {
      const calls = [];
      dbx = { filesDeleteV2: (opts) => { calls.push(opts.path); return Promise.resolve(); } };
      return Promise.all([
        dropboxAdapter.deleteFile('/a/one.csv'),
        dropboxAdapter.deleteFolder('/a/proj-id'),
      ]).then(() => calls);
    });
    expect(result).toEqual(['/a/one.csv', '/a/proj-id']);
  });

  test('isConnected reflects the live dbx global, not a captured snapshot', async ({ page }) => {
    const states = await page.evaluate(() => {
      dbx = null;
      const beforeLogin = dropboxAdapter.isConnected();
      dbx = { marker: 'connected' };
      const afterLogin = dropboxAdapter.isConnected();
      return { beforeLogin, afterLogin };
    });
    expect(states).toEqual({ beforeLogin: false, afterLogin: true });
  });

  test('ensureFreshToken resolves the current connection state (Dropbox has no silent refresh)', async ({ page }) => {
    const results = await page.evaluate(() => {
      dbx = null;
      return dropboxAdapter.ensureFreshToken().then((disconnected) => {
        dbx = { marker: 'connected' };
        return dropboxAdapter.ensureFreshToken().then((connected) => ({ disconnected, connected }));
      });
    });
    expect(results).toEqual({ disconnected: false, connected: true });
  });

  test('login and logout delegate to the existing dropboxLogin/disconnectDropbox entry points', async ({ page }) => {
    const calls = await page.evaluate(() => {
      const log = [];
      const originalLogin = window.dropboxLogin;
      const originalLogout = window.disconnectDropbox;
      window.dropboxLogin = () => log.push('login');
      window.disconnectDropbox = () => log.push('logout');
      dropboxAdapter.login();
      dropboxAdapter.logout();
      window.dropboxLogin = originalLogin;
      window.disconnectDropbox = originalLogout;
      return log;
    });
    expect(calls).toEqual(['login', 'logout']);
  });
});

test.describe('business logic is genuinely decoupled from dbx -- proven by faking the adapter, not dbx', () => {
  test('backupToDropbox succeeds through a faked adapter while dbx itself is never touched', async ({ page }) => {
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        // dbx exists (so the "not logged in" early-return doesn't fire) but
        // every one of its own methods throws -- if backupToDropbox still
        // reached into dbx directly anywhere, this test would fail loudly
        // instead of silently passing.
        dbx = {
          filesUpload: () => { throw new Error('dbx.filesUpload should never be called -- adapter should be used instead'); },
          filesListFolder: () => { throw new Error('dbx.filesListFolder should never be called -- adapter should be used instead'); },
        };
        const uploaded = [];
        dropboxAdapter.uploadFile = (path, contents) => { uploaded.push(path); return Promise.resolve(); };
        dropboxAdapter.listFolder = () => Promise.resolve([]);
        backupToDropbox(false);
        setTimeout(() => resolve({ uploaded, cloudStatus: document.getElementById('cloudStatus').className }), 200);
      });
    });
    expect(result.uploaded.length).toBe(2); // CSV + meta.json
    expect(result.cloudStatus).toBe('synced');
  });

  test('restoreBackup applies data from a faked adapter while dbx.filesDownload is never touched', async ({ page }) => {
    page.once('dialog', (d) => d.accept());
    const csv = 'ID,Outline,Task Name,Resource,Allocation,% Done,Start,Duration,End,Depends,Parent,Labels,Notes,Status\n1,1,From Fake Adapter,,100,0,2026-01-05,1,2026-01-05,,,,,';

    await page.evaluate((csvText) => {
      dbx = { filesDownload: () => { throw new Error('dbx.filesDownload should never be called -- adapter should be used instead'); } };
      dropboxAdapter.downloadFile = (path) => Promise.resolve(path.endsWith('meta.json') ? JSON.stringify({ name: 'X', updatedAt: 'now' }) : csvText);
      restoreBackup('/Simple Gantt Backups/id/2026-01-05_120000.csv');
    }, csv);
    await page.waitForTimeout(300);

    const taskName = await page.evaluate(() => sheet.getData()[0][2]);
    expect(taskName).toBe('From Fake Adapter');
  });

  test('discoverDropboxProjects surfaces candidates from a faked adapter while dbx.filesListFolder is never touched', async ({ page }) => {
    const discovered = await page.evaluate(() => {
      dbx = { filesListFolder: () => { throw new Error('dbx.filesListFolder should never be called -- adapter should be used instead'); } };
      dropboxAdapter.listFolder = (path) => {
        if (path === '/Simple Gantt Backups') {
          return Promise.resolve([{ '.tag': 'folder', name: 'fake-remote-id', path_lower: '/simple gantt backups/fake-remote-id' }]);
        }
        return Promise.resolve([]);
      };
      dropboxAdapter.downloadFile = () => Promise.reject(new Error('no meta.json in this fake'));
      return new Promise((resolve) => {
        const originalOpen = window.openDiscoveryModal;
        window.openDiscoveryModal = function(found) { resolve(found); originalOpen(found); };
        discoverDropboxProjects(true);
      });
    });
    expect(discovered.map((d) => d.id)).toEqual(['fake-remote-id']);
  });

  test('importDiscoveredProject creates the project from a faked adapter while dbx is never touched', async ({ page }) => {
    const csv = 'ID,Outline,Task Name,Resource,Allocation,% Done,Start,Duration,End,Depends,Parent,Labels,Notes,Status\n1,1,Imported via fake,,100,0,2026-01-05,1,2026-01-05,,,,,';
    const projectName = await page.evaluate((csvText) => {
      dbx = { filesListFolder: () => { throw new Error('should not be called'); }, filesDownload: () => { throw new Error('should not be called'); } };
      dropboxAdapter.listFolder = () => Promise.resolve([{ '.tag': 'file', name: 'backup.csv', path_lower: '/x/backup.csv', client_modified: '2026-01-05T00:00:00Z' }]);
      dropboxAdapter.downloadFile = () => Promise.resolve(csvText);
      return importDiscoveredProject({ id: 'fake-id', pathLower: '/x', name: 'Faked Adapter Project' })
        .then(() => Object.values(appDB.projects).find((p) => p.name === 'Faked Adapter Project').name);
    }, csv);
    expect(projectName).toBe('Faked Adapter Project');
  });

  test('pruneOldBackups deletes via the faked adapter while dbx.filesDeleteV2 is never touched', async ({ page }) => {
    const deleted = await page.evaluate(() => {
      dbx = { filesDeleteV2: () => { throw new Error('should not be called'); } };
      const makeEntry = (i) => ({ '.tag': 'file', name: `${i}.csv`, path_lower: `/f/${i}.csv`, client_modified: new Date(2026, 0, i).toISOString() });
      const entries = Array.from({ length: 30 }, (_, i) => makeEntry(i + 1));
      dropboxAdapter.listFolder = () => Promise.resolve(entries);
      const deletedPaths = [];
      dropboxAdapter.deleteFile = (path) => { deletedPaths.push(path); return Promise.resolve(); };
      return new Promise((resolve) => {
        pruneOldBackups('/f');
        setTimeout(() => resolve(deletedPaths), 100);
      });
    });
    // MAX_BACKUPS_PER_PROJECT is 25; 30 entries means the 5 oldest get pruned.
    expect(deleted.length).toBe(5);
  });

  test('deleteDropboxProjectFolder deletes via the faked adapter while dbx.filesDeleteV2 is never touched', async ({ page }) => {
    const deletedPath = await page.evaluate(() => {
      dbx = { filesDeleteV2: () => { throw new Error('should not be called'); } };
      let captured = null;
      dropboxAdapter.deleteFolder = (path) => { captured = path; return Promise.resolve(); };
      return new Promise((resolve) => {
        deleteDropboxProjectFolder('fake-project-id', 'Fake Project');
        setTimeout(() => resolve(captured), 100);
      });
    });
    expect(deletedPath).toBe('/Simple Gantt Backups/fake-project-id');
  });
});
