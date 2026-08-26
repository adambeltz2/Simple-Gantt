// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');

// Covers PDF export (backlog item: PDF export). Reuses the same
// html2canvas rasterization the existing PNG export already does, then
// tiles that single wide canvas across as many landscape PDF pages as
// needed -- a Gantt timeline is wide, not tall, so pagination goes
// left-to-right (each page gets a full-height vertical slice) rather than
// shrinking the whole chart onto one page.
//
// Page count is derived from the actual rendered canvas dimensions (via a
// spy on window.html2canvas) and run through the exact same tiling formula
// exportPDF() uses, rather than hand-computing an expected page count
// independently and risking a transcription error in the test itself --
// same philosophy the CSV round-trip tests already use.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };
const MARGIN = 24;
const PAGE_WIDTH_PT = 841.89; // jsPDF 'a4' landscape
const PAGE_HEIGHT_PT = 595.28;

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(500);

  // Spy on html2canvas so tests can read the exact canvas dimensions
  // exportPDF() itself rasterized, without duplicating a second real
  // html2canvas call (which would be slow and could differ slightly).
  await page.evaluate(() => {
    window.__lastCanvasSize = null;
    const original = window.html2canvas;
    window.html2canvas = function (...args) {
      return original.apply(this, args).then((canvas) => {
        window.__lastCanvasSize = { width: canvas.width, height: canvas.height };
        return canvas;
      });
    };
  });
});

async function loadTasks(page, rows) {
  await page.evaluate((rows) => {
    appDB.projects[appDB.activeId].data = rows;
    renderGrid(rows);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

function expectedPageCount(canvasWidth, canvasHeight) {
  const usableWidth = PAGE_WIDTH_PT - MARGIN * 2;
  const usableHeight = PAGE_HEIGHT_PT - MARGIN * 2;
  const scale = usableHeight / canvasHeight;
  const pageSliceWidthPx = Math.max(1, Math.floor(usableWidth / scale));
  return Math.max(1, Math.ceil(canvasWidth / pageSliceWidthPx));
}

// A generated PDF's raw bytes contain one "/Type /Page" object per page
// (distinct from the singular "/Type /Pages" tree root) -- good enough for
// a page-count check without a full PDF parser.
function countPdfPages(buffer) {
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}

test('Export PDF downloads a valid, non-empty PDF file', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '2', '2026-08-25', '', ''],
  ]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportPDF()"]'),
  ]);

  const filePath = await download.path();
  const buffer = fs.readFileSync(filePath);
  expect(buffer.slice(0, 5).toString('latin1')).toBe('%PDF-');
  expect(buffer.length).toBeGreaterThan(500);
});

test('the download filename matches the project name', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '', '', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  await page.evaluate(() => { appDB.projects[appDB.activeId].name = 'My Test Project'; });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportPDF()"]'),
  ]);

  expect(download.suggestedFilename()).toBe('My Test Project.pdf');
});

test('a normal-sized chart fits on the page count the tiling formula predicts', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '2', '2026-08-25', '', ''],
    ['2', '1', 'Task B', 'Bob', '100', '0', '2026-08-26', '3', '2026-08-28', '', ''],
  ]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportPDF()"]'),
  ]);
  const buffer = fs.readFileSync(await download.path());
  const actualPages = countPdfPages(buffer);

  const canvasSize = await page.evaluate(() => window.__lastCanvasSize);
  expect(canvasSize).not.toBeNull();
  expect(actualPages).toBe(expectedPageCount(canvasSize.width, canvasSize.height));
});

test('a wide timeline (long project duration) paginates across multiple pages', async ({ page }) => {
  await page.evaluate(() => { document.getElementById('zoomScale').value = 'Day'; changeZoom(); });
  await loadTasks(page, [
    ['1', '1', 'Very long task', 'Alice', '100', '0', '2026-08-24', '400', '', '', ''],
  ]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportPDF()"]'),
  ]);
  const buffer = fs.readFileSync(await download.path());
  const actualPages = countPdfPages(buffer);

  const canvasSize = await page.evaluate(() => window.__lastCanvasSize);
  const expected = expectedPageCount(canvasSize.width, canvasSize.height);

  expect(expected).toBeGreaterThan(1); // sanity: the fixture actually is wide enough to matter
  expect(actualPages).toBe(expected);
});

test('exporting an empty project (no tasks) does not crash', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Untimed task', '', '', '0', '', '', '', '', ''],
  ]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportPDF()"]'),
  ]);
  const buffer = fs.readFileSync(await download.path());

  expect(buffer.slice(0, 5).toString('latin1')).toBe('%PDF-');
  expect(page.consoleErrors).toEqual([]);
});

test('no uncaught JS errors during PDF export', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', ''],
    ['2', '1.1', 'Child', 'Alice', '100', '0', '2026-08-24', '2', '2026-08-25', '', '1'],
  ]);

  await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportPDF()"]'),
  ]);

  expect(page.consoleErrors).toEqual([]);
});
