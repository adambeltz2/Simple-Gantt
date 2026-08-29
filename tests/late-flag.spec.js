// @ts-check
const { test, expect } = require('@playwright/test');

// Covers the "Late" indicator: an automatically-computed color on the End
// cell itself (grid-only, per the feature request) -- red if End is in the
// past, yellow if End is today, and no color for a future or missing End.
// Date math against today, matching the same "dates are on the user"
// decision as dependency scheduling -- except a task finished at 100% is
// never marked late, no matter what its End date says, same as the Gantt
// chart's own is-complete-before-is-overdue precedence. Applies uniformly
// to every row including parents, since a parent's End/% Done are already
// its own rolled-up values.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
});

function endCellStyle(page, rowIndex) {
  return page.evaluate((y) => {
    const el = sheet.records[y][8]; // COL.END
    return { bg: el.style.backgroundColor, title: el.title };
  }, rowIndex);
}

test('computeLateStatus: red for a past End, yellow for today, null for future, empty, or 100% done', async ({ page }) => {
  const results = await page.evaluate(() => {
    const today = new Date();
    const past = new Date(today); past.setDate(past.getDate() - 5);
    const future = new Date(today); future.setDate(future.getDate() + 5);
    return {
      past: computeLateStatus(format(past)),
      today: computeLateStatus(format(today)),
      future: computeLateStatus(format(future)),
      empty: computeLateStatus(''),
      pastButComplete: computeLateStatus(format(past), 100),
      todayButComplete: computeLateStatus(format(today), 100),
    };
  });
  expect(results.past).toBe('red');
  expect(results.today).toBe('yellow');
  expect(results.future).toBeNull();
  expect(results.empty).toBeNull();
  expect(results.pastButComplete).toBeNull();
  expect(results.todayButComplete).toBeNull();
});

test('a row with an overdue End is tinted red in the grid, with a tooltip', async ({ page }) => {
  await page.evaluate((COL) => {
    const past = new Date(); past.setDate(past.getDate() - 3);
    const data = [['1', '1', 'Overdue task', '', '', '50', format(past), '1', format(past), '', '']];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  const style = await endCellStyle(page, 0);
  expect(style.bg).toBe('rgb(254, 202, 202)'); // #fecaca
  expect(style.title).toBe('Overdue');
});

test('a row due today is tinted yellow, not red', async ({ page }) => {
  await page.evaluate((COL) => {
    const todayStr = format(new Date());
    const data = [['1', '1', 'Due today', '', '', '50', todayStr, '1', todayStr, '', '']];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  const style = await endCellStyle(page, 0);
  expect(style.bg).toBe('rgb(254, 240, 138)'); // #fef08a
  expect(style.title).toBe('Due today');
});

test('a 100%-complete task is never marked late, even with a past End date', async ({ page }) => {
  await page.evaluate((COL) => {
    const past = new Date(); past.setDate(past.getDate() - 3);
    const data = [['1', '1', 'Finished late', '', '', '100', format(past), '1', format(past), '', '']];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  const style = await endCellStyle(page, 0);
  expect(style.bg).toBe('');
  expect(style.title).toBe('');
});

test('a parent row is colored from its own rolled-up End, same as any row', async ({ page }) => {
  await page.evaluate((COL) => {
    const past = new Date(); past.setDate(past.getDate() - 3);
    const pastStr = format(past);
    const data = [
      ['1', '1', 'Parent', '', '', '0', '', '', '', '', ''],
      ['2', '1.1', 'Child', '', '', '0', pastStr, '1', pastStr, '', '1'],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  const parentStyle = await endCellStyle(page, 0);
  expect(parentStyle.bg).toBe('rgb(254, 202, 202)');
});

test('Late coloring has no effect on the Gantt chart or exported columns', async ({ page }) => {
  const before = await page.evaluate(() => document.querySelectorAll('.gantt .bar-wrapper').length);

  await page.evaluate((COL) => {
    const past = new Date(); past.setDate(past.getDate() - 3);
    const data = [['1', '1', 'Overdue task', '', '', '50', format(past), '1', format(past), '', '']];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => document.querySelectorAll('.gantt .bar-wrapper').length);
  expect(after).toBe(1); // renders normally, no crash

  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers).toEqual([
    'Task ID', 'Outline', 'Task Name', 'Resource', 'Def. Alloc',
    '% Done', 'Start', 'Dur.', 'End', 'Depends', 'Parent',
  ]);
});

test('a future End has no color at all', async ({ page }) => {
  await page.evaluate((COL) => {
    const future = new Date(); future.setDate(future.getDate() + 10);
    const data = [['1', '1', 'Future task', '', '', '0', format(future), '1', format(future), '', '']];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  const style = await endCellStyle(page, 0);
  expect(style.bg).toBe('');
});
