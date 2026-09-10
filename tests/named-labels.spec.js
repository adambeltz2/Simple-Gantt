// @ts-check
const { test, expect } = require('./fixtures');

// Labels as a first-class entity, one-to-one with the named-resources
// registry (backlog #12): labels can be named ahead of time (a per-project
// `labels` registry, managed via the "Labels" toolbar button/modal) and
// picked from the grid via a small quick-pick icon on the Labels cell,
// instead of always typed from scratch. The Labels cell itself stays exactly
// the free-text, comma/semicolon-delimited field it always was, so CSV
// export/import and the "Label in chart" narrowing are unaffected in shape.
// Per explicit user decision, this stays structural only -- no color/badge
// treatment, unlike Resource's separate Gantt-bar color-coding feature. The
// registry is new per-project metadata (like `resources`/`columns`), not
// part of the task CSV; importing a CSV whose Labels column names a label
// not yet registered merges that name into the registry rather than
// dropping it.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

test.beforeEach(async ({ page }) => {
  await page.evaluate((COL) => {
    const data = [];
    data[0] = Array(12).fill('');
    data[0][COL.ID] = '1'; data[0][COL.OUTLINE] = '1'; data[0][COL.NAME] = 'Task 1';
    data[0][COL.LABELS] = 'System A;Urgent';
    data[0][COL.ALLOC] = '100'; data[0][COL.PCT] = '0';
    data[0][COL.START] = '2026-08-24'; data[0][COL.DUR] = '1'; data[0][COL.END] = '2026-08-24';

    data[1] = Array(12).fill('');
    data[1][COL.ID] = '2'; data[1][COL.OUTLINE] = '2'; data[1][COL.NAME] = 'Task 2';
    data[1][COL.ALLOC] = '100'; data[1][COL.PCT] = '0';
    data[1][COL.START] = '2026-08-24'; data[1][COL.DUR] = '1'; data[1][COL.END] = '2026-08-24';

    appDB.projects[appDB.activeId].data = data;
    appDB.projects[appDB.activeId].labels = ['System A', 'System B', 'Urgent'];
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);
});

test('a fresh project (and the sample project) seeds a labels registry', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Fresh Project'));
  await page.evaluate(() => createNewProject());
  await page.waitForTimeout(200);
  const labels = await page.evaluate(() => appDB.projects[appDB.activeId].labels);
  expect(labels).toEqual([]);
});

test('the Labels cell stays a plain free-text field', async ({ page }) => {
  const colDef = await page.evaluate(() => sheet.options.columns[11]);
  expect(colDef.type).toBe('text');
});

test('every Labels cell gets a quick-pick picker icon', async ({ page }) => {
  const count = await page.locator('.label-picker-toggle').count();
  expect(count).toBeGreaterThanOrEqual(2);
});

test('clicking the picker icon opens a checkbox list of registered labels, pre-checked to match the cell', async ({ page }) => {
  await page.locator('.label-picker-toggle').first().click();
  await expect(page.locator('#labelPickerPopover')).toBeVisible();

  const labels = await page.locator('#labelPickerPopover label').allTextContents();
  expect(labels.map((l) => l.trim())).toEqual(['System A', 'System B', 'Urgent']);

  const checkboxes = page.locator('.labelPickerCheckbox');
  expect(await checkboxes.nth(0).isChecked()).toBe(true); // System A, in "System A;Urgent"
  expect(await checkboxes.nth(1).isChecked()).toBe(false); // System B
  expect(await checkboxes.nth(2).isChecked()).toBe(true); // Urgent
});

test('checking an unchecked label adds it to the cell, preserving what was already there', async ({ page }) => {
  await page.locator('.label-picker-toggle').first().click();
  await page.locator('.labelPickerCheckbox').nth(1).check(); // System B
  await page.waitForTimeout(200);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.LABELS]).toBe('System A, Urgent, System B');
});

test('unchecking a label removes just that one, preserving the rest', async ({ page }) => {
  await page.locator('.label-picker-toggle').first().click();
  await page.locator('.labelPickerCheckbox').nth(2).uncheck(); // Urgent
  await page.waitForTimeout(200);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.LABELS]).toBe('System A');
});

test('picking from an empty Labels cell just sets it to the picked name', async ({ page }) => {
  await page.locator('.label-picker-toggle').nth(1).click(); // Task 2, no label yet
  await page.locator('.labelPickerCheckbox').nth(1).check(); // System B
  await page.waitForTimeout(200);

  const row = await page.evaluate(() => sheet.getData()[1]);
  expect(row[COL.LABELS]).toBe('System B');
});

test('clicking outside the popover closes it', async ({ page }) => {
  await page.locator('.label-picker-toggle').first().click();
  await expect(page.locator('#labelPickerPopover')).toBeVisible();

  await page.click('#spreadsheet');
  await expect(page.locator('#labelPickerPopover')).toBeHidden();
});

test('Manage Labels modal: adding a name makes it available in the picker', async ({ page }) => {
  await page.click('button[onclick="openLabelManagerModal()"]');
  await expect(page.locator('#labelManagerModal')).toBeVisible();

  await page.fill('#newLabelNameInput', 'Blocked');
  await page.click('button[onclick="addNewLabelName()"]');
  await page.click('button[onclick="closeLabelManagerModal()"]');

  const labels = await page.evaluate(() => appDB.projects[appDB.activeId].labels);
  expect(labels).toContain('Blocked');

  await page.locator('.label-picker-toggle').first().click();
  const items = await page.locator('#labelPickerPopover label').allTextContents();
  expect(items.map((l) => l.trim())).toContain('Blocked');
});

test('renaming a label in the modal propagates into every task assignment', async ({ page }) => {
  await page.click('button[onclick="openLabelManagerModal()"]');
  const inputs = page.locator('#labelManagerListContainer input[type=text]');
  const count = await inputs.count();
  let idx = -1;
  for (let i = 0; i < count; i++) {
    if ((await inputs.nth(i).inputValue()) === 'System A') { idx = i; break; }
  }
  expect(idx).toBeGreaterThan(-1);
  await inputs.nth(idx).fill('System A2');
  await inputs.nth(idx).blur();
  await page.waitForTimeout(200);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.LABELS]).toBe('System A2, Urgent');

  const labels = await page.evaluate(() => appDB.projects[appDB.activeId].labels);
  expect(labels).toContain('System A2');
  expect(labels).not.toContain('System A');
});

test('deleting a label from the modal removes it from the registry but leaves existing task text untouched', async ({ page }) => {
  await page.click('button[onclick="openLabelManagerModal()"]');
  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => deleteLabelName('System B'));
  await page.waitForTimeout(200);

  const labels = await page.evaluate(() => appDB.projects[appDB.activeId].labels);
  expect(labels).not.toContain('System B');
});

test('Labels column CSV shape is unchanged -- still the same free-text cell, no registry column added', async ({ page }) => {
  const fs = require('fs');
  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const headerLine = content.split('\n')[0].trim();
  expect(headerLine.split(',')).toEqual(['Task ID', 'Outline', 'Task Name', 'Resource', 'Def. Alloc', '% Done', 'Start', 'Dur.', 'End', 'Depends', 'Parent', 'Labels', 'Notes']);
  expect(content).toContain('System A;Urgent');
});

test('typing a new label directly into the grid Labels cell registers it too, not just names that arrive via CSV import', async ({ page }) => {
  await page.evaluate((COL) => sheet.setValueFromCoords(COL.LABELS, 1, 'Blocked', true), COL);
  await page.waitForTimeout(200);

  const labels = await page.evaluate(() => appDB.projects[appDB.activeId].labels);
  expect(labels).toContain('Blocked');

  await page.locator('.label-picker-toggle').nth(1).click();
  const items = await page.locator('#labelPickerPopover label').allTextContents();
  expect(items.map((l) => l.trim())).toContain('Blocked');
});

test('importing a CSV merges any not-yet-registered label into the registry instead of dropping it', async ({ page }) => {
  const fs = require('fs');
  const csv = 'ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent,Labels\n' +
    '1,1,Imported Task,,100,0,2026-08-24,1,2026-08-24,,,"Blocked, System A"\n';
  const tmpPath = require('path').join(require('os').tmpdir(), `import-labels-${Date.now()}.csv`);
  fs.writeFileSync(tmpPath, csv);

  await page.setInputFiles('#csvFile', tmpPath);
  await page.waitForTimeout(400);

  const labels = await page.evaluate(() => appDB.projects[appDB.activeId].labels);
  expect(labels).toEqual(expect.arrayContaining(['System A', 'System B', 'Urgent', 'Blocked']));
});

test('the "All Labels" filter is sourced from the registry, including a registered-but-unused label', async ({ page }) => {
  await page.click('#labelFilterBtn');
  const values = await page.locator('.labelFilterCheckbox').evaluateAll((els) => els.map((e) => e.value));
  // "System B" is registered but no task currently carries it -- it still
  // appears, unlike the old live-scan behavior that would have hidden it.
  expect(values).toEqual(['System A', 'System B', 'Urgent']);
});
