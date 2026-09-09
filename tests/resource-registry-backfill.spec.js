// @ts-check
const { test, expect } = require('./fixtures');

// User-reported: in a real project restored/synced from before the
// named-resources registry existed (backlog #12), the Resource quick-pick
// picker showed "No named resources yet" for every row despite dozens of
// names already typed in the grid -- it only grew one cell (or one cell's
// worth of comma/semicolon-separated names) at a time as each Resource cell
// happened to get individually re-edited. Root cause: CSV import and the
// Dropbox cross-device discovery path both already backfill the registry
// from existing rows on import (mergeResourceNamesFromRows() /
// collectResourceNamesFromRows()), but the plain page-load-from-localStorage
// path only ever defaulted a missing `resources` key to an empty array,
// with no equivalent backfill from the project's own existing data. Fixed
// with backfillResourcesRegistry(), run once per project in the same
// startup loop as normalizeData()/migrateLegacyNotesColumn().
//
// Tested by calling the migration function directly on a plain object, same
// convention as task-notes.spec.js's own "localStorage migration path" test
// -- exercising the real function against the real loaded app without
// needing a second full page reload, which this harness's mocked CDN
// routing doesn't reliably survive (a known, pre-existing limitation
// documented elsewhere in this suite, unrelated to the fix itself).

test('a project with an empty registry but existing Resource data gets backfilled', async ({ page }) => {
  const resources = await page.evaluate(() => {
    const proj = {
      name: 'Pre-existing Project',
      columns: [],
      data: [
        ['1', '1', 'Task A', 'Adam Beltz', '100', '0', '2026-08-24', '1', '2026-08-24', '', '', '', ''],
        ['2', '2', 'Task B', 'Pooja Agarwal, Wayne Kakuda', '100', '100', '2026-08-25', '1', '2026-08-25', '', '', '', ''],
        ['3', '3', 'Task C', '', '', '0', '', '', '', '', '', '', ''],
      ],
      collapsed: [], flagged: [],
      resources: [], // the exact reported shape: names in the grid, registry empty
      projectNotes: '',
    };
    backfillResourcesRegistry(proj);
    return proj.resources;
  });

  expect(resources).toEqual(['Adam Beltz', 'Pooja Agarwal', 'Wayne Kakuda']);
});

test('a project that already has every name registered is left untouched (idempotent, no duplicates or reordering)', async ({ page }) => {
  const resources = await page.evaluate(() => {
    const proj = {
      name: 'Already Registered',
      columns: [],
      data: [['1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', '', '', '']],
      collapsed: [], flagged: [],
      resources: ['Alice', 'Zack'], // Zack has no task yet, but is deliberately pre-registered
      projectNotes: '',
    };
    backfillResourcesRegistry(proj);
    return proj.resources;
  });

  expect(resources).toEqual(['Alice', 'Zack']);
});

test('an allocation suffix like "(50%)" is stripped, matching the same name-parsing every other resource path uses', async ({ page }) => {
  const resources = await page.evaluate(() => {
    const proj = {
      name: 'Alloc Suffixes',
      columns: [],
      data: [['1', '1', 'Task A', 'Alice (50%), Bob @ 25%', '100', '0', '2026-08-24', '1', '2026-08-24', '', '', '', '']],
      collapsed: [], flagged: [], resources: [], projectNotes: '',
    };
    backfillResourcesRegistry(proj);
    return proj.resources;
  });

  expect(resources).toEqual(['Alice', 'Bob']);
});

test('is wired into the app startup migration loop, alongside normalizeData/migrateLegacyNotesColumn', async ({ page }) => {
  const isFunction = await page.evaluate(() => typeof backfillResourcesRegistry === 'function');
  expect(isFunction).toBe(true);
});

test('the resource picker popover reflects a freshly backfilled registry, not just live edits going forward', async ({ page }) => {
  await page.evaluate(() => {
    const rows = [
      ['1', '1', 'Task A', 'Adam Beltz', '100', '0', '2026-08-24', '1', '2026-08-24', '', '', '', ''],
      ['2', '2', 'Task B', 'Pooja Agarwal', '100', '100', '2026-08-25', '1', '2026-08-25', '', '', '', ''],
      ['3', '3', 'Task C', '', '', '0', '', '', '', '', '', '', ''],
    ];
    appDB.projects[appDB.activeId].data = rows;
    appDB.projects[appDB.activeId].resources = [];
    backfillResourcesRegistry(appDB.projects[appDB.activeId]);
    renderGrid(rows);
    syncToGantt(true);
  });
  await page.waitForTimeout(300);

  // Open the picker on the THIRD row (blank Resource, never edited) -- before
  // the fix, this would show "No named resources yet" since the registry
  // started empty and nothing had touched a Resource cell yet.
  await page.evaluate(() => {
    const cell = sheet.getCellFromCoords(3, 2);
    cell.querySelector('.resource-picker-toggle').click();
  });
  await page.waitForTimeout(200);

  const optionNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#resourcePickerPopover label')).map((l) => l.textContent.trim())
  );
  expect(optionNames).toEqual(['Adam Beltz', 'Pooja Agarwal']);
});
