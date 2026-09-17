// @ts-check
const { test, expect } = require('./fixtures');

// User-reported: "When I add multiple resources to the task the toggle to
// add/remove them is now missing." Traced to jexcel's own default cell CSS
// (text-overflow:ellipsis + overflow:hidden on the cell's inline content) --
// once a Resource/Labels value was long enough to overflow the column's
// current width, the picker toggle appended right after the text in the DOM
// got silently clipped off-screen along with it, not just visually truncated.
// Fixed by pinning the toggle absolutely to the cell's right edge (the cell
// is now position:relative) and giving the text its own truncating span
// (.resource-cell-text/.label-cell-text) with right padding reserved for the
// icon -- the toggle is now always visible regardless of text length, and
// only the text itself ellipsizes.

test('resource picker toggle stays visible (in the DOM box) even with a long, multi-name Resource value', async ({ page }) => {
  await page.evaluate(() => {
    sheet.setValueFromCoords(3, 0, 'Adam Beltz, Rob Williams, Nancy Howard, Someone Else Entirely', true);
  });
  await page.waitForTimeout(300);

  const toggle = page.locator('.resource-picker-toggle').first();
  await expect(toggle).toBeVisible();
  const box = await toggle.boundingBox();
  expect(box).not.toBeNull();

  // The cell itself (looked up the same way the app's own tests already do,
  // via sheet.records[y][c]) -- the toggle's bounding box must fall within
  // it (not clipped/pushed outside), which is exactly what was broken before.
  const cellBox = await page.evaluate(() => sheet.records[0][3].getBoundingClientRect());
  expect(box.x).toBeGreaterThanOrEqual(cellBox.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 1);

  await toggle.click();
  await expect(page.locator('#resourcePickerPopover')).toBeVisible();
});

test('label picker toggle stays visible with a long, multi-label value', async ({ page }) => {
  await page.evaluate(() => {
    sheet.setValueFromCoords(11, 0, 'Planning, Design, Development, QA, Launch Readiness', true);
  });
  await page.waitForTimeout(300);

  const toggle = page.locator('.label-picker-toggle').first();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('#labelPickerPopover')).toBeVisible();
});

test('a short Resource value still renders normally, with no visible truncation', async ({ page }) => {
  await page.evaluate(() => sheet.setValueFromCoords(3, 0, 'Alice', true));
  await page.waitForTimeout(300);

  await expect(page.locator('.resource-cell-text').first()).toHaveText('Alice');
  await expect(page.locator('.resource-picker-toggle').first()).toBeVisible();
});

test('truncating the displayed Resource text is purely visual -- sheet.getData() keeps the full value', async ({ page }) => {
  const longValue = 'Adam Beltz, Rob Williams, Nancy Howard, Someone Else Entirely';
  await page.evaluate((v) => sheet.setValueFromCoords(3, 0, v, true), longValue);
  await page.waitForTimeout(300);

  const stored = await page.evaluate(() => sheet.getData()[0][3]);
  expect(stored).toBe(longValue);

  const displayedText = await page.evaluate(() => sheet.records[0][3].querySelector('.resource-cell-text').textContent);
  expect(displayedText).toBe(longValue); // ellipsis is CSS-only; the text node itself is untruncated
});
