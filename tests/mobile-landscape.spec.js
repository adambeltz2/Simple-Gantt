// @ts-check
const { test, expect } = require('./fixtures');

// Covers a follow-up to backlog #15's mobile responsiveness work: portrait
// phones are too narrow for a usable side-by-side split, so they only ever
// show one full-width pane at a time (tests/mobile-responsive.spec.js).
// Landscape has real width to spare even under the same 860px breakpoint (a
// rotated phone is often 700-860px wide), so it keeps the desktop-style
// resizable two-pane split instead of being locked into single-pane mode --
// with the divider itself made touch-draggable, since mousedown/mousemove
// aren't reliably synthesized from touch gestures on mobile browsers.

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true }); // iPhone 12-ish landscape

test('in landscape, both panes stay visible side by side instead of collapsing to one', async ({ page }) => {
  await expect(page.locator('.grid-panel')).toBeVisible();
  await expect(page.locator('.chart-panel')).toBeVisible();
  await expect(page.locator('.resizer')).toBeVisible();

  const gridBox = await page.locator('.grid-panel').boundingBox();
  const chartBox = await page.locator('.chart-panel').boundingBox();
  expect(gridBox.width).toBeLessThan(800); // not forced to full viewport width
  expect(chartBox.width).toBeGreaterThan(50); // genuinely showing alongside the grid
});

test('Grid/Split/Chart buttons resize the split instead of hiding a pane outright', async ({ page }) => {
  await page.click('button[onclick="snapPanes(8)"]'); // "Chart" button
  await expect(page.locator('.grid-panel')).toBeVisible(); // still in the DOM and visible, just narrow
  const gridBox = await page.locator('.grid-panel').boundingBox();
  expect(gridBox.width).toBeLessThan(150); // squeezed down, not display:none

  await page.click('button[onclick="snapPanes(92)"]'); // "Grid" button
  await expect(page.locator('.chart-panel')).toBeVisible();
  const chartBox = await page.locator('.chart-panel').boundingBox();
  expect(chartBox.width).toBeLessThan(150);
});

test('the divider is widened for an easier touch target than the desktop hairline', async ({ page }) => {
  const width = await page.locator('.resizer').evaluate((el) => getComputedStyle(el).width);
  expect(parseFloat(width)).toBeGreaterThanOrEqual(16);
});

test('dragging the divider by touch resizes the panes and persists the new width', async ({ page }) => {
  const before = await page.locator('.grid-panel').boundingBox();

  // Dispatch real Touch/TouchEvent objects at the divider -- Playwright has no
  // built-in touch-drag helper, so this exercises the actual touchstart/
  // touchmove/touchend listeners the same way a finger drag would.
  await page.locator('.resizer').evaluate((divider) => {
    const fire = (type, clientX) => {
      const touch = new Touch({ identifier: 1, target: divider, clientX, clientY: 100 });
      divider.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
    };
    fire('touchstart', 422);
    fire('touchmove', 250); // drag left, toward the grid pane shrinking
    fire('touchend', 250);
  });
  await page.waitForTimeout(150);

  const after = await page.locator('.grid-panel').boundingBox();
  expect(after.width).toBeLessThan(before.width);

  const saved = await page.evaluate(() => localStorage.getItem('simple_gantt_pane_width'));
  const currentWidth = await page.evaluate(() => document.getElementById('gridPanel').style.width);
  expect(saved).toBe(currentWidth);
});

test('no console errors while touch-dragging the divider', async ({ page }) => {
  await page.locator('.resizer').evaluate((divider) => {
    const fire = (type, clientX) => {
      const touch = new Touch({ identifier: 1, target: divider, clientX, clientY: 100 });
      divider.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
    };
    fire('touchstart', 400);
    fire('touchmove', 500);
    fire('touchmove', 600);
    fire('touchend', 600);
  });
  await page.waitForTimeout(150);
});
