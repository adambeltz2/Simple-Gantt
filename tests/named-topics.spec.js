// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #32's Named Topics registry: a per-project `topics` array
// managed via the "Topics" toolbar button/modal, sourcing the grid's Topic
// column (a closed-set jexcel `dropdown`, not free text like Resource/
// Labels -- there's no quick-pick popover here, the dropdown itself is the
// picker). Unlike Named Resources/Labels (always alphabetized), Topic order
// is meaningful -- it's the Kanban board's left-to-right tab order -- so a
// new topic is appended at the end rather than sorted in, and the Manager
// modal gets ▲/▼ reorder controls, same as Named Lanes (tests/named-lanes.spec.js).

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12, STATUS: 13, TOPIC: 14, LANE: 15 };

test.beforeEach(async ({ page }) => {
  await page.evaluate((COL) => {
    const data = [];
    data[0] = Array(16).fill('');
    data[0][COL.ID] = '1'; data[0][COL.OUTLINE] = '1'; data[0][COL.NAME] = 'Task 1';
    data[0][COL.TOPIC] = 'Backend';
    data[0][COL.ALLOC] = '100'; data[0][COL.PCT] = '0';
    data[0][COL.START] = '2026-08-24'; data[0][COL.DUR] = '1'; data[0][COL.END] = '2026-08-24';

    data[1] = Array(16).fill('');
    data[1][COL.ID] = '2'; data[1][COL.OUTLINE] = '2'; data[1][COL.NAME] = 'Task 2';
    data[1][COL.ALLOC] = '100'; data[1][COL.PCT] = '0';
    data[1][COL.START] = '2026-08-24'; data[1][COL.DUR] = '1'; data[1][COL.END] = '2026-08-24';

    appDB.projects[appDB.activeId].data = data;
    appDB.projects[appDB.activeId].topics = ['Backend', 'Frontend', 'Design'];
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);
});

test('a fresh project (and the sample project) seeds an empty topics registry', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Fresh Project'));
  await page.evaluate(() => createNewProject());
  await page.waitForTimeout(200);
  const topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  expect(topics).toEqual([]);
});

test('the Topic cell is a closed-set dropdown, not free text', async ({ page }) => {
  const colDef = await page.evaluate((c) => sheet.options.columns[c], COL.TOPIC);
  expect(colDef.type).toBe('dropdown');
  expect(colDef.source).toEqual(['Backend', 'Frontend', 'Design']);
});

test('Manage Topics modal: adding a name appends it at the end, not alphabetized', async ({ page }) => {
  await page.click('button[onclick="openTopicManagerModal()"]');
  await expect(page.locator('#topicManagerModal')).toBeVisible();

  await page.fill('#newTopicNameInput', 'Ops');
  await page.click('button[onclick="addNewTopicName()"]');
  await page.click('button[onclick="closeTopicManagerModal()"]');

  const topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  expect(topics).toEqual(['Backend', 'Frontend', 'Design', 'Ops']); // appended, not sorted to "Backend, Design, Frontend, Ops"

  const colDef = await page.evaluate((c) => sheet.options.columns[c], COL.TOPIC);
  expect(colDef.source).toEqual(['Backend', 'Frontend', 'Design', 'Ops']);
});

test('adding a duplicate (case-insensitive) name is a no-op', async ({ page }) => {
  await page.click('button[onclick="openTopicManagerModal()"]');
  await page.fill('#newTopicNameInput', 'backend');
  await page.click('button[onclick="addNewTopicName()"]');
  const topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  expect(topics).toEqual(['Backend', 'Frontend', 'Design']);
});

test('renaming a topic in the modal propagates into every task assignment and keeps its position', async ({ page }) => {
  await page.click('button[onclick="openTopicManagerModal()"]');
  const inputs = page.locator('#topicManagerListContainer input[type=text]');
  const idx = await inputs.evaluateAll((els) => els.findIndex((el) => /** @type {HTMLInputElement} */ (el).value === 'Backend'));
  expect(idx).toBeGreaterThan(-1);
  await inputs.nth(idx).fill('API');
  await inputs.nth(idx).blur();
  await page.waitForTimeout(200);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.TOPIC]).toBe('API');

  const topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  expect(topics).toEqual(['API', 'Frontend', 'Design']); // same slot, not re-sorted
});

test('renaming to a name already in the list is rejected', async ({ page }) => {
  await page.click('button[onclick="openTopicManagerModal()"]');
  const inputs = page.locator('#topicManagerListContainer input[type=text]');
  const idx = await inputs.evaluateAll((els) => els.findIndex((el) => /** @type {HTMLInputElement} */ (el).value === 'Backend'));
  page.once('dialog', (d) => d.accept());
  await inputs.nth(idx).fill('Frontend');
  await inputs.nth(idx).blur();
  await page.waitForTimeout(200);

  const topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  expect(topics).toEqual(['Backend', 'Frontend', 'Design']); // unchanged
});

test('deleting a topic from the modal removes it from the registry but leaves existing task text untouched', async ({ page }) => {
  await page.click('button[onclick="openTopicManagerModal()"]');
  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => deleteTopicName('Backend'));
  await page.waitForTimeout(200);

  const topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  expect(topics).toEqual(['Frontend', 'Design']);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.TOPIC]).toBe('Backend'); // task's own cell is untouched
});

test('the ▲/▼ buttons reorder topics, disabled at each end of the list', async ({ page }) => {
  await page.click('button[onclick="openTopicManagerModal()"]');
  await page.waitForTimeout(100);

  const firstUp = page.locator('#topicManagerListContainer > div').first().locator('button', { hasText: '▲' });
  const lastDown = page.locator('#topicManagerListContainer > div').last().locator('button', { hasText: '▼' });
  await expect(firstUp).toBeDisabled();
  await expect(lastDown).toBeDisabled();

  await page.evaluate(() => moveTopicName('Design', -1)); // Design is last -> move up one
  await page.waitForTimeout(100);
  let topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  expect(topics).toEqual(['Backend', 'Design', 'Frontend']);

  await page.evaluate(() => moveTopicName('Backend', 1)); // Backend is first -> move down one
  await page.waitForTimeout(100);
  topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  expect(topics).toEqual(['Design', 'Backend', 'Frontend']);
});

test('moving the first topic up, or the last topic down, is a no-op', async ({ page }) => {
  await page.evaluate(() => moveTopicName('Backend', -1)); // already first
  await page.evaluate(() => moveTopicName('Design', 1)); // already last
  const topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  expect(topics).toEqual(['Backend', 'Frontend', 'Design']);
});

test('reordering is reflected immediately in the grid dropdown source and the Kanban board tab order', async ({ page }) => {
  // Two single-step moves, matching what clicking ▲ twice does -- moveTopicName
  // swaps one adjacent pair per call, it doesn't shift the whole list.
  await page.evaluate(() => { moveTopicName('Design', -1); moveTopicName('Design', -1); }); // move to front: Design, Backend, Frontend
  await page.waitForTimeout(100);

  const colDef = await page.evaluate((c) => sheet.options.columns[c], COL.TOPIC);
  expect(colDef.source).toEqual(['Design', 'Backend', 'Frontend']);

  await page.click('#btnKanbanView');
  await page.waitForTimeout(200);
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.kanban-topic-tab')).map((t) => t.textContent));
  expect(tabs).toEqual(['Design', 'Backend', 'Frontend', 'Uncategorized']);
});

test('Topic column CSV shape is unchanged -- still a plain column, no registry footprint beyond the header', async ({ page }) => {
  const fs = require('fs');
  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const headerLine = content.split('\n')[0].trim();
  expect(headerLine.split(',')).toContain('Topic');
  expect(content).toContain('Backend');
});

test('importing a CSV merges a not-yet-registered topic into the registry in first-seen order, not alphabetized', async ({ page }) => {
  const fs = require('fs');
  const csv = 'ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent,Labels,Notes,Status,Topic,Lane\n' +
    '1,1,Imported A,,100,0,2026-08-24,1,2026-08-24,,,,,,Zebra,\n' +
    '2,2,Imported B,,100,0,2026-08-24,1,2026-08-24,,,,,,Apple,\n';
  const tmpPath = require('path').join(require('os').tmpdir(), `import-topics-${Date.now()}.csv`);
  fs.writeFileSync(tmpPath, csv);

  await page.setInputFiles('#csvFile', tmpPath);
  await page.waitForTimeout(400);

  const topics = await page.evaluate(() => appDB.projects[appDB.activeId].topics);
  // The existing registry (Backend/Frontend/Design) is untouched -- only
  // genuinely new names are appended, in the CSV's own row order (Zebra
  // before Apple; an alphabetized merge would put Apple first).
  expect(topics).toEqual(['Backend', 'Frontend', 'Design', 'Zebra', 'Apple']);
});
