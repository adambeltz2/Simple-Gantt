// @ts-check
const { test, expect } = require('./fixtures');

// Covers a second mobile follow-up to backlog #15: even with the portrait/
// landscape split (mobile-responsive.spec.js / mobile-landscape.spec.js),
// the full toolbar still spilled across 5-6 rows on a phone -- every button
// shown at once. Below the 860px breakpoint, only the most-used controls
// (Search, Grid/Split/Chart, Undo/Redo, Add row) stay visible by default;
// everything else collapses behind a "More" toggle. Same DOM elements
// either way (display:none vs. display:contents), nothing duplicated, and
// desktop is completely unaffected -- see .tb-mobile-collapsible.

test.use({ viewport: { width: 390, height: 844 } }); // iPhone 12-ish portrait

test('secondary toolbar controls are hidden by default on mobile', async ({ page }) => {
  await expect(page.locator('button[onclick="jumpToToday()"]')).toBeHidden();
  await expect(page.locator('button[onclick="openBulkEditModal()"]')).toBeHidden();
  await expect(page.locator('#btnDbxSave')).toBeHidden();
  await expect(page.locator('#viewOptionsBtn')).toBeHidden();
});

test('the essential controls stay visible by default on mobile', async ({ page }) => {
  await expect(page.locator('#gridSearchInput')).toBeVisible();
  await expect(page.locator('button[onclick="snapPanes(92)"]')).toBeVisible();
  await expect(page.locator('button[onclick="snapPanes(55)"]')).toBeVisible();
  await expect(page.locator('button[onclick="snapPanes(8)"]')).toBeVisible();
  await expect(page.locator('#btnUndo')).toBeVisible();
  await expect(page.locator('#btnRedo')).toBeVisible();
  await expect(page.locator('button[onclick="addRow()"]')).toBeVisible();
  await expect(page.locator('#toolbarMoreToggle')).toBeVisible();
});

test('tapping "More" reveals the secondary controls, and the label flips to "Less"', async ({ page }) => {
  await page.click('#toolbarMoreToggle');
  await expect(page.locator('#toolbarMoreToggleText')).toHaveText('Less');
  await expect(page.locator('#toolbarMoreToggle')).toHaveAttribute('aria-expanded', 'true');

  await expect(page.locator('button[onclick="jumpToToday()"]')).toBeVisible();
  await expect(page.locator('button[onclick="openBulkEditModal()"]')).toBeVisible();
  await expect(page.locator('#btnDbxSave')).toBeVisible();
  await expect(page.locator('#viewOptionsBtn')).toBeVisible();
});

test('tapping "More" again collapses it back, and the label flips back to "More"', async ({ page }) => {
  await page.click('#toolbarMoreToggle');
  await expect(page.locator('button[onclick="jumpToToday()"]')).toBeVisible();

  await page.click('#toolbarMoreToggle');
  await expect(page.locator('#toolbarMoreToggleText')).toHaveText('More');
  await expect(page.locator('#toolbarMoreToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('button[onclick="jumpToToday()"]')).toBeHidden();
});

test('a revealed secondary control is still fully functional', async ({ page }) => {
  await page.click('#toolbarMoreToggle');
  await page.click('button[onclick="collapseAllTasks()"]');
  await page.click('button[onclick="expandAllTasks()"]');
  // No assertion beyond "didn't throw" -- fixtures.js already asserts zero
  // console errors after every test, which is the real regression check
  // here (a display:contents wrapper breaking an onclick handler would
  // surface as a JS error, not a silent no-op).
});

test('on desktop-width viewports the More toggle is hidden and nothing is collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('#toolbarMoreToggle')).toBeHidden();
  await expect(page.locator('button[onclick="jumpToToday()"]')).toBeVisible();
  await expect(page.locator('#viewOptionsBtn')).toBeVisible();
});
