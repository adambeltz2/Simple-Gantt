// @ts-check
const { test, expect } = require('./fixtures');

// User-requested: the View options menu (Zoom/Weekends off/Critical path/
// Label in chart) only ever acts on the chart, so it moved out of the
// generic top toolbar and into the chart panel itself, where it's actually
// relevant -- fixing a discoverability gap (the chart's own "Day view" text
// used to be static, with no visible link to the toolbar menu that actually
// controlled it) and keeping chart-only settings with the chart. A "Pop
// out" button alongside it opens the chart -- really, a second independent
// instance of the whole app, defaulted to chart-only view -- in its own
// window, so dragging/hovering/zooming there work exactly like the main
// window's own copy (same code, loaded fresh) rather than a partial DOM
// clone with broken event wiring.

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].columns = [];
    const data = [
      ['1', '1', 'Task A', 'Alice', '100', '50', '2026-08-24', '3', '2026-08-26', '', '', ''],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  });
  await page.waitForTimeout(300);
});

test('the View options button and dropdown live inside the chart panel, not the toolbar', async ({ page }) => {
  const inChartPanel = await page.evaluate(() => !!document.querySelector('.chart-panel #viewOptionsBtn'));
  const inToolbar = await page.evaluate(() => !!document.querySelector('.toolbar #viewOptionsBtn'));
  expect(inChartPanel).toBe(true);
  expect(inToolbar).toBe(false);

  await expect(page.locator('#viewOptionsDropdown')).toBeHidden();
  await page.click('#viewOptionsBtn');
  await expect(page.locator('#viewOptionsDropdown')).toBeVisible();
  await expect(page.locator('#skipWeekends')).toBeVisible();
  await expect(page.locator('#showCriticalPath')).toBeVisible();
});

test('the "Pop out" button also lives in the chart panel, styled as the emphasized action', async ({ page }) => {
  const inChartPanel = await page.evaluate(() => !!document.querySelector('.chart-panel #btnPopoutChart'));
  expect(inChartPanel).toBe(true);
  await expect(page.locator('#btnPopoutChart')).toHaveClass(/tbtn-primary/);
});

// User-requested: Zoom promoted out of the View ▾ menu into its own
// always-visible Day/Week/Month segmented control, matching the existing
// Grid/Split/Chart pattern, so it's obvious without a click -- and the
// option labels read "Day view"/"Week view"/"Month view" rather than
// "Zoom: Day".
test('Zoom is an always-visible Day/Week/Month toggle, not hidden behind View ▾', async ({ page }) => {
  await expect(page.locator('.zoom-btn[data-zoom="Day"]')).toBeVisible();
  await expect(page.locator('.zoom-btn[data-zoom="Week"]')).toBeVisible();
  await expect(page.locator('.zoom-btn[data-zoom="Month"]')).toBeVisible();
  await expect(page.locator('.zoom-btn[data-zoom="Day"]')).toHaveClass(/active/);

  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('#zoomScale option')).map(o => o.textContent));
  expect(labels).toEqual(['Day view', 'Week view', 'Month view']);
});

test('clicking a zoom button changes the zoom level and its own active state', async ({ page }) => {
  await page.click('.zoom-btn[data-zoom="Week"]');
  await expect(page.locator('.zoom-btn[data-zoom="Week"]')).toHaveClass(/active/);
  await expect(page.locator('.zoom-btn[data-zoom="Day"]')).not.toHaveClass(/active/);
  const zoomValue = await page.evaluate(() => document.getElementById('zoomScale').value);
  expect(zoomValue).toBe('Week');
});

test('the range bar shows the current zoom level by name', async ({ page }) => {
  await expect(page.locator('#ganttRangeBar')).toContainText('Day view');

  await page.click('.zoom-btn[data-zoom="Week"]');
  await page.evaluate(() => syncToGantt(true));
  await page.waitForTimeout(200);
  await expect(page.locator('#ganttRangeBar')).toContainText('Week view');
});

test('"Pop out" opens a second window, pre-set to chart-only view, without changing the main window\'s own saved split', async ({ page, context }) => {
  const originalPaneWidth = await page.evaluate(() => localStorage.getItem('simple_gantt_pane_width'));

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.click('#btnPopoutChart'),
  ]);
  await popup.waitForLoadState();
  await popup.waitForTimeout(500);

  const popupGridWidth = await popup.evaluate(() => document.getElementById('gridPanel').style.width);
  expect(popupGridWidth).toBe('8%');

  // The popup is a fully independent instance of the same app -- its own
  // View button, its own chart, same project data via shared localStorage.
  const popupHasChart = await popup.evaluate(() => document.querySelectorAll('.gantt .bar-wrapper').length > 0);
  expect(popupHasChart).toBe(true);
  const popupHasViewBtn = await popup.evaluate(() => !!document.getElementById('viewOptionsBtn'));
  expect(popupHasViewBtn).toBe(true);

  // Popping out must never silently rewrite the main window's own saved
  // pane-width preference for next time it loads.
  const paneWidthAfter = await page.evaluate(() => localStorage.getItem('simple_gantt_pane_width'));
  expect(paneWidthAfter).toBe(originalPaneWidth);
  const mainGridWidth = await page.evaluate(() => document.getElementById('gridPanel').style.width);
  expect(mainGridWidth).not.toBe('8%');

  await popup.close();
});
