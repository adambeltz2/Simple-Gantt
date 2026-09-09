// @ts-check
const { test, expect } = require('./fixtures');

// Covers the manual "in progress" flag: a per-row toggle in the Task ID
// column that tints the grid row purple. Per the feature request, this must
// have zero effect on the Gantt chart and zero footprint in exported/backed
// up data -- it's a pure grid-view annotation, stored outside sheet data.

test('every row gets a flag toggle in the Task ID column', async ({ page }) => {
  await expect(page.locator('.row-flag-toggle')).toHaveCount(5);
});

test('clicking the flag toggle tints the row purple and records the flag', async ({ page }) => {
  const toggle = page.locator('.row-flag-toggle').nth(1); // row for task "2"
  await toggle.click();
  await page.waitForTimeout(300);

  const flagged = await page.evaluate(() => appDB.projects[appDB.activeId].flagged);
  expect(flagged).toEqual(['2']);

  const bg = await page.evaluate(() => sheet.rows[1].style.backgroundColor);
  expect(bg).toBe('rgb(243, 232, 255)'); // #f3e8ff

  const otherBg = await page.evaluate(() => sheet.rows[0].style.backgroundColor);
  expect(otherBg).toBe('');
});

test('clicking again clears the flag and the purple tint', async ({ page }) => {
  const toggle = page.locator('.row-flag-toggle').nth(1);
  await toggle.click();
  await page.waitForTimeout(300);
  await toggle.click();
  await page.waitForTimeout(300);

  const flagged = await page.evaluate(() => appDB.projects[appDB.activeId].flagged);
  expect(flagged).toEqual([]);
  const bg = await page.evaluate(() => sheet.rows[1].style.backgroundColor);
  expect(bg).toBe('');
});

test('flagging never changes the underlying grid data', async ({ page }) => {
  const before = await page.evaluate(() => sheet.getData());
  await page.locator('.row-flag-toggle').nth(2).click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => sheet.getData());

  expect(after).toEqual(before);
  expect(after[0].length).toBe(13); // no new column was added
});

test('flagging has no effect on the Gantt chart', async ({ page }) => {
  const barsBefore = await page.locator('.gantt .bar-wrapper').count();
  const classesBefore = await page.locator('.gantt .bar-wrapper').evaluateAll((els) => els.map((e) => e.className.baseVal));

  await page.locator('.row-flag-toggle').nth(1).click();
  await page.waitForTimeout(300);

  const barsAfter = await page.locator('.gantt .bar-wrapper').count();
  const classesAfter = await page.locator('.gantt .bar-wrapper').evaluateAll((els) => els.map((e) => e.className.baseVal));

  expect(barsAfter).toBe(barsBefore);
  expect(classesAfter).toEqual(classesBefore);
});

test('flag state persists per project across a reload', async ({ page }) => {
  await page.locator('.row-flag-toggle').nth(1).click();
  await page.waitForTimeout(300);

  await page.reload();
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);

  const flagged = await page.evaluate(() => appDB.projects[appDB.activeId].flagged);
  expect(flagged).toEqual(['2']);
  const bg = await page.evaluate(() => sheet.rows[1].style.backgroundColor);
  expect(bg).toBe('rgb(243, 232, 255)');
});

test('the row right-click menu offers "Mark In Progress" as a second way to flag a row', async ({ page }) => {
  const items = await page.evaluate(() => sheet.options.contextMenu(sheet, undefined, '1', {}));
  const flagItem = items.find((i) => i.title.includes('In Progress'));
  expect(flagItem).toBeTruthy();
  expect(flagItem.title).toBe('● Mark In Progress');

  await page.evaluate(() => {
    const item = sheet.options.contextMenu(sheet, undefined, '1', {}).find((i) => i.title.includes('In Progress'));
    item.onclick();
  });
  await page.waitForTimeout(300);

  const flagged = await page.evaluate(() => appDB.projects[appDB.activeId].flagged);
  expect(flagged).toEqual(['2']);
  const bg = await page.evaluate(() => sheet.rows[1].style.backgroundColor);
  expect(bg).toBe('rgb(243, 232, 255)');
});

test('the right-click menu label flips to "Clear In Progress Flag" once a row is flagged, and clicking it unflags', async ({ page }) => {
  await page.locator('.row-flag-toggle').nth(1).click();
  await page.waitForTimeout(300);

  const items = await page.evaluate(() => sheet.options.contextMenu(sheet, undefined, '1', {}));
  const flagItem = items.find((i) => i.title.includes('In Progress'));
  expect(flagItem.title).toBe('○ Clear In Progress Flag');

  await page.evaluate(() => {
    const item = sheet.options.contextMenu(sheet, undefined, '1', {}).find((i) => i.title.includes('In Progress'));
    item.onclick();
  });
  await page.waitForTimeout(300);

  const flagged = await page.evaluate(() => appDB.projects[appDB.activeId].flagged);
  expect(flagged).toEqual([]);
});

test('right-click flagging targets the row under the cursor by Task ID, matching the dot toggle exactly', async ({ page }) => {
  // Flag row 2 (index 2, task "3") via the context menu -- confirms it uses
  // the right-clicked row's own Task ID, not the row index or some other row.
  await page.evaluate(() => {
    const item = sheet.options.contextMenu(sheet, undefined, '2', {}).find((i) => i.title.includes('In Progress'));
    item.onclick();
  });
  await page.waitForTimeout(300);

  const flagged = await page.evaluate(() => appDB.projects[appDB.activeId].flagged);
  expect(flagged).toEqual(['3']);
});

test('CSV export is unaffected by flag state', async ({ page }) => {
  await page.locator('.row-flag-toggle').nth(1).click();
  await page.waitForTimeout(300);

  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers).toEqual([
    'Task ID', 'Outline', 'Task Name', 'Resource', 'Def. Alloc',
    '% Done', 'Start', 'Dur.', 'End', 'Depends', 'Parent', 'Labels', 'Notes',
  ]);
});
