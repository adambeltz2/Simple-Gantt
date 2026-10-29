// @ts-check
const { test, expect } = require('./fixtures');

// Covers a debt item logged after a user question about Dropbox's data
// structure: backupToDropbox()'s meta.json only ever carried {name,
// updatedAt, projectNotes} -- none of the four named registries (Resources/
// Labels/Topics/Lanes) were stored there. A restore instead reconstructed
// each registry by scanning the restored CSV's own rows for distinct
// values still in use, additively merged against whatever the *target*
// project's registry already held. Two concrete gaps that fixed: a name
// defined but not yet assigned to any task never survived a restore (true
// for all four registries); and Lane order specifically -- the one
// registry where order is the actual point -- came back in first-seen-CSV-
// row order rather than however it was arranged via the Lane Manager's
// ▲/▼ controls, whenever the restore target had no existing lanes array to
// merge against (a fresh profile, a brand-new project, or cross-device
// discovery/import).
//
// Fix: meta.json now also carries the live resources/labels/topics/lanes
// arrays. A restore applies them as an authoritative REPLACE (not a merge)
// via applyRestoredRegistries(), same as the existing projectNotes
// handling; a backup from before this fix simply lacks the fields, and
// every reader here treats each one as optional, so an old backup's
// restore still falls back to the original CSV-driven merge, unchanged.
//
// None of this needs a real Dropbox account -- `dbx` is a plain top-level
// variable in the page's own script, same injection pattern
// tests/dropbox-backup-notes.spec.js and tests/dropbox-pagination.spec.js
// already established.

const CSV_HEADER = 'Task ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent,Labels,Notes,Status,Topic,Lane';
const SAMPLE_CSV = `${CSV_HEADER}\n1,1,Restored Task,,100,0,2026-01-05,1,2026-01-05,,,,,,Backend,To Do`;

test('backing up to Dropbox includes the four named registries in meta.json, in their live order', async ({ page }) => {
  const metaContents = await page.evaluate(() => {
    return new Promise((resolve) => {
      appDB.projects[appDB.activeId].resources = ['Bob', 'Alice'];
      appDB.projects[appDB.activeId].labels = ['Urgent', 'Design'];
      appDB.projects[appDB.activeId].topics = ['Frontend', 'Backend'];
      appDB.projects[appDB.activeId].lanes = ['Done', 'To Do', 'In Progress']; // deliberately not alphabetical
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

  const meta = JSON.parse(metaContents);
  expect(meta.resources).toEqual(['Bob', 'Alice']);
  expect(meta.labels).toEqual(['Urgent', 'Design']);
  expect(meta.topics).toEqual(['Frontend', 'Backend']);
  expect(meta.lanes).toEqual(['Done', 'To Do', 'In Progress']);
});

test('restoring a backup replaces all four registries with exactly what its meta.json held, including a defined-but-unused name', async ({ page }) => {
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].resources = ['Stale'];
    appDB.projects[appDB.activeId].labels = ['Stale'];
    appDB.projects[appDB.activeId].topics = ['Stale'];
    appDB.projects[appDB.activeId].lanes = ['Stale'];
    saveToLocal();
  });
  page.once('dialog', (d) => d.accept());

  await page.evaluate((csv) => {
    const meta = {
      name: 'X', updatedAt: 'now',
      resources: ['Alice', 'Charlie'], // Charlie is on no task in SAMPLE_CSV
      labels: ['Design'],
      topics: ['Backend', 'Frontend'], // Frontend is unused in the CSV
      lanes: ['To Do', 'In Progress', 'Done'],
    };
    dbx = {
      filesDownload: ({ path }) => {
        if (path.endsWith('meta.json')) return Promise.resolve({ result: { fileBlob: new Blob([JSON.stringify(meta)]) } });
        return Promise.resolve({ result: { fileBlob: new Blob([csv]) } });
      },
    };
    restoreBackup('/Simple Gantt Backups/id123/2026-01-05_120000.csv');
  }, SAMPLE_CSV);
  await page.waitForTimeout(300);

  const proj = await page.evaluate(() => appDB.projects[appDB.activeId]);
  expect(proj.resources).toEqual(['Alice', 'Charlie']);
  expect(proj.labels).toEqual(['Design']);
  expect(proj.topics).toEqual(['Backend', 'Frontend']);
  expect(proj.lanes).toEqual(['To Do', 'In Progress', 'Done']);
});

test('restoring preserves Lane\'s exact arranged order, even when it differs from the CSV\'s own row order', async ({ page }) => {
  await page.evaluate(() => { appDB.projects[appDB.activeId].lanes = []; saveToLocal(); });
  page.once('dialog', (d) => d.accept());

  // The CSV's one data row puts a task in "To Do" -- if order were
  // reconstructed from CSV row-scan order (the pre-fix behavior whenever
  // the target project's own lanes array was empty), "To Do" would end up
  // first. The backup's actual arranged order put "To Do" last.
  await page.evaluate((csv) => {
    const meta = { name: 'X', updatedAt: 'now', lanes: ['Done', 'In Progress', 'To Do'] };
    dbx = {
      filesDownload: ({ path }) => {
        if (path.endsWith('meta.json')) return Promise.resolve({ result: { fileBlob: new Blob([JSON.stringify(meta)]) } });
        return Promise.resolve({ result: { fileBlob: new Blob([csv]) } });
      },
    };
    restoreBackup('/Simple Gantt Backups/id123/2026-01-05_120000.csv');
  }, SAMPLE_CSV);
  await page.waitForTimeout(300);

  const lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  expect(lanes).toEqual(['Done', 'In Progress', 'To Do']);
});

test('restoring a pre-registries backup (meta.json has no resources/labels/topics/lanes fields) falls back to the CSV-driven merge, not an empty wipe', async ({ page }) => {
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].topics = ['Already Here'];
    appDB.projects[appDB.activeId].lanes = ['Already Here'];
    saveToLocal();
  });
  page.once('dialog', (d) => d.accept());

  await page.evaluate((csv) => {
    dbx = {
      filesDownload: ({ path }) => {
        if (path.endsWith('meta.json')) return Promise.resolve({ result: { fileBlob: new Blob([JSON.stringify({ name: 'X', updatedAt: 'now' })]) } }); // no registry fields at all
        return Promise.resolve({ result: { fileBlob: new Blob([csv]) } });
      },
    };
    restoreBackup('/Simple Gantt Backups/id123/2026-01-05_120000.csv');
  }, SAMPLE_CSV);
  await page.waitForTimeout(300);

  const proj = await page.evaluate(() => appDB.projects[appDB.activeId]);
  // Untouched registry entries survive (applyRestoredRegistries is a no-op
  // per-field when meta lacks that field), and the CSV's own Topic/Lane
  // cell values ("Backend"/"To Do") get merged in on top, same as the
  // schema-ripple's import-time merge always did.
  expect(proj.topics).toEqual(expect.arrayContaining(['Already Here', 'Backend']));
  expect(proj.lanes).toEqual(expect.arrayContaining(['Already Here', 'To Do']));
});

test('restoring when meta.json itself fails to load leaves the registries untouched (and still restores the CSV)', async ({ page }) => {
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].topics = ['Still Here'];
    saveToLocal();
  });
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

  const topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  expect(topics).toEqual(expect.arrayContaining(['Still Here', 'Backend']));

  const taskName = await page.evaluate(() => sheet.getData()[0][2]);
  expect(taskName).toBe('Restored Task');
});

test('a restored Topic/Lane registry is immediately reflected in the grid dropdown source', async ({ page }) => {
  page.once('dialog', (d) => d.accept());
  await page.evaluate((csv) => {
    const meta = { name: 'X', updatedAt: 'now', topics: ['Ops', 'Backend'], lanes: ['Blocked', 'To Do'] };
    dbx = {
      filesDownload: ({ path }) => {
        if (path.endsWith('meta.json')) return Promise.resolve({ result: { fileBlob: new Blob([JSON.stringify(meta)]) } });
        return Promise.resolve({ result: { fileBlob: new Blob([csv]) } });
      },
    };
    restoreBackup('/Simple Gantt Backups/id123/2026-01-05_120000.csv');
  }, SAMPLE_CSV);
  await page.waitForTimeout(300);

  const topicSource = await page.evaluate((c) => sheet.options.columns[c].source, 14); // COL.TOPIC
  const laneSource = await page.evaluate((c) => sheet.options.columns[c].source, 15); // COL.LANE
  expect(topicSource).toEqual(['Ops', 'Backend']);
  expect(laneSource).toEqual(['Blocked', 'To Do']);
});

test('discoverDropboxProjects carries the four registries from meta.json into the discovered candidate', async ({ page }) => {
  const discovered = await page.evaluate(() => {
    dbx = {
      filesListFolder: () => Promise.resolve({ result: { entries: [{ '.tag': 'folder', name: 'remote-id', path_lower: '/simple gantt backups/remote-id' }], has_more: false } }),
      filesDownload: () => Promise.resolve({
        result: {
          fileBlob: new Blob([JSON.stringify({
            name: 'Remote Project',
            resources: ['Dana'], labels: ['Remote Label'], topics: ['Remote Topic'], lanes: ['Remote Lane A', 'Remote Lane B'],
          })]),
        },
      }),
    };
    return new Promise((resolve) => {
      const originalOpen = window.openDiscoveryModal;
      window.openDiscoveryModal = function(found) { resolve(found); originalOpen(found); };
      discoverDropboxProjects(true);
    });
  });

  expect(discovered[0].resources).toEqual(['Dana']);
  expect(discovered[0].labels).toEqual(['Remote Label']);
  expect(discovered[0].topics).toEqual(['Remote Topic']);
  expect(discovered[0].lanes).toEqual(['Remote Lane A', 'Remote Lane B']);
});

test('importing a discovered cross-device project applies its meta.json registries to the new local project, in order', async ({ page }) => {
  const proj = await page.evaluate((csv) => {
    dbx = {
      filesListFolder: () => Promise.resolve({ result: { entries: [{ '.tag': 'file', name: 'backup.csv', path_lower: '/x/backup.csv', client_modified: '2026-01-05T00:00:00Z' }], has_more: false } }),
      filesDownload: () => Promise.resolve({ result: { fileBlob: new Blob([csv]) } }),
    };
    return importDiscoveredProject({
      id: 'remote-id', pathLower: '/x', name: 'Remote Project',
      topics: ['Ops', 'Backend'], lanes: ['Done', 'To Do'],
    }).then(() => Object.values(appDB.projects).find((p) => p.name === 'Remote Project'));
  }, SAMPLE_CSV);

  expect(proj.topics).toEqual(['Ops', 'Backend']);
  expect(proj.lanes).toEqual(['Done', 'To Do']);
});

test('importing a discovered project whose meta.json has no registries falls back to collecting them from the CSV (and now actually sets Topic/Lane at all)', async ({ page }) => {
  const proj = await page.evaluate((csv) => {
    dbx = {
      filesListFolder: () => Promise.resolve({ result: { entries: [{ '.tag': 'file', name: 'backup.csv', path_lower: '/x/backup.csv', client_modified: '2026-01-05T00:00:00Z' }], has_more: false } }),
      filesDownload: () => Promise.resolve({ result: { fileBlob: new Blob([csv]) } }),
    };
    return importDiscoveredProject({ id: 'remote-id-2', pathLower: '/x', name: 'Registry-less Project' })
      .then(() => Object.values(appDB.projects).find((p) => p.name === 'Registry-less Project'));
  }, SAMPLE_CSV);

  expect(proj.topics).toEqual(['Backend']); // collected from the CSV's own "Backend" cell value
  expect(proj.lanes).toEqual(['To Do']);
});
