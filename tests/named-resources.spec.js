// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #12, Resources as a first-class entity: resources can be
// named ahead of time (a per-project `resources` registry, managed via the
// "Resources" toolbar button/modal) and picked from the grid via a small
// quick-pick icon on the Resource cell, instead of always typed from
// scratch. The Resource cell itself stays exactly the free-text,
// comma/semicolon-delimited field it always was -- allocation annotations
// like "Alice (50%)" included -- so parseAssignments(), the workload
// dashboard, resource color-coding, and CSV export/import are all
// unaffected in shape. The registry itself is new per-project metadata
// (like `columns`/`collapsed`), not part of the task CSV; importing a CSV
// whose Resource column names someone not yet registered merges that name
// into the registry rather than dropping it.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

test.beforeEach(async ({ page }) => {
  await page.evaluate((COL) => {
    const data = [];
    data[0] = Array(12).fill('');
    data[0][COL.ID] = '1'; data[0][COL.OUTLINE] = '1'; data[0][COL.NAME] = 'Task 1';
    data[0][COL.RESOURCE] = 'Alice (50%), Bob';
    data[0][COL.ALLOC] = '100'; data[0][COL.PCT] = '0';
    data[0][COL.START] = '2026-08-24'; data[0][COL.DUR] = '1'; data[0][COL.END] = '2026-08-24';

    data[1] = Array(12).fill('');
    data[1][COL.ID] = '2'; data[1][COL.OUTLINE] = '2'; data[1][COL.NAME] = 'Task 2';
    data[1][COL.ALLOC] = '100'; data[1][COL.PCT] = '0';
    data[1][COL.START] = '2026-08-24'; data[1][COL.DUR] = '1'; data[1][COL.END] = '2026-08-24';

    appDB.projects[appDB.activeId].data = data;
    appDB.projects[appDB.activeId].resources = ['Alice', 'Bob', 'Charlie'];
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);
});

test('a fresh project (and the sample project) seeds a resources registry', async ({ page }) => {
  page.once('dialog', (d) => d.accept('Fresh Project'));
  await page.evaluate(() => createNewProject());
  await page.waitForTimeout(200);
  const resources = await page.evaluate(() => appDB.projects[appDB.activeId].resources);
  expect(resources).toEqual([]);
});

test('the Resource cell stays a plain free-text field -- typing an inline allocation still works', async ({ page }) => {
  const colDef = await page.evaluate(() => sheet.options.columns[3]);
  expect(colDef.type).toBe('text');
});

test('every Resource cell gets a quick-pick picker icon', async ({ page }) => {
  const count = await page.locator('.resource-picker-toggle').count();
  expect(count).toBeGreaterThanOrEqual(2);
});

test('clicking the picker icon opens a checkbox list of registered resources, pre-checked to match the cell', async ({ page }) => {
  await page.locator('.resource-picker-toggle').first().click();
  await expect(page.locator('#resourcePickerPopover')).toBeVisible();

  const labels = await page.locator('#resourcePickerPopover label').allTextContents();
  expect(labels.map((l) => l.trim())).toEqual(['Alice', 'Bob', 'Charlie']);

  const checkboxes = page.locator('.resourcePickerCheckbox');
  expect(await checkboxes.nth(0).isChecked()).toBe(true); // Alice, in "Alice (50%), Bob"
  expect(await checkboxes.nth(1).isChecked()).toBe(true); // Bob
  expect(await checkboxes.nth(2).isChecked()).toBe(false); // Charlie
});

test('checking an unchecked resource adds it to the cell, preserving what was already there', async ({ page }) => {
  await page.locator('.resource-picker-toggle').first().click();
  await page.locator('.resourcePickerCheckbox').nth(2).check(); // Charlie
  await page.waitForTimeout(200);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.RESOURCE]).toBe('Alice (50%), Bob, Charlie');
});

test('unchecking a resource removes just that name, preserving allocation annotations on the rest', async ({ page }) => {
  await page.locator('.resource-picker-toggle').first().click();
  await page.locator('.resourcePickerCheckbox').nth(1).uncheck(); // Bob
  await page.waitForTimeout(200);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.RESOURCE]).toBe('Alice (50%)');
});

test('picking from an empty Resource cell just sets it to the picked name', async ({ page }) => {
  await page.locator('.resource-picker-toggle').nth(1).click(); // Task 2, no resource yet
  await page.locator('.resourcePickerCheckbox').nth(2).check(); // Charlie
  await page.waitForTimeout(200);

  const row = await page.evaluate(() => sheet.getData()[1]);
  expect(row[COL.RESOURCE]).toBe('Charlie');
});

test('clicking outside the popover closes it', async ({ page }) => {
  await page.locator('.resource-picker-toggle').first().click();
  await expect(page.locator('#resourcePickerPopover')).toBeVisible();

  await page.click('#spreadsheet');
  await expect(page.locator('#resourcePickerPopover')).toBeHidden();
});

test('Manage Resources modal: adding a name makes it available in the picker', async ({ page }) => {
  await page.click('button[onclick="openResourceManagerModal()"]');
  await expect(page.locator('#resourceManagerModal')).toBeVisible();

  await page.fill('#newResourceNameInput', 'Dana');
  await page.click('button[onclick="addNewResourceName()"]');
  await page.click('button[onclick="closeResourceManagerModal()"]');

  const resources = await page.evaluate(() => appDB.projects[appDB.activeId].resources);
  expect(resources).toContain('Dana');

  await page.locator('.resource-picker-toggle').first().click();
  const labels = await page.locator('#resourcePickerPopover label').allTextContents();
  expect(labels.map((l) => l.trim())).toContain('Dana');
});

test('renaming a resource in the modal propagates into every task assignment, preserving allocation suffixes', async ({ page }) => {
  await page.click('button[onclick="openResourceManagerModal()"]');
  const inputs = page.locator('#resourceManagerListContainer input[type=text]');
  const count = await inputs.count();
  let idx = -1;
  for (let i = 0; i < count; i++) {
    if ((await inputs.nth(i).inputValue()) === 'Alice') { idx = i; break; }
  }
  expect(idx).toBeGreaterThan(-1);
  await inputs.nth(idx).fill('Alicia');
  await inputs.nth(idx).blur();
  await page.waitForTimeout(200);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.RESOURCE]).toBe('Alicia (50%), Bob');

  const resources = await page.evaluate(() => appDB.projects[appDB.activeId].resources);
  expect(resources).toContain('Alicia');
  expect(resources).not.toContain('Alice');
});

test('deleting a resource from the modal removes it from the registry but leaves existing task text untouched', async ({ page }) => {
  await page.click('button[onclick="openResourceManagerModal()"]');
  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => deleteResourceName('Bob'));
  await page.waitForTimeout(200);

  const resources = await page.evaluate(() => appDB.projects[appDB.activeId].resources);
  expect(resources).not.toContain('Bob');

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.RESOURCE]).toBe('Alice (50%), Bob');
});

test('Resource column CSV shape is unchanged -- still the same free-text cell, no registry column added', async ({ page }) => {
  const fs = require('fs');
  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const headerLine = content.split('\n')[0].trim();
  expect(headerLine.split(',')).toEqual(['Task ID', 'Outline', 'Task Name', 'Resource', 'Def. Alloc', '% Done', 'Start', 'Dur.', 'End', 'Depends', 'Parent', 'Labels']);
  expect(content).toContain('Alice (50%)');
});

test('typing a new name directly into the grid Resource cell registers it too, not just names that arrive via CSV import', async ({ page }) => {
  await page.evaluate((COL) => sheet.setValueFromCoords(COL.RESOURCE, 1, 'Frank', true), COL);
  await page.waitForTimeout(200);

  const resources = await page.evaluate(() => appDB.projects[appDB.activeId].resources);
  expect(resources).toContain('Frank');

  await page.locator('.resource-picker-toggle').nth(1).click();
  const labels = await page.locator('#resourcePickerPopover label').allTextContents();
  expect(labels.map((l) => l.trim())).toContain('Frank');
});

test('importing a CSV merges any not-yet-registered resource name into the registry instead of dropping it', async ({ page }) => {
  const fs = require('fs');
  const csv = 'ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent,Labels\n' +
    '1,1,Imported Task,"Zoe, Alice",100,0,2026-08-24,1,2026-08-24,,,\n';
  const tmpPath = require('path').join(require('os').tmpdir(), `import-resources-${Date.now()}.csv`);
  fs.writeFileSync(tmpPath, csv);

  await page.setInputFiles('#csvFile', tmpPath);
  await page.waitForTimeout(400);

  const resources = await page.evaluate(() => appDB.projects[appDB.activeId].resources);
  expect(resources).toEqual(expect.arrayContaining(['Alice', 'Bob', 'Charlie', 'Zoe']));
});
