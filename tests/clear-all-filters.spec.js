// @ts-check
const { test, expect } = require('./fixtures');

// Covers the header's global "Clear filters" button -- a single click that
// resets Grid Search, the Label filter, and the structured Filters dropdown
// (Resource/% Done/Start/End) all at once, instead of clearing each of the
// three mechanisms individually. The button itself stays disabled whenever
// none of the three has anything active.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11 };

test.beforeEach(async ({ page }) => {
  await page.evaluate((COL) => {
    const data = [];
    data[0] = Array(12).fill('');
    data[0][COL.ID] = '1'; data[0][COL.OUTLINE] = '1'; data[0][COL.NAME] = 'Parent Project';

    data[1] = Array(12).fill('');
    data[1][COL.ID] = '2'; data[1][COL.OUTLINE] = '1.1'; data[1][COL.NAME] = 'Kickoff Meeting';
    data[1][COL.RESOURCE] = 'Alice'; data[1][COL.ALLOC] = '100'; data[1][COL.PCT] = '0';
    data[1][COL.START] = '2026-08-24'; data[1][COL.DUR] = '1'; data[1][COL.END] = '2026-08-24';
    data[1][COL.PARENT] = '1'; data[1][COL.LABELS] = 'Design';

    data[2] = Array(12).fill('');
    data[2][COL.ID] = '3'; data[2][COL.OUTLINE] = '1.2'; data[2][COL.NAME] = 'Build Feature X';
    data[2][COL.RESOURCE] = 'Bob'; data[2][COL.ALLOC] = '100'; data[2][COL.PCT] = '50';
    data[2][COL.START] = '2026-08-26'; data[2][COL.DUR] = '3'; data[2][COL.END] = '2026-08-28';
    data[2][COL.PARENT] = '1';

    appDB.projects[appDB.activeId].data = data;
    appDB.projects[appDB.activeId].resources = ['Alice', 'Bob'];
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);
});

function visibleRowCount(page) {
  return page.evaluate(() => sheet.rows.filter((r) => r.style.display !== 'none').length);
}

test('the Clear filters button starts disabled when nothing is active', async ({ page }) => {
  expect(await page.isDisabled('#clearAllFiltersBtn')).toBe(true);
});

test('typing a Search query enables the button; clicking it clears Search', async ({ page }) => {
  await page.fill('#gridSearchInput', 'Kickoff');
  await page.waitForTimeout(200);
  expect(await page.isDisabled('#clearAllFiltersBtn')).toBe(false);
  expect(await visibleRowCount(page)).toBe(2);

  await page.click('#clearAllFiltersBtn');
  await page.waitForTimeout(200);

  expect(await page.inputValue('#gridSearchInput')).toBe('');
  expect(await visibleRowCount(page)).toBe(3);
  expect(await page.isDisabled('#clearAllFiltersBtn')).toBe(true);
});

test('checking a Label enables the button; clicking it clears the Label filter', async ({ page }) => {
  await page.click('#labelFilterBtn');
  await page.locator('.labelFilterCheckbox[value="Design"]').check();
  await page.waitForTimeout(200);
  expect(await page.isDisabled('#clearAllFiltersBtn')).toBe(false);
  expect(await visibleRowCount(page)).toBe(2);

  await page.click('#clearAllFiltersBtn');
  await page.waitForTimeout(200);

  expect(await page.textContent('#labelFilterBtnText')).toBe('All Labels');
  expect(await visibleRowCount(page)).toBe(3);
  expect(await page.isDisabled('#clearAllFiltersBtn')).toBe(true);
});

test('a structured filter enables the button; clicking it clears Resource/%%/date filters', async ({ page }) => {
  await page.click('#filtersBtn');
  await page.locator('.resourceFilterCheckbox[value="Alice"]').check();
  await page.waitForTimeout(200);
  expect(await page.isDisabled('#clearAllFiltersBtn')).toBe(false);
  expect(await visibleRowCount(page)).toBe(2);

  await page.click('#clearAllFiltersBtn');
  await page.waitForTimeout(200);

  expect(await page.textContent('#filtersBadge')).toBe('');
  expect(await visibleRowCount(page)).toBe(3);
  expect(await page.isDisabled('#clearAllFiltersBtn')).toBe(true);
});

test('one click clears Search, Labels, and structured Filters together', async ({ page }) => {
  await page.fill('#gridSearchInput', 'Kickoff');
  await page.click('#labelFilterBtn');
  await page.locator('.labelFilterCheckbox[value="Design"]').check();
  await page.click('#filtersBtn');
  await page.locator('.pctFilterCheckbox[value="none"]').check();
  await page.waitForTimeout(200);
  expect(await visibleRowCount(page)).toBe(2);

  await page.click('#clearAllFiltersBtn');
  await page.waitForTimeout(200);

  expect(await page.inputValue('#gridSearchInput')).toBe('');
  expect(await page.textContent('#labelFilterBtnText')).toBe('All Labels');
  expect(await page.textContent('#filtersBadge')).toBe('');
  expect(await visibleRowCount(page)).toBe(3);
});
