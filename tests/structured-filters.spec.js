// @ts-check
const { test, expect } = require('@playwright/test');

// Covers backlog #20: structured, per-column filters for Resource, % Done,
// Start, and End -- distinct from the free-text Grid Search and the Label
// filter (which already exist). All four live behind one "Filters" toolbar
// dropdown: Resource and % Done are checkbox multi-selects (OR within a
// field, same semantics the Label filter already uses), Start/End are each
// an optional From/To date range. Every filter type composes with every
// other (AND across types), with Search, with Labels, and with Collapse the
// same way Search and Labels already compose with each other -- a matched
// row's ancestors stay visible for outline context, and a manual collapse
// always wins regardless of what matches underneath it. View-only: never
// mutates task data, CSV export, or the Gantt chart.

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
    data[1][COL.PARENT] = '1';

    data[2] = Array(12).fill('');
    data[2][COL.ID] = '3'; data[2][COL.OUTLINE] = '1.2'; data[2][COL.NAME] = 'Build Feature X';
    data[2][COL.RESOURCE] = 'Bob'; data[2][COL.ALLOC] = '100'; data[2][COL.PCT] = '50';
    data[2][COL.START] = '2026-08-26'; data[2][COL.DUR] = '3'; data[2][COL.END] = '2026-08-28';
    data[2][COL.PARENT] = '1';

    data[3] = Array(12).fill('');
    data[3][COL.ID] = '4'; data[3][COL.OUTLINE] = '1.3'; data[3][COL.NAME] = 'Ship Release';
    data[3][COL.RESOURCE] = 'Charlie'; data[3][COL.ALLOC] = '100'; data[3][COL.PCT] = '100';
    data[3][COL.START] = '2026-09-02'; data[3][COL.DUR] = '1'; data[3][COL.END] = '2026-09-02';
    data[3][COL.PARENT] = '1';

    appDB.projects[appDB.activeId].data = data;
    appDB.projects[appDB.activeId].resources = ['Alice', 'Bob', 'Charlie'];
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);
});

function visibleRowCount(page) {
  return page.evaluate(() => sheet.rows.filter((r) => r.style.display !== 'none').length);
}

async function openFilters(page) {
  const dropdown = page.locator('#filtersDropdown');
  if (!(await dropdown.isVisible())) await page.click('#filtersBtn');
}

async function setResourceChecked(page, name, checked) {
  await openFilters(page);
  const checkbox = page.locator(`.resourceFilterCheckbox[value="${name}"]`);
  if (checked) await checkbox.check(); else await checkbox.uncheck();
  await page.waitForTimeout(200);
}

async function setPctChecked(page, bucket, checked) {
  await openFilters(page);
  const checkbox = page.locator(`.pctFilterCheckbox[value="${bucket}"]`);
  if (checked) await checkbox.check(); else await checkbox.uncheck();
  await page.waitForTimeout(200);
}

async function setDateRange(page, field, from, to) {
  await openFilters(page);
  if (from !== undefined) await page.fill(`#${field}FilterFrom`, from);
  if (to !== undefined) await page.fill(`#${field}FilterTo`, to);
  await page.waitForTimeout(200);
}

function filtersBadgeText(page) {
  return page.evaluate(() => document.getElementById('filtersBadge').textContent);
}

test('the Filters dropdown lists every registered resource', async ({ page }) => {
  await openFilters(page);
  const values = await page.locator('.resourceFilterCheckbox').evaluateAll((els) => els.map((e) => e.value));
  expect(values).toEqual(['Alice', 'Bob', 'Charlie']);
});

test('checking one resource filters the grid to matching rows plus ancestors', async ({ page }) => {
  await setResourceChecked(page, 'Alice', true);

  expect(await visibleRowCount(page)).toBe(2); // Parent Project + Kickoff Meeting
  expect(await page.evaluate(() => sheet.rows[2].style.display)).toBe('none');
  expect(await filtersBadgeText(page)).toBe('1');
});

test('checking multiple resources matches ANY of them (OR, not AND)', async ({ page }) => {
  await setResourceChecked(page, 'Alice', true);
  await setResourceChecked(page, 'Bob', true);

  expect(await visibleRowCount(page)).toBe(3); // Parent + Kickoff + Build
  expect(await page.evaluate(() => sheet.rows[3].style.display)).toBe('none'); // Ship Release excluded
});

test('unchecking every resource restores full visibility', async ({ page }) => {
  await setResourceChecked(page, 'Bob', true);
  expect(await visibleRowCount(page)).toBe(2);

  await setResourceChecked(page, 'Bob', false);
  expect(await visibleRowCount(page)).toBe(4);
  expect(await filtersBadgeText(page)).toBe('');
});

test('% Done buckets classify Not started / In progress / Complete correctly', async ({ page }) => {
  await setPctChecked(page, 'none', true);
  expect(await visibleRowCount(page)).toBe(2); // Parent + Kickoff (0%)

  await setPctChecked(page, 'none', false);
  await setPctChecked(page, 'partial', true);
  expect(await visibleRowCount(page)).toBe(2); // Parent + Build Feature X (50%)

  await setPctChecked(page, 'partial', false);
  await setPctChecked(page, 'done', true);
  expect(await visibleRowCount(page)).toBe(2); // Parent + Ship Release (100%)
});

test('checking multiple % Done buckets matches ANY of them', async ({ page }) => {
  await setPctChecked(page, 'none', true);
  await setPctChecked(page, 'done', true);

  expect(await visibleRowCount(page)).toBe(3); // Parent + Kickoff (0%) + Ship Release (100%)
  expect(await page.evaluate(() => sheet.rows[2].style.display)).toBe('none'); // Build Feature X (50%) excluded
});

test('a Start date range keeps only rows whose Start falls within it', async ({ page }) => {
  await setDateRange(page, 'start', '2026-08-25', '2026-08-31');

  expect(await visibleRowCount(page)).toBe(2); // Parent + Build Feature X (Start 08-26)
  expect(await page.evaluate(() => sheet.rows[1].style.display)).toBe('none'); // Kickoff (08-24) excluded
  expect(await page.evaluate(() => sheet.rows[3].style.display)).toBe('none'); // Ship Release (09-02) excluded
});

test('an End date range with only a From bound is open-ended on the To side', async ({ page }) => {
  await setDateRange(page, 'end', '2026-08-28', undefined);

  expect(await visibleRowCount(page)).toBe(3); // Parent + Build Feature X (08-28) + Ship Release (09-02)
  expect(await page.evaluate(() => sheet.rows[1].style.display)).toBe('none'); // Kickoff (08-24) excluded
});

test('clearing a date range restores full visibility', async ({ page }) => {
  await setDateRange(page, 'start', '2026-08-25', '2026-08-31');
  expect(await visibleRowCount(page)).toBe(2);

  await setDateRange(page, 'start', '', '');
  expect(await visibleRowCount(page)).toBe(4);
  expect(await filtersBadgeText(page)).toBe('');
});

test('Resource, % Done, and date filters compose together via AND', async ({ page }) => {
  await setResourceChecked(page, 'Bob', true);
  await setPctChecked(page, 'partial', true);
  await setDateRange(page, 'start', '2026-08-25', '2026-08-31');

  // Only Build Feature X (Bob, 50%, Start 08-26) satisfies all three.
  expect(await visibleRowCount(page)).toBe(2); // Parent + Build Feature X
  expect(await filtersBadgeText(page)).toBe('3');
});

test('structured filters compose with the existing Label filter and Grid Search via AND', async ({ page }) => {
  await setResourceChecked(page, 'Alice', true);
  await page.fill('#gridSearchInput', 'Kickoff');
  await page.waitForTimeout(200);

  expect(await visibleRowCount(page)).toBe(2); // Parent + Kickoff Meeting

  await page.fill('#gridSearchInput', 'Build');
  await page.waitForTimeout(200);
  expect(await visibleRowCount(page)).toBe(1); // Parent only -- Alice AND "Build" match nothing together
});

test('a structured filter composes with a manual collapse via AND', async ({ page }) => {
  await page.evaluate(() => { toggleCollapse('1'); });
  await page.waitForTimeout(200);

  await setResourceChecked(page, 'Alice', true);

  const kickoffHidden = await page.evaluate(() => sheet.rows[1].style.display);
  expect(kickoffHidden).toBe('none'); // collapse still wins even though Kickoff matches
});

test('"Clear filters" resets Resource, % Done, and both date ranges at once', async ({ page }) => {
  await setResourceChecked(page, 'Alice', true);
  await setPctChecked(page, 'none', true);
  await setDateRange(page, 'end', '2026-08-01', '2026-08-25');
  expect(await visibleRowCount(page)).toBeLessThan(4);

  await openFilters(page);
  await page.click('#filtersDropdown a');
  await page.waitForTimeout(200);

  expect(await visibleRowCount(page)).toBe(4);
  expect(await filtersBadgeText(page)).toBe('');
  const anyResourceChecked = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.resourceFilterCheckbox')).some((cb) => cb.checked)
  );
  expect(anyResourceChecked).toBe(false);
});

test('clicking outside the Filters dropdown closes it', async ({ page }) => {
  await page.click('#filtersBtn');
  await expect(page.locator('#filtersDropdown')).toBeVisible();

  await page.click('#spreadsheet');
  await expect(page.locator('#filtersDropdown')).toBeHidden();
});

test('switching projects resets all structured filters', async ({ page }) => {
  await setResourceChecked(page, 'Alice', true);
  await setPctChecked(page, 'done', true);

  page.once('dialog', (d) => d.accept('Another Project'));
  await page.evaluate(() => { createNewProject(); });
  await page.waitForTimeout(300);

  expect(await filtersBadgeText(page)).toBe('');
  const anyChecked = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.resourceFilterCheckbox, .pctFilterCheckbox')).some((cb) => cb.checked)
  );
  expect(anyChecked).toBe(false);
});

test('structured filters never touch the Gantt chart', async ({ page }) => {
  const before = await page.locator('.gantt .bar-wrapper').count();

  await setResourceChecked(page, 'Alice', true);
  await setPctChecked(page, 'done', true);
  await page.waitForTimeout(300);

  const after = await page.locator('.gantt .bar-wrapper').count();
  expect(after).toBe(before);
});

test('structured filters never mutate the underlying task data', async ({ page }) => {
  await setResourceChecked(page, 'Alice', true);
  await setDateRange(page, 'start', '2026-08-25', '2026-08-31');

  const data = await page.evaluate(() => sheet.getData());
  expect(data.length).toBe(4);
  expect(data[2][COL.NAME]).toBe('Build Feature X');
});

test('no uncaught JS errors while using the structured filters', async ({ page }) => {
  await setResourceChecked(page, 'Alice', true);
  await setPctChecked(page, 'partial', true);
  await setDateRange(page, 'start', '2026-08-01', '2026-09-05');
  await setDateRange(page, 'end', '2026-08-01', '2026-09-05');
  await page.waitForTimeout(200);
  await openFilters(page);
  await page.click('#filtersDropdown a');
  await page.waitForTimeout(200);

  expect(page.consoleErrors).toEqual([]);
});
