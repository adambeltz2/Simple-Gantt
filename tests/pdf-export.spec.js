// @ts-check
const { test, expect } = require('@playwright/test');

// Covers the paginated PDF export ("Export PDF" toolbar button): the chart
// panel is rasterized via html2canvas (same technique as the existing PNG
// export) and sliced into one or more landscape-Letter pages via jsPDF.
// Grid-only concern -- must never touch task data or the Gantt chart itself.

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(500);
});

test('toolbar has an Export PDF button', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();
});

test('clicking Export PDF downloads a valid multi-page-capable PDF file', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Export PDF' }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  const text = buf.toString('latin1');

  expect(text.startsWith('%PDF-')).toBe(true);
  expect(text).toContain('%%EOF');
  // At least one real page object (not just the /Pages tree root).
  expect(/\/Type\s*\/Page[^s]/.test(text)).toBe(true);
});

test('PDF export never changes the underlying grid data', async ({ page }) => {
  const before = await page.evaluate(() => sheet.getData());

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Export PDF' }).click(),
  ]);
  await download.path();

  const after = await page.evaluate(() => sheet.getData());
  expect(after).toEqual(before);
});

test('PDF export has no effect on the Gantt chart', async ({ page }) => {
  const barsBefore = await page.locator('.gantt .bar-wrapper').count();

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Export PDF' }).click(),
  ]);
  await download.path();

  const barsAfter = await page.locator('.gantt .bar-wrapper').count();
  expect(barsAfter).toBe(barsBefore);
});

test('shows a status message while generating and on completion', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Export PDF' }).click(),
  ]);
  await download.path();

  await expect(page.locator('#saveStatusText')).toHaveText('PDF exported');
});

test('no uncaught JS errors during PDF export', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Export PDF' }).click(),
  ]);
  await download.path();

  expect(page.consoleErrors).toEqual([]);
});
