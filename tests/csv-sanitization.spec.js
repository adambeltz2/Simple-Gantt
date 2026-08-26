// @ts-check
const { test, expect } = require('@playwright/test');

// Covers the CSV sanitization gap from the repo review: Task Name, Resource,
// and custom-column text were passed through raw from imported CSVs, relying
// entirely on every render site remembering to escape. The fix centralizes
// sanitization inside applyImportedCSVData()/sanitizeImportedRows() so every
// ingestion path gets it automatically -- the manual Import button, Dropbox
// restore (restoreBackup), and Dropbox project discovery
// (importDiscoveredProject) all funnel through one of those two.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };
const HEADER_ROW = ['ID', 'Outline', 'Task Name', 'Resource', 'Def. Alloc', '% Done', 'Start', 'Dur.', 'End', 'Depends', 'Parent'];

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
});

test('applyImportedCSVData strips angle brackets from Task Name and Resource (the restoreBackup path)', async ({ page }) => {
  const result = await page.evaluate((HEADER_ROW) => {
    const maliciousRow = ['99', '1', '<img src=x onerror=alert(1)>', '<b>Alice</b>', '100', '0', '2026-01-01', '3', '', '', ''];
    applyImportedCSVData([HEADER_ROW, maliciousRow]);
    const row = sheet.getData().find((r) => r[0] === '99');
    return row;
  }, HEADER_ROW);

  expect(result[2]).not.toContain('<');
  expect(result[2]).not.toContain('>');
  expect(result[3]).not.toContain('<');
  expect(result[3]).not.toContain('>');
});

test('sanitizeImportedRows strips brackets from any text column, not just Name/Resource', async ({ page }) => {
  const cleaned = await page.evaluate((HEADER_ROW) => {
    const row = ['1', '1', 'Task', 'Res', '100', '0', '2026-01-01', '3', '', '', '', '<script>evil</script>'];
    const headers = [...HEADER_ROW, 'CustomField'];
    return sanitizeImportedRows([row], headers)[0];
  }, HEADER_ROW);

  expect(cleaned[11]).toBe('scriptevil/script');
});

test('date columns still parse and normalize correctly through the same path', async ({ page }) => {
  const result = await page.evaluate((HEADER_ROW) => {
    const row = ['98', '1', 'Task', '', '100', '0', '01/15/2026', '3', '', '', ''];
    applyImportedCSVData([HEADER_ROW, row]);
    return sheet.getData().find((r) => r[0] === '98');
  }, HEADER_ROW);

  expect(result[COL.START]).toBe('2026-01-15');
});

test('legitimate resource strings with parentheses and % are left untouched', async ({ page }) => {
  const result = await page.evaluate((HEADER_ROW) => {
    const row = ['97', '1', 'Task', 'Bob (50%), Charlie @ 50%', '100', '0', '2026-01-01', '3', '', '', ''];
    applyImportedCSVData([HEADER_ROW, row]);
    return sheet.getData().find((r) => r[0] === '97');
  }, HEADER_ROW);

  expect(result[COL.RESOURCE]).toBe('Bob (50%), Charlie @ 50%');
});

test('end-to-end: importing a CSV file via the Import button sanitizes on the way in', async ({ page }) => {
  const csv = [
    HEADER_ROW.join(','),
    '50,1,"<img src=x onerror=alert(1)>","<b>Mallory</b>",100,0,2026-02-01,2,,,',
  ].join('\n');

  await page.setInputFiles('#csvFile', {
    name: 'malicious.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.waitForTimeout(500);

  const row = await page.evaluate(() => sheet.getData().find((r) => r[0] === '50'));
  expect(row[2]).not.toContain('<');
  expect(row[3]).not.toContain('<');
  expect(page.consoleErrors).toEqual([]);
});
