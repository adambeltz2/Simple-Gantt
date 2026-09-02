// @ts-check
const { test, expect } = require('@playwright/test');

// Covers backlog #17's first cut, "Export ▾" menu: Import CSV / Export CSV /
// Export PNG / Export PDF are grouped behind one anchored-popover dropdown
// (same open/close pattern as the existing label filter dropdown) instead of
// four always-visible toolbar buttons. The action buttons themselves keep
// their original onclick="exportCSV()" etc. handlers unchanged -- a separate
// delegated listener on the dropdown closes it after any action fires.

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
});

test('the four export/import actions are not top-level toolbar buttons', async ({ page }) => {
  await expect(page.locator('.toolbar button[onclick="exportCSV()"]')).toHaveCount(1);
  await expect(page.locator('.toolbar button[onclick="exportCSV()"]')).toBeHidden();
  await expect(page.locator('.toolbar button[onclick="exportImage()"]')).toBeHidden();
  await expect(page.locator('.toolbar button[onclick="exportPDF()"]')).toBeHidden();
  await expect(page.locator('#csvFile')).toBeAttached();
});

test('clicking the Export button opens a menu listing Import CSV / Export CSV / Export PNG / Export PDF', async ({ page }) => {
  await expect(page.locator('#exportMenuDropdown')).toBeHidden();
  await page.click('#exportMenuBtn');
  await expect(page.locator('#exportMenuDropdown')).toBeVisible();

  await expect(page.locator('#exportMenuDropdown button[onclick="exportCSV()"]')).toBeVisible();
  await expect(page.locator('#exportMenuDropdown button[onclick="exportImage()"]')).toBeVisible();
  await expect(page.locator('#exportMenuDropdown button[onclick="exportPDF()"]')).toBeVisible();
  await expect(page.locator('#exportMenuDropdown label.file-btn')).toBeVisible();
});

test('clicking the Export button again closes the menu', async ({ page }) => {
  await page.click('#exportMenuBtn');
  await expect(page.locator('#exportMenuDropdown')).toBeVisible();
  await page.click('#exportMenuBtn');
  await expect(page.locator('#exportMenuDropdown')).toBeHidden();
});

test('clicking outside the open menu closes it', async ({ page }) => {
  await page.click('#exportMenuBtn');
  await expect(page.locator('#exportMenuDropdown')).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(page.locator('#exportMenuDropdown')).toBeHidden();
});

test('choosing Export CSV downloads a file and closes the menu', async ({ page }) => {
  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  await expect(page.locator('#exportMenuDropdown')).toBeHidden();
});

test('no uncaught JS errors while opening, closing, and using the export menu', async ({ page }) => {
  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  expect(download).toBeTruthy();
  await page.click('#exportMenuBtn');
  await page.click('#exportMenuBtn');
  expect(page.consoleErrors).toEqual([]);
});
