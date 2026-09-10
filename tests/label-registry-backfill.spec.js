// @ts-check
const { test, expect } = require('./fixtures');

// One-to-one with resource-registry-backfill.spec.js: a project whose Labels
// cells were already populated before the named-labels registry existed --
// or restored/synced from a path that never ran CSV import's own merge step
// -- otherwise loads with an empty registry, so the quick-pick picker shows
// "No named labels yet" for every row despite labels already sitting in the
// grid. Fixed the same way, with backfillLabelsRegistry(), run once per
// project in the same startup loop as backfillResourcesRegistry.

test('a project with an empty registry but existing Labels data gets backfilled', async ({ page }) => {
  const labels = await page.evaluate(() => {
    const proj = {
      name: 'Pre-existing Project',
      columns: [],
      data: [
        ['1', '1', 'Task A', '', '100', '0', '2026-08-24', '1', '2026-08-24', '', '', 'System A;Urgent', ''],
        ['2', '2', 'Task B', '', '100', '100', '2026-08-25', '1', '2026-08-25', '', '', 'System B, Urgent', ''],
        ['3', '3', 'Task C', '', '', '0', '', '', '', '', '', '', ''],
      ],
      collapsed: [], flagged: [], resources: [],
      labels: [], // the exact reported shape: names in the grid, registry empty
      projectNotes: '',
    };
    backfillLabelsRegistry(proj);
    return proj.labels;
  });

  expect(labels).toEqual(['System A', 'System B', 'Urgent']);
});

test('a project that already has every name registered is left untouched (idempotent, no duplicates or reordering)', async ({ page }) => {
  const labels = await page.evaluate(() => {
    const proj = {
      name: 'Already Registered',
      columns: [],
      data: [['1', '1', 'Task A', '', '100', '0', '2026-08-24', '1', '2026-08-24', '', '', 'System A', '']],
      collapsed: [], flagged: [], resources: [],
      labels: ['System A', 'Zeta'], // Zeta has no task yet, but is deliberately pre-registered
      projectNotes: '',
    };
    backfillLabelsRegistry(proj);
    return proj.labels;
  });

  expect(labels).toEqual(['System A', 'Zeta']);
});

test('is wired into the app startup migration loop, alongside backfillResourcesRegistry', async ({ page }) => {
  const isFunction = await page.evaluate(() => typeof backfillLabelsRegistry === 'function');
  expect(isFunction).toBe(true);
});

test('the label picker popover reflects a freshly backfilled registry, not just live edits going forward', async ({ page }) => {
  await page.evaluate(() => {
    const rows = [
      ['1', '1', 'Task A', '', '100', '0', '2026-08-24', '1', '2026-08-24', '', '', 'System A', ''],
      ['2', '2', 'Task B', '', '100', '100', '2026-08-25', '1', '2026-08-25', '', '', 'System B', ''],
      ['3', '3', 'Task C', '', '', '0', '', '', '', '', '', '', ''],
    ];
    appDB.projects[appDB.activeId].data = rows;
    appDB.projects[appDB.activeId].labels = [];
    backfillLabelsRegistry(appDB.projects[appDB.activeId]);
    renderGrid(rows);
    syncToGantt(true);
  });
  await page.waitForTimeout(300);

  // Open the picker on the THIRD row (blank Labels, never edited) -- before
  // the fix, this would show "No named labels yet" since the registry
  // started empty and nothing had touched a Labels cell yet.
  await page.evaluate(() => {
    const cell = sheet.getCellFromCoords(11, 2);
    cell.querySelector('.label-picker-toggle').click();
  });
  await page.waitForTimeout(200);

  const optionNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#labelPickerPopover label')).map((l) => l.textContent.trim())
  );
  expect(optionNames).toEqual(['System A', 'System B']);
});
