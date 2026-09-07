// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #15's responsive-layout half: below the 860px breakpoint,
// the split grid/chart workspace collapses into a single active pane
// (switched by the existing Grid/Split/Chart toolbar buttons) instead of an
// unusably narrow side-by-side split, and toolbar controls grow to
// touch-sized tap targets.

test.use({ viewport: { width: 390, height: 844 } }); // iPhone 12-ish portrait

test('the grid pane fills the screen and the chart pane is hidden by default', async ({ page }) => {
  const workspace = page.locator('.workspace');
  await expect(workspace).toHaveAttribute('data-mobile-pane', 'grid');
  await expect(page.locator('.grid-panel')).toBeVisible();
  await expect(page.locator('.chart-panel')).toBeHidden();

  const gridBox = await page.locator('.grid-panel').boundingBox();
  expect(gridBox.width).toBeGreaterThan(370); // ~full viewport width, minus nothing
});

test('tapping Chart switches to the chart pane, hiding the grid', async ({ page }) => {
  await page.click('button[onclick="snapPanes(8)"]');
  const workspace = page.locator('.workspace');
  await expect(workspace).toHaveAttribute('data-mobile-pane', 'chart');
  await expect(page.locator('.chart-panel')).toBeVisible();
  await expect(page.locator('.grid-panel')).toBeHidden();
});

test('tapping Grid switches back, and the resizer stays hidden throughout', async ({ page }) => {
  await page.click('button[onclick="snapPanes(8)"]');
  await expect(page.locator('.workspace')).toHaveAttribute('data-mobile-pane', 'chart');

  await expect(page.locator('.resizer')).toBeHidden();

  await page.click('button[onclick="snapPanes(92)"]');
  await expect(page.locator('.workspace')).toHaveAttribute('data-mobile-pane', 'grid');
  await expect(page.locator('.grid-panel')).toBeVisible();
  await expect(page.locator('.chart-panel')).toBeHidden();

  await expect(page.locator('.resizer')).toBeHidden();
});

test('toolbar buttons meet a touch-sized minimum height', async ({ page }) => {
  // jumpToToday() lives behind the mobile "More" toggle (see
  // mobile-toolbar-collapse.spec.js), so reveal it before measuring.
  await page.click('#toolbarMoreToggle');
  const startBtn = page.locator('button[onclick="jumpToToday()"]');
  const box = await startBtn.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(40);
});

test('an open modal fills the viewport instead of floating as a centered card', async ({ page }) => {
  // openWorkloadModal() lives behind the mobile "More" toggle (see
  // mobile-toolbar-collapse.spec.js), so reveal it before clicking.
  await page.click('#toolbarMoreToggle');
  await page.click('button[onclick="openWorkloadModal()"]');
  await expect(page.locator('#workloadModal')).toHaveClass(/active/);

  const contentBox = await page.locator('#workloadModal .modal-content').boundingBox();
  expect(contentBox.width).toBeGreaterThan(380);
  expect(contentBox.height).toBeGreaterThan(800);

  await page.click('button[onclick="closeWorkloadModal()"]');
});
