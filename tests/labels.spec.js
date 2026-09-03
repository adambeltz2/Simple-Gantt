// @ts-check
const { test, expect } = require('@playwright/test');

// Covers backlog #13, Label functionality on a row (Msft Planner style): a
// row can carry many labels or none (free-text, accepts ',' or ';' as a
// separator -- same splitMultiValueCell() convention Resource uses), labels
// show as their own column in the grid, and the toolbar's label filter is a
// checkbox multi-select (not a single-select dropdown): checking one or more
// labels narrows the grid to tasks carrying ANY of them (OR, not AND), same
// ancestor-visibility behavior as grid search, and applying that same filter
// to the Gantt chart is opt-in via the "Label in chart" toggle -- off by
// default, so the chart still shows the whole plan unless someone
// deliberately isolates those labels there.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);

  await page.evaluate((COL) => {
    const data = [];
    data[0] = Array(12).fill('');
    data[0][COL.ID] = '1'; data[0][COL.OUTLINE] = '1'; data[0][COL.NAME] = 'Parent Project';

    data[1] = Array(12).fill('');
    data[1][COL.ID] = '2'; data[1][COL.OUTLINE] = '1.1'; data[1][COL.NAME] = 'Kickoff Meeting';
    data[1][COL.RESOURCE] = 'Alice'; data[1][COL.ALLOC] = '100'; data[1][COL.PCT] = '0';
    data[1][COL.START] = '2026-08-24'; data[1][COL.DUR] = '1'; data[1][COL.END] = '2026-08-24';
    data[1][COL.PARENT] = '1'; data[1][COL.LABELS] = 'System A;Urgent';

    data[2] = Array(12).fill('');
    data[2][COL.ID] = '3'; data[2][COL.OUTLINE] = '1.2'; data[2][COL.NAME] = 'Build Feature X';
    data[2][COL.RESOURCE] = 'Bob'; data[2][COL.ALLOC] = '100'; data[2][COL.PCT] = '0';
    data[2][COL.START] = '2026-08-24'; data[2][COL.DUR] = '1'; data[2][COL.END] = '2026-08-24';
    data[2][COL.PARENT] = '1'; data[2][COL.LABELS] = 'System B';

    data[3] = Array(12).fill('');
    data[3][COL.ID] = '4'; data[3][COL.OUTLINE] = '1.3'; data[3][COL.NAME] = 'Ship Release';
    data[3][COL.RESOURCE] = 'Charlie'; data[3][COL.ALLOC] = '100'; data[3][COL.PCT] = '0';
    data[3][COL.START] = '2026-08-24'; data[3][COL.DUR] = '1'; data[3][COL.END] = '2026-08-24';
    data[3][COL.PARENT] = '1'; // no label

    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);
});

function visibleRowCount(page) {
  return page.evaluate(() => sheet.rows.filter((r) => r.style.display !== 'none').length);
}

// Opens the label filter dropdown (if not already open) and checks/unchecks
// one label's checkbox by its value.
async function setLabelChecked(page, label, checked) {
  const dropdown = page.locator('#labelFilterDropdown');
  if (!(await dropdown.isVisible())) await page.click('#labelFilterBtn');
  const checkbox = page.locator(`.labelFilterCheckbox[value="${label}"]`);
  if (checked) await checkbox.check(); else await checkbox.uncheck();
  await page.waitForTimeout(200);
}

function labelFilterButtonText(page) {
  return page.evaluate(() => document.getElementById('labelFilterBtnText').textContent);
}

test('Labels is its own grid column, positioned right after Parent', async ({ page }) => {
  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers[COL.LABELS]).toBe('Labels');
});

test('a row can carry many labels, one, or none', async ({ page }) => {
  const data = await page.evaluate(() => sheet.getData());
  expect(data[1][COL.LABELS]).toBe('System A;Urgent');
  expect(data[2][COL.LABELS]).toBe('System B');
  expect(data[3][COL.LABELS]).toBe('');
});

test('a comma also separates multiple labels, same as a semicolon', async ({ page }) => {
  await page.evaluate((COL) => {
    const data = sheet.getData();
    data[2][COL.LABELS] = 'System B,Urgent';
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  await page.click('#labelFilterBtn');
  const values = await page.locator('.labelFilterCheckbox').evaluateAll((els) => els.map((e) => e.value));
  expect(values.sort()).toEqual(['System A', 'System B', 'Urgent']);
});

test('the label filter dropdown lists every distinct label used, alphabetically', async ({ page }) => {
  await page.click('#labelFilterBtn');
  const values = await page.locator('.labelFilterCheckbox').evaluateAll((els) => els.map((e) => e.value));
  expect(values).toEqual(['System A', 'System B', 'Urgent']);
});

test('the filter button reads "All Labels" when nothing is checked', async ({ page }) => {
  expect(await labelFilterButtonText(page)).toBe('All Labels');
});

test('checking one label filters the grid to matching rows plus their ancestor, and updates the button text', async ({ page }) => {
  await setLabelChecked(page, 'System A', true);

  expect(await visibleRowCount(page)).toBe(2); // Parent Project + Kickoff Meeting
  const buildRowHidden = await page.evaluate(() => sheet.rows[2].style.display);
  expect(buildRowHidden).toBe('none');
  expect(await labelFilterButtonText(page)).toBe('System A');
});

test('checking multiple labels matches rows carrying ANY of them (OR, not AND)', async ({ page }) => {
  await setLabelChecked(page, 'System A', true);
  await setLabelChecked(page, 'System B', true);

  // Kickoff Meeting (System A) + Build Feature X (System B) + their shared parent.
  expect(await visibleRowCount(page)).toBe(3);
  const shipRowHidden = await page.evaluate(() => sheet.rows[3].style.display);
  expect(shipRowHidden).toBe('none'); // Ship Release has no label, still excluded
  expect(await labelFilterButtonText(page)).toBe('2 labels');
});

test('unchecking a label narrows the OR set back down', async ({ page }) => {
  await setLabelChecked(page, 'System A', true);
  await setLabelChecked(page, 'System B', true);
  expect(await visibleRowCount(page)).toBe(3);

  await setLabelChecked(page, 'System B', false);
  expect(await visibleRowCount(page)).toBe(2); // back to just Parent Project + Kickoff Meeting
  expect(await labelFilterButtonText(page)).toBe('System A');
});

test('unchecking every label restores full visibility', async ({ page }) => {
  await setLabelChecked(page, 'System B', true);
  expect(await visibleRowCount(page)).toBe(2); // Parent Project + Build Feature X

  await setLabelChecked(page, 'System B', false);
  expect(await visibleRowCount(page)).toBe(4);
  expect(await labelFilterButtonText(page)).toBe('All Labels');
});

test('a task with no labels is excluded once any label filter is active', async ({ page }) => {
  await setLabelChecked(page, 'System B', true);
  const shipRowHidden = await page.evaluate(() => sheet.rows[3].style.display);
  expect(shipRowHidden).toBe('none');
});

test('by default, checking a label does not change the Gantt chart', async ({ page }) => {
  const before = await page.locator('.gantt .bar-wrapper').count();

  await setLabelChecked(page, 'System A', true);
  await page.waitForTimeout(300);

  const after = await page.locator('.gantt .bar-wrapper').count();
  expect(after).toBe(before);
});

test('"Label in chart" narrows the Gantt chart to the checked label(s)', async ({ page }) => {
  const before = await page.locator('.gantt .bar-wrapper').count();

  await page.check('#applyLabelToChart');
  await setLabelChecked(page, 'System A', true);
  await page.waitForTimeout(300);

  const after = await page.locator('.gantt .bar-wrapper').count();
  expect(after).toBeLessThan(before);
  expect(after).toBe(1); // just "Kickoff Meeting"
});

test('"Label in chart" with two labels checked shows both matching tasks', async ({ page }) => {
  await page.check('#applyLabelToChart');
  await setLabelChecked(page, 'System A', true);
  await setLabelChecked(page, 'System B', true);
  await page.waitForTimeout(300);

  const after = await page.locator('.gantt .bar-wrapper').count();
  expect(after).toBe(2); // Kickoff Meeting + Build Feature X
});

test('turning "Label in chart" back off restores the full chart', async ({ page }) => {
  const before = await page.locator('.gantt .bar-wrapper').count();

  await page.check('#applyLabelToChart');
  await setLabelChecked(page, 'System A', true);
  await page.waitForTimeout(300);

  await page.uncheck('#applyLabelToChart');
  await page.waitForTimeout(300);

  const after = await page.locator('.gantt .bar-wrapper').count();
  expect(after).toBe(before);
});

test('label filter composes with a manual collapse via AND', async ({ page }) => {
  await page.evaluate(() => { toggleCollapse('1'); }); // collapse the parent, hiding both children
  await page.waitForTimeout(200);

  await setLabelChecked(page, 'System A', true);

  // Kickoff Meeting matches the label but its ancestor is collapsed --
  // collapse must still win, same as it does against search.
  const kickoffHidden = await page.evaluate(() => sheet.rows[1].style.display);
  expect(kickoffHidden).toBe('none');
});

test('clicking outside the dropdown closes it', async ({ page }) => {
  await page.click('#labelFilterBtn');
  await expect(page.locator('#labelFilterDropdown')).toBeVisible();

  await page.click('#spreadsheet');
  await expect(page.locator('#labelFilterDropdown')).toBeHidden();
});

test('switching projects resets the label filter', async ({ page }) => {
  await setLabelChecked(page, 'System A', true);

  page.once('dialog', (d) => d.accept('Another Project'));
  await page.evaluate(() => { createNewProject(); });
  await page.waitForTimeout(300);

  expect(await labelFilterButtonText(page)).toBe('All Labels');
  const anyChecked = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.labelFilterCheckbox')).some((cb) => cb.checked)
  );
  expect(anyChecked).toBe(false);
});

test('Labels round-trips through CSV export/import', async ({ page }) => {
  const fs = require('fs');
  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const headerLine = content.split('\n')[0].trim();
  expect(headerLine.split(',')).toContain('Labels');
  expect(content).toContain('System A;Urgent');

  await page.setInputFiles('#csvFile', {
    name: 'export.csv',
    mimeType: 'text/csv',
    buffer: fs.readFileSync(await download.path()),
  });
  await page.waitForTimeout(400);

  const row = await page.evaluate(() => sheet.getData().find((r) => r[0] === '2'));
  expect(row[COL.LABELS]).toBe('System A;Urgent');
});

test('no uncaught JS errors while filtering by label', async ({ page }) => {
  await setLabelChecked(page, 'System A', true);
  await setLabelChecked(page, 'System B', true);
  await page.check('#applyLabelToChart');
  await page.waitForTimeout(200);
  await setLabelChecked(page, 'System A', false);
  await setLabelChecked(page, 'System B', false);
  await page.waitForTimeout(200);

  expect(page.consoleErrors).toEqual([]);
});
