// @ts-check
const { test, expect } = require('./fixtures');

// User-requested "basic Status," calculated only from % Done: Not Started
// (0%), In Progress (1-99%), Complete (100%). A new permanent core column
// (COL.STATUS, index 13, right after Notes) -- following the exact same
// precedent as Labels/Notes when they were added: appended at the end of
// the core schema (never inserted mid-sequence, which would shift every
// later column's index), always read-only, always freshly recomputed by
// syncToGantt() the same way Outline's WBS numbers are, never something a
// user types directly. Applies to parent rows too, since their % Done is
// already a live rollup, same reasoning as the Late indicator and the
// 100%-done checkmark.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12, STATUS: 13 };

function row(id, outline, name, pct, dur, parent) {
  const r = Array(14).fill('');
  r[COL.ID] = id; r[COL.OUTLINE] = outline; r[COL.NAME] = name;
  r[COL.PCT] = pct; r[COL.START] = '2026-08-24'; r[COL.DUR] = dur; r[COL.END] = '2026-08-24';
  r[COL.PARENT] = parent;
  return r;
}

async function loadTasks(page, rows) {
  await page.evaluate((rows) => {
    appDB.projects[appDB.activeId].data = rows;
    renderGrid(rows);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

function statusCellStyle(page, rowIndex) {
  return page.evaluate((y) => {
    const el = sheet.records[y][13]; // COL.STATUS
    return { text: el.innerText, backgroundColor: el.style.backgroundColor, color: el.style.color };
  }, rowIndex);
}

test('every project has a Status column, right after Notes, with no setup needed', async ({ page }) => {
  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers[COL.STATUS]).toBe('Status');
  expect(headers[COL.NOTES]).toBe('Notes');
});

test('a brand new project also gets the Status column', async ({ page }) => {
  page.once('dialog', (d) => d.accept('New Project'));
  await page.selectOption('#projectSelector', '__NEW__');
  await page.waitForTimeout(300);

  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers[COL.STATUS]).toBe('Status');
});

test('0% Done computes to Not Started', async ({ page }) => {
  await loadTasks(page, [row('1', '1', 'Task A', '0', '5', '')]);
  const style = await statusCellStyle(page, 0);
  expect(style.text).toBe('Not Started');
});

test('a % Done between 0 and 100 computes to In Progress', async ({ page }) => {
  await loadTasks(page, [row('1', '1', 'Task A', '45', '5', '')]);
  const style = await statusCellStyle(page, 0);
  expect(style.text).toBe('In Progress');
});

test('100% Done computes to Complete', async ({ page }) => {
  await loadTasks(page, [row('1', '1', 'Task A', '100', '5', '')]);
  const style = await statusCellStyle(page, 0);
  expect(style.text).toBe('Complete');
});

test('each status gets a distinct color treatment', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Not started task', '0', '5', ''),
    row('2', '2', 'In progress task', '50', '5', ''),
    row('3', '3', 'Complete task', '100', '5', ''),
  ]);
  const [notStarted, inProgress, complete] = await Promise.all([0, 1, 2].map((i) => statusCellStyle(page, i)));

  expect(notStarted.backgroundColor).not.toBe(inProgress.backgroundColor);
  expect(inProgress.backgroundColor).not.toBe(complete.backgroundColor);
  expect(notStarted.backgroundColor).not.toBe(complete.backgroundColor);
});

test('Status is read-only -- it cannot be typed into directly', async ({ page }) => {
  const readOnly = await page.evaluate((c) => sheet.options.columns[c].readOnly, COL.STATUS);
  expect(readOnly).toBe(true);
});

test('editing % Done live-updates Status on the next sync', async ({ page }) => {
  await loadTasks(page, [row('1', '1', 'Task A', '0', '5', '')]);
  expect((await statusCellStyle(page, 0)).text).toBe('Not Started');

  await page.evaluate(() => sheet.setValueFromCoords(5, 0, '100', true)); // COL.PCT
  await page.waitForTimeout(300);

  expect((await statusCellStyle(page, 0)).text).toBe('Complete');
});

test('a parent\'s Status reflects its rolled-up % Done, same as the checkmark icon', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Parent', '0', '', ''),
    row('2', '1.1', 'Child A', '100', '3', '1'),
    row('3', '1.2', 'Child B', '100', '2', '1'),
  ]);

  const parentStyle = await statusCellStyle(page, 0);
  expect(parentStyle.text).toBe('Complete');
});

test('a parent with a mix of finished and unfinished children shows In Progress', async ({ page }) => {
  await loadTasks(page, [
    row('1', '1', 'Parent', '0', '', ''),
    row('2', '1.1', 'Child A', '100', '3', '1'),
    row('3', '1.2', 'Child B', '0', '2', '1'),
  ]);

  const parentStyle = await statusCellStyle(page, 0);
  expect(parentStyle.text).toBe('In Progress');
});

test('exported CSV includes a Status column with the computed value', async ({ page }) => {
  const fs = require('fs');
  await loadTasks(page, [row('1', '1', 'Task A', '100', '5', '')]);

  await page.click('#exportMenuBtn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  // Papa.unparse's default line endings are CRLF -- trim each line
  // individually (content.trim() alone only strips the very start/end of
  // the whole string, leaving a trailing \r on every other line).
  const lines = content.trim().split('\n').map((l) => l.trim());
  expect(lines[0].split(',')).toContain('Status');
  expect(lines[1]).toContain('Complete');
});

test('a CSV exported before Status existed (no Status header) imports fine and Status still computes on the next sync', async ({ page }) => {
  const csv = [
    'Task ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent,Labels,Notes,JIRA',
    '1,1,Legacy Task,,100,100,2026-08-24,1,2026-08-24,,,,,PROJ-9',
  ].join('\n');
  await page.setInputFiles('#csvFile', { name: 'legacy.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForTimeout(400);

  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers[COL.STATUS]).toBe('Status');
  expect(headers[14]).toBe('JIRA'); // the custom column stayed correctly aligned

  const row0 = await page.evaluate(() => sheet.getData()[0]);
  expect(row0[COL.STATUS]).toBe('Complete'); // recomputed fresh from % Done, not left blank
  expect(row0[14]).toBe('PROJ-9');
});

test('the Status column cannot be renamed or deleted, but does offer Insert Column Right (it\'s now the last core column)', async ({ page }) => {
  const titles = await page.evaluate((c) => sheet.options.contextMenu(sheet, c, null, {}).map((i) => i.title), COL.STATUS);
  expect(titles).toContain('➕ Insert Column Right');
  expect(titles).not.toContain('✏️ Rename Column');
  expect(titles).not.toContain('🗑️ Delete Column');
});

test('the Notes column no longer offers Insert Column Right now that Status comes after it', async ({ page }) => {
  const titles = await page.evaluate((c) => sheet.options.contextMenu(sheet, c, null, {}).map((i) => i.title), COL.NOTES);
  expect(titles).not.toContain('➕ Insert Column Right');
  expect(titles).not.toContain('✏️ Rename Column');
  expect(titles).not.toContain('🗑️ Delete Column');
});

test('a genuinely new custom column added after Status is named "Custom 1"', async ({ page }) => {
  await page.evaluate((c) => {
    const item = sheet.options.contextMenu(sheet, c, null, {}).find((i) => i.title === '➕ Insert Column Right');
    item.onclick();
  }, COL.STATUS);
  await page.waitForTimeout(200);

  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers[14]).toBe('Custom 1');
});
