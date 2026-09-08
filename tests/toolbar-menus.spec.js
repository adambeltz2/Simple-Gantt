// @ts-check
const { test, expect } = require('./fixtures');

// Covers the remaining, previously-undone recommendations from backlog #17
// ("Toolbar visual review"), whose first cut (the Export ▾ menu) shipped
// earlier: Zoom/Weekends off/Critical path/Label in chart now live behind
// one "View ▾" menu, and the rarely-touched Fit columns/Sync Dependencies
// live behind a "Tools ▾" menu -- same anchored-popover pattern Export ▾
// already established, at desktop width where nothing is mobile-collapsed.

test('View options menu is closed by default and opens on click, revealing Zoom/Weekends/Critical path/Label in chart', async ({ page }) => {
  await expect(page.locator('#viewOptionsDropdown')).toBeHidden();
  await expect(page.locator('#zoomScale')).toBeHidden();

  await page.click('#viewOptionsBtn');
  await expect(page.locator('#viewOptionsDropdown')).toBeVisible();
  await expect(page.locator('#zoomScale')).toBeVisible();
  await expect(page.locator('#skipWeekends')).toBeVisible();
  await expect(page.locator('#showCriticalPath')).toBeVisible();
  await expect(page.locator('#applyLabelToChart')).toBeVisible();
});

test('clicking outside the View options menu closes it', async ({ page }) => {
  await page.click('#viewOptionsBtn');
  await expect(page.locator('#viewOptionsDropdown')).toBeVisible();

  await page.click('.grid-panel');
  await expect(page.locator('#viewOptionsDropdown')).toBeHidden();
});

test('View options menu stays open after changing a setting inside it (unlike Export\'s one-shot menu)', async ({ page }) => {
  await page.click('#viewOptionsBtn');
  await page.check('#skipWeekends');
  await expect(page.locator('#viewOptionsDropdown')).toBeVisible();
});

test('changing Zoom inside the View options menu still works', async ({ page }) => {
  await page.click('#viewOptionsBtn');
  await page.selectOption('#zoomScale', 'Week');
  await expect(page.locator('#zoomScale')).toHaveValue('Week');
});

test('Tools menu is closed by default and opens on click, revealing Fit columns and Sync Dependencies', async ({ page }) => {
  await expect(page.locator('#toolsMenuDropdown')).toBeHidden();

  await page.click('#toolsMenuBtn');
  await expect(page.locator('#toolsMenuDropdown')).toBeVisible();
  await expect(page.locator('button[onclick="autoFitColumns()"]')).toBeVisible();
  await expect(page.locator('button[onclick="syncDependencies()"]')).toBeVisible();
});

test('clicking outside the Tools menu closes it', async ({ page }) => {
  await page.click('#toolsMenuBtn');
  await expect(page.locator('#toolsMenuDropdown')).toBeVisible();

  await page.click('.grid-panel');
  await expect(page.locator('#toolsMenuDropdown')).toBeHidden();
});

test('the Tools menu closes itself once one of its own actions is clicked, unlike View options', async ({ page }) => {
  await page.click('#toolsMenuBtn');
  await page.click('button[onclick="autoFitColumns()"]');
  await expect(page.locator('#toolsMenuDropdown')).toBeHidden();
});

test('Sync Dependencies from inside the Tools menu still recalculates and reports success', async ({ page }) => {
  await page.click('#toolsMenuBtn');
  await page.click('button[onclick="syncDependencies()"]');
  await page.waitForTimeout(300);
  await expect(page.locator('#saveStatusText')).toHaveText('Dates recalculated');
});

test('Add row keeps its filled/primary styling distinct from the plain toolbar buttons around it', async ({ page }) => {
  const addRowBg = await page.locator('button[onclick="addRow()"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  const undoBg = await page.locator('#btnUndo').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(addRowBg).not.toBe(undoBg);
});
