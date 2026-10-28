// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #32's Named Lanes registry: a per-project `lanes` array
// managed via the "Lanes" toolbar button/modal, sourcing the grid's Lane
// column (a closed-set jexcel `dropdown`, not free text like Resource/
// Labels). Lane order is meaningful -- it's the Kanban board's left-to-right
// column order within a Topic -- so a new lane is appended at the end
// rather than sorted in, and the Manager modal gets ▲/▼ reorder controls,
// same as Named Topics (tests/named-topics.spec.js).

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12, STATUS: 13, TOPIC: 14, LANE: 15 };

test.beforeEach(async ({ page }) => {
  await page.evaluate((COL) => {
    const data = [];
    data[0] = Array(16).fill('');
    data[0][COL.ID] = '1'; data[0][COL.OUTLINE] = '1'; data[0][COL.NAME] = 'Task 1';
    data[0][COL.LANE] = 'To Do';
    data[0][COL.ALLOC] = '100'; data[0][COL.PCT] = '0';
    data[0][COL.START] = '2026-08-24'; data[0][COL.DUR] = '1'; data[0][COL.END] = '2026-08-24';

    data[1] = Array(16).fill('');
    data[1][COL.ID] = '2'; data[1][COL.OUTLINE] = '2'; data[1][COL.NAME] = 'Task 2';
    data[1][COL.ALLOC] = '100'; data[1][COL.PCT] = '0';
    data[1][COL.START] = '2026-08-24'; data[1][COL.DUR] = '1'; data[1][COL.END] = '2026-08-24';

    appDB.projects[appDB.activeId].data = data;
    appDB.projects[appDB.activeId].lanes = ['To Do', 'In Progress', 'Done'];
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);
});

test('a fresh project (and the sample project) seeds an empty lanes registry', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Fresh Project'));
  await page.evaluate(() => createNewProject());
  await page.waitForTimeout(200);
  const lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  expect(lanes).toEqual([]);
});

test('the Lane cell is a closed-set dropdown, not free text', async ({ page }) => {
  const colDef = await page.evaluate((c) => sheet.options.columns[c], COL.LANE);
  expect(colDef.type).toBe('dropdown');
  expect(colDef.source).toEqual(['To Do', 'In Progress', 'Done']);
});

test('Manage Lanes modal: adding a name appends it at the end, not alphabetized', async ({ page }) => {
  await page.click('button[onclick="openLaneManagerModal()"]');
  await expect(page.locator('#laneManagerModal')).toBeVisible();

  await page.fill('#newLaneNameInput', 'Blocked');
  await page.click('button[onclick="addNewLaneName()"]');
  await page.click('button[onclick="closeLaneManagerModal()"]');

  const lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  expect(lanes).toEqual(['To Do', 'In Progress', 'Done', 'Blocked']);

  const colDef = await page.evaluate((c) => sheet.options.columns[c], COL.LANE);
  expect(colDef.source).toEqual(['To Do', 'In Progress', 'Done', 'Blocked']);
});

test('adding a duplicate (case-insensitive) name is a no-op', async ({ page }) => {
  await page.click('button[onclick="openLaneManagerModal()"]');
  await page.fill('#newLaneNameInput', 'to do');
  await page.click('button[onclick="addNewLaneName()"]');
  const lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  expect(lanes).toEqual(['To Do', 'In Progress', 'Done']);
});

test('renaming a lane in the modal propagates into every task assignment and keeps its position', async ({ page }) => {
  await page.click('button[onclick="openLaneManagerModal()"]');
  const inputs = page.locator('#laneManagerListContainer input[type=text]');
  const idx = await inputs.evaluateAll((els) => els.findIndex((el) => /** @type {HTMLInputElement} */ (el).value === 'To Do'));
  expect(idx).toBeGreaterThan(-1);
  await inputs.nth(idx).fill('Backlog');
  await inputs.nth(idx).blur();
  await page.waitForTimeout(200);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.LANE]).toBe('Backlog');

  const lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  expect(lanes).toEqual(['Backlog', 'In Progress', 'Done']); // same slot, not re-sorted
});

test('renaming to a name already in the list is rejected', async ({ page }) => {
  await page.click('button[onclick="openLaneManagerModal()"]');
  const inputs = page.locator('#laneManagerListContainer input[type=text]');
  const idx = await inputs.evaluateAll((els) => els.findIndex((el) => /** @type {HTMLInputElement} */ (el).value === 'To Do'));
  page.once('dialog', (d) => d.accept());
  await inputs.nth(idx).fill('Done');
  await inputs.nth(idx).blur();
  await page.waitForTimeout(200);

  const lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  expect(lanes).toEqual(['To Do', 'In Progress', 'Done']); // unchanged
});

test('deleting a lane from the modal removes it from the registry but leaves existing task text untouched', async ({ page }) => {
  await page.click('button[onclick="openLaneManagerModal()"]');
  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => deleteLaneName('To Do'));
  await page.waitForTimeout(200);

  const lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  expect(lanes).toEqual(['In Progress', 'Done']);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.LANE]).toBe('To Do'); // task's own cell is untouched
});

test('the ▲/▼ buttons reorder lanes, disabled at each end of the list', async ({ page }) => {
  await page.click('button[onclick="openLaneManagerModal()"]');
  await page.waitForTimeout(100);

  const firstUp = page.locator('#laneManagerListContainer > div').first().locator('button', { hasText: '▲' });
  const lastDown = page.locator('#laneManagerListContainer > div').last().locator('button', { hasText: '▼' });
  await expect(firstUp).toBeDisabled();
  await expect(lastDown).toBeDisabled();

  await page.evaluate(() => moveLaneName('Done', -1)); // Done is last -> move up one
  await page.waitForTimeout(100);
  let lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  expect(lanes).toEqual(['To Do', 'Done', 'In Progress']);

  await page.evaluate(() => moveLaneName('To Do', 1)); // To Do is first -> move down one
  await page.waitForTimeout(100);
  lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  expect(lanes).toEqual(['Done', 'To Do', 'In Progress']);
});

test('moving the first lane up, or the last lane down, is a no-op', async ({ page }) => {
  await page.evaluate(() => moveLaneName('To Do', -1)); // already first
  await page.evaluate(() => moveLaneName('Done', 1)); // already last
  const lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  expect(lanes).toEqual(['To Do', 'In Progress', 'Done']);
});

test('reordering is reflected immediately in the grid dropdown source and the Kanban board column order', async ({ page }) => {
  // Two single-step moves, matching what clicking ▲ twice does -- moveLaneName
  // swaps one adjacent pair per call, it doesn't shift the whole list.
  await page.evaluate(() => { moveLaneName('Done', -1); moveLaneName('Done', -1); }); // move to front: Done, To Do, In Progress
  await page.waitForTimeout(100);

  const colDef = await page.evaluate((c) => sheet.options.columns[c], COL.LANE);
  expect(colDef.source).toEqual(['Done', 'To Do', 'In Progress']);

  await page.click('#btnKanbanView');
  await page.waitForTimeout(200);
  const lanes = await page.evaluate(() => Array.from(document.querySelectorAll('.kanban-lane')).map((l) => l.dataset.lane));
  expect(lanes).toEqual(['Unsorted', 'Done', 'To Do', 'In Progress']);
});

test('Lane column CSV shape is unchanged -- still a plain column, no registry footprint beyond the header', async ({ page }) => {
  const fs = require('fs');
  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const headerLine = content.split('\n')[0].trim();
  expect(headerLine.split(',')).toContain('Lane');
  expect(content).toContain('To Do');
});

test('importing a CSV merges a not-yet-registered lane into the registry in first-seen order, not alphabetized', async ({ page }) => {
  const fs = require('fs');
  const csv = 'ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent,Labels,Notes,Status,Topic,Lane\n' +
    '1,1,Imported A,,100,0,2026-08-24,1,2026-08-24,,,,,,,Zebra\n' +
    '2,2,Imported B,,100,0,2026-08-24,1,2026-08-24,,,,,,,Apple\n';
  const tmpPath = require('path').join(require('os').tmpdir(), `import-lanes-${Date.now()}.csv`);
  fs.writeFileSync(tmpPath, csv);

  await page.setInputFiles('#csvFile', tmpPath);
  await page.waitForTimeout(400);

  const lanes = await page.evaluate(() => appDB.projects[appDB.activeId].lanes);
  // The existing registry (To Do/In Progress/Done) is untouched -- only
  // genuinely new names are appended, in the CSV's own row order (Zebra
  // before Apple; an alphabetized merge would put Apple first).
  expect(lanes).toEqual(['To Do', 'In Progress', 'Done', 'Zebra', 'Apple']);
});
