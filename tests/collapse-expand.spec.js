// @ts-check
const { test, expect } = require('@playwright/test');

// Covers the parent/child collapse-expand feature: the toggle on a parent
// row, the Expand All / Collapse All toolbar buttons, and the invariant
// that collapsing is a pure view concern -- it must never remove or alter
// the underlying task data, and it must persist per project across reloads.

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  // let the initial syncToGantt() pass settle
  await page.waitForTimeout(500);
});

function visibleRowCount(page) {
  return page.evaluate(() => sheet.rows.filter((r) => r.style.display !== 'none').length);
}

test('sample project loads with one collapsible parent task', async ({ page }) => {
  const rowCount = await page.evaluate(() => sheet.getData().length);
  expect(rowCount).toBe(5);

  await expect(page.locator('.row-collapse-toggle')).toHaveCount(1);
  await expect(page.locator('.gantt .bar-wrapper')).toHaveCount(5);
});

test('collapsing a parent hides its children without touching task data', async ({ page }) => {
  await page.locator('.row-collapse-toggle').click();
  await page.waitForTimeout(300);

  expect(await visibleRowCount(page)).toBe(1);
  await expect(page.locator('.gantt .bar-wrapper')).toHaveCount(1);

  // Underlying data must be untouched -- same row count, same values.
  const data = await page.evaluate(() => sheet.getData());
  expect(data.length).toBe(5);
  expect(data[0][2]).toBe('Website Redesign Phase');
  expect(data[1][2]).toBe('Discovery & Wireframes');

  const collapsed = await page.evaluate(() => appDB.projects[appDB.activeId].collapsed);
  expect(collapsed).toEqual(['1']);
  await expect(page.locator('.row-collapse-toggle').first()).toHaveText('▶');
});

test('expanding via the same toggle restores full visibility', async ({ page }) => {
  const toggle = page.locator('.row-collapse-toggle').first();
  await toggle.click();
  await page.waitForTimeout(300);
  expect(await visibleRowCount(page)).toBe(1);

  await toggle.click();
  await page.waitForTimeout(300);
  expect(await visibleRowCount(page)).toBe(5);
  await expect(page.locator('.gantt .bar-wrapper')).toHaveCount(5);

  const collapsed = await page.evaluate(() => appDB.projects[appDB.activeId].collapsed);
  expect(collapsed).toEqual([]);
});

test('collapse state persists per project across a reload', async ({ page }) => {
  await page.locator('.row-collapse-toggle').click();
  await page.waitForTimeout(300);

  await page.reload();
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(500);

  const collapsed = await page.evaluate(() => appDB.projects[appDB.activeId].collapsed);
  expect(collapsed).toEqual(['1']);
  expect(await visibleRowCount(page)).toBe(1);
});

test('Collapse All / Expand All toolbar buttons act on every parent task', async ({ page }) => {
  await page.click('button:has-text("Collapse All")');
  await page.waitForTimeout(300);
  expect(await visibleRowCount(page)).toBe(1);

  await page.click('button:has-text("Expand All")');
  await page.waitForTimeout(300);
  expect(await visibleRowCount(page)).toBe(5);
});

test('normal grid editing keeps working with collapse state active', async ({ page }) => {
  await page.locator('.row-collapse-toggle').click();
  await page.waitForTimeout(300);

  await page.evaluate(() => sheet.insertRow());
  await page.waitForTimeout(300);

  const rowCount = await page.evaluate(() => sheet.getData().length);
  expect(rowCount).toBe(6);
});

test('no uncaught JS errors while exercising collapse/expand', async ({ page }) => {
  await page.locator('.row-collapse-toggle').click();
  await page.waitForTimeout(200);
  await page.click('button:has-text("Collapse All")');
  await page.waitForTimeout(200);
  await page.click('button:has-text("Expand All")');
  await page.waitForTimeout(200);

  expect(page.consoleErrors).toEqual([]);
});
