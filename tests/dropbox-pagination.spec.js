// @ts-check
const { test, expect } = require('@playwright/test');

// Covers a real gap found while investigating the reopened Dropbox
// cross-device discovery bug: every dbx.filesListFolder() call site only
// ever looked at the first page of results, silently dropping anything past
// Dropbox's own per-page limit (has_more/cursor). listAllDropboxEntries()
// now walks every page via filesListFolderContinue() before resolving.
//
// None of this needs a real Dropbox account or network access -- `dbx` is a
// plain top-level variable in the page's own script, so these tests inject a
// fake paginated client directly and call the real app functions against it.

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
});

test('listAllDropboxEntries walks every page via filesListFolderContinue', async ({ page }) => {
  const result = await page.evaluate(() => {
    const pages = [
      { entries: ['a', 'b'], has_more: true, cursor: 'c1' },
      { entries: ['c', 'd'], has_more: true, cursor: 'c2' },
      { entries: ['e'], has_more: false },
    ];
    const callLog = [];
    dbx = {
      filesListFolder: ({ path }) => { callLog.push('list:' + path); return Promise.resolve({ result: pages[0] }); },
      filesListFolderContinue: ({ cursor }) => {
        callLog.push('continue:' + cursor);
        return Promise.resolve({ result: pages[cursor === 'c1' ? 1 : 2] });
      },
    };
    return listAllDropboxEntries('/test').then((entries) => ({ entries, callLog }));
  });

  expect(result.entries).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(result.callLog).toEqual(['list:/test', 'continue:c1', 'continue:c2']);
});

test('listAllDropboxEntries resolves with just the first page when has_more is false', async ({ page }) => {
  const entries = await page.evaluate(() => {
    dbx = { filesListFolder: () => Promise.resolve({ result: { entries: ['x', 'y'], has_more: false } }) };
    return listAllDropboxEntries('/single');
  });
  expect(entries).toEqual(['x', 'y']);
});

test('a rejected continuation call rejects the overall promise (errors still propagate)', async ({ page }) => {
  const rejected = await page.evaluate(() => {
    dbx = {
      filesListFolder: () => Promise.resolve({ result: { entries: ['a'], has_more: true, cursor: 'c1' } }),
      filesListFolderContinue: () => Promise.reject({ status: 401 }),
    };
    return listAllDropboxEntries('/err').then(
      () => ({ rejected: false }),
      (err) => ({ rejected: true, status: err.status })
    );
  });
  expect(rejected).toEqual({ rejected: true, status: 401 });
});

test('discoverDropboxProjects finds a candidate project sitting on the second page of results', async ({ page }) => {
  // Reproduces the exact real-world shape of the reopened bug: a Dropbox
  // account with enough project folders that the real one the user is
  // missing sits past the first page.
  const discovered = await page.evaluate(() => {
    const pages = [
      { entries: [{ '.tag': 'folder', name: 'already-local-id', path_lower: '/simple gantt backups/already-local-id' }], has_more: true, cursor: 'c1' },
      { entries: [{ '.tag': 'folder', name: 'missing-project-id', path_lower: '/simple gantt backups/missing-project-id' }], has_more: false },
    ];
    dbx = {
      filesListFolder: () => Promise.resolve({ result: pages[0] }),
      filesListFolderContinue: () => Promise.resolve({ result: pages[1] }),
      filesDownload: () => Promise.reject(new Error('no meta.json in this fake')),
    };
    // Mark "already-local-id" as already present locally, so only the
    // second-page folder should surface as a genuine candidate.
    appDB.projects[appDB.activeId].dropboxProjectId = 'already-local-id';

    return new Promise((resolve) => {
      const originalOpen = window.openDiscoveryModal;
      window.openDiscoveryModal = function(found) { resolve(found); originalOpen(found); };
      discoverDropboxProjects(true);
    });
  });

  expect(discovered.map((d) => d.id)).toEqual(['missing-project-id']);
});

test('no uncaught JS errors exercising the paginated Dropbox listing path', async ({ page }) => {
  await page.evaluate(() => {
    dbx = {
      filesListFolder: () => Promise.resolve({ result: { entries: [], has_more: true, cursor: 'c1' } }),
      filesListFolderContinue: () => Promise.resolve({ result: { entries: [], has_more: false } }),
    };
    return listAllDropboxEntries('/empty');
  });
  await page.waitForTimeout(150);

  expect(page.consoleErrors).toEqual([]);
});
