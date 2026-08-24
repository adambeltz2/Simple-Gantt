// @ts-check
const { test, expect } = require('@playwright/test');

// Covers the grid search/filter: matches Task Name and Resource
// case-insensitively, keeps a matched row's ancestor chain visible for
// outline context, composes with collapse via AND (never overrides a
// manual collapse to reveal a match), is purely a display concern (never
// touches task data), and resets when switching projects. Deliberately
// built on the same hideRow/showRow mechanism as collapse rather than
// jexcel's own built-in search(), which manages visibility by detaching
// <tr> elements from the DOM and would fight with it.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const data = [
      ['1', '1', 'Parent Project', '', '', '0', '', '', '', '', ''],
      ['2', '1.1', 'Kickoff Meeting', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', '1'],
      ['3', '1.2', 'Build Feature X', 'Bob', '100', '0', '2026-08-24', '1', '2026-08-24', '', '1'],
      ['4', '1.3', 'Ship Release', 'Charlie', '100', '0', '2026-08-24', '1', '2026-08-24', '', '1'],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  });
  await page.waitForTimeout(300);
});

function visibleRowCount(page) {
  return page.evaluate(() => sheet.rows.filter((r) => r.style.display !== 'none').length);
}

test('matching by Task Name filters to that row plus its ancestor chain', async ({ page }) => {
  await page.fill('#gridSearchInput', 'meeting');
  await page.waitForTimeout(200);

  expect(await visibleRowCount(page)).toBe(2); // Parent Project + Kickoff Meeting
  const hiddenRow3 = await page.evaluate(() => sheet.rows[2].style.display);
  expect(hiddenRow3).toBe('none');
});

test('matching by Resource is case-insensitive', async ({ page }) => {
  await page.fill('#gridSearchInput', 'BOB');
  await page.waitForTimeout(200);

  expect(await visibleRowCount(page)).toBe(2); // Parent Project + Build Feature X
  const buildRowVisible = await page.evaluate(() => sheet.rows[2].style.display !== 'none');
  expect(buildRowVisible).toBe(true);
});

test('no matches hides every row, including the parent', async ({ page }) => {
  await page.fill('#gridSearchInput', 'zzz-nonexistent');
  await page.waitForTimeout(200);

  expect(await visibleRowCount(page)).toBe(0);
});

test('clearing the search via the X button restores all rows', async ({ page }) => {
  await page.fill('#gridSearchInput', 'bob');
  await page.waitForTimeout(200);
  await expect(page.locator('#gridSearchClear')).toBeVisible();

  await page.click('#gridSearchClear');
  await page.waitForTimeout(200);

  expect(await visibleRowCount(page)).toBe(4);
  await expect(page.locator('#gridSearchInput')).toHaveValue('');
  await expect(page.locator('#gridSearchClear')).toBeHidden();
});

test('search never overrides a manual collapse (composes with AND)', async ({ page }) => {
  await page.evaluate(() => toggleCollapse('1')); // collapse the parent
  await page.waitForTimeout(200);
  expect(await visibleRowCount(page)).toBe(1); // only the parent itself

  await page.fill('#gridSearchInput', 'bob'); // matches the now-hidden child
  await page.waitForTimeout(200);

  // Still only the parent visible -- collapse wins, search doesn't reveal it
  expect(await visibleRowCount(page)).toBe(1);
  const buildRowHidden = await page.evaluate(() => sheet.rows[2].style.display);
  expect(buildRowHidden).toBe('none');
});

test('search is purely a display concern -- underlying data is untouched', async ({ page }) => {
  const before = await page.evaluate(() => sheet.getData());
  await page.fill('#gridSearchInput', 'bob');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => sheet.getData());

  expect(after).toEqual(before);
});

test('switching projects resets an active search', async ({ page }) => {
  await page.fill('#gridSearchInput', 'bob');
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    appDB.projects['proj_other'] = { name: 'Other Project', columns: [], data: [['1', '1', 'Solo Task', '', '', '0', '', '', '', '', '']], collapsed: [], flagged: [] };
    updateProjectDropdown();
  });
  await page.selectOption('#projectSelector', 'proj_other');
  await page.waitForTimeout(300);

  await expect(page.locator('#gridSearchInput')).toHaveValue('');
  expect(await visibleRowCount(page)).toBe(1);
});

test('no uncaught JS errors while searching and clearing', async ({ page }) => {
  await page.fill('#gridSearchInput', 'bob');
  await page.waitForTimeout(150);
  await page.click('#gridSearchClear');
  await page.waitForTimeout(150);

  expect(page.consoleErrors).toEqual([]);
});
