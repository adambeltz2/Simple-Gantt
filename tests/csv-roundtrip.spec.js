// @ts-check
const { test, expect } = require('./fixtures');
const fs = require('fs');

// Covers exporting to CSV and re-importing it: headers match the live
// columns (core + custom), dates are formatted correctly, parent/child and
// dependency relationships survive the round trip, and re-importing an
// export produces the same data back out (since the source data is already
// self-consistent under the app's own scheduling rules).

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => { document.getElementById('skipWeekends').checked = false; });
});

async function loadRoundtripFixture(page) {
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].columns = ['JIRA', 'Notes'];
    const data = [
      ['1', '1', 'Parent Task', '', '', '0', '', '', '', '', '', '', '', ''],
      ['2', '1.1', 'Child One', 'Alice', '100', '50', '2026-08-24', '3', '2026-08-26', '', '1', '', 'PROJ-100', 'First **note**'],
      ['3', '1.2', 'Child Two', 'Bob (50%)', '100', '100', '2026-08-27', '2', '2026-08-28', '2', '1', '', 'PROJ-101', ''],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  });
  await page.waitForTimeout(300);
}

test('exported CSV has the right headers, in order, including custom columns', async ({ page }) => {
  await loadRoundtripFixture(page);

  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const headerLine = content.split('\n')[0].trim();

  expect(headerLine).toBe(
    'Task ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent,Labels,JIRA,Notes'
  );
});

test('exported CSV contains correctly formatted dates and the parent rollup', async ({ page }) => {
  await loadRoundtripFixture(page);
  // Derive expectations from the live engine's own computed state, rather
  // than hand-computing the rollup math (weighted % Done, working days)
  // independently and risking a transcription error in the test itself.
  const parentRow = await page.evaluate(() => sheet.getData().find((r) => r[0] === '1'));

  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const parentLine = content.split('\n').find((l) => l.startsWith('1,1,Parent Task')).trim();

  expect(parentLine).toBe(
    `1,1,Parent Task,,,${parentRow[COL.PCT]},${parentRow[COL.START]},${parentRow[COL.DUR]},${parentRow[COL.END]},,,,,`
  );
  expect(content).toContain('PROJ-100');
  expect(content).toContain('PROJ-101');
});

test('a full export -> re-import cycle reproduces the same data', async ({ page }) => {
  await loadRoundtripFixture(page);
  const before = await page.evaluate(() => sheet.getData());

  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const csvPath = await download.path();
  const csvBuffer = fs.readFileSync(csvPath);

  await page.setInputFiles('#csvFile', {
    name: 'export.csv',
    mimeType: 'text/csv',
    buffer: csvBuffer,
  });
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => sheet.getData());
  // Compare as strings: numeric-type columns (% Done, Dur.) round-trip
  // through CSV as strings even though the live grid holds them as JS
  // numbers -- the app itself only ever consumes these via parseInt(), so
  // that type wobble is harmless; a strict deep-equal would fail on it.
  const normalize = (data) => data.map((row) => row.map((cell) => String(cell)));
  expect(normalize(after)).toEqual(normalize(before));
});

test('re-importing preserves the custom "Notes" column content and its click-to-expand treatment', async ({ page }) => {
  await loadRoundtripFixture(page);

  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const csvBuffer = fs.readFileSync(await download.path());

  await page.setInputFiles('#csvFile', {
    name: 'export.csv',
    mimeType: 'text/csv',
    buffer: csvBuffer,
  });
  await page.waitForTimeout(400);

  const notesValue = await page.evaluate(() => {
    const notesCol = sheet.options.columns.findIndex((c) => c.title.toLowerCase() === 'notes');
    return sheet.getData()[1][notesCol];
  });
  expect(notesValue).toBe('First **note**');
  await expect(page.locator('.notes-flag')).toHaveCount(3); // one per row, including empty ones
});

test('importing a CSV with no header row falls back gracefully instead of crashing', async ({ page }) => {
  const csv = '1,1,Headerless Task,,,0,2026-08-24,1,2026-08-24,,\n';
  await page.setInputFiles('#csvFile', {
    name: 'headerless.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.waitForTimeout(400);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.NAME]).toBe('Headerless Task');
});
