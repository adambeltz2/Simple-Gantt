// @ts-check
const { test, expect } = require('@playwright/test');

// `new Date("YYYY-MM-DD")` is parsed as UTC midnight per the ECMAScript
// spec. In any timezone behind UTC (most of the Americas), reading it back
// with local getters (getDate/getDay/etc.) silently rolls the calendar date
// back by one day. This was invisible in a UTC test environment -- it only
// surfaced from a real user's bug report, in their own (behind-UTC) browser
// timezone, where a 1-day task starting 2026-08-20 was showing End=2026-08-19
// (a full day *before* Start). The old exclusive-end "+1" convention had
// been accidentally masking this exact bug for 1-day tasks in behind-UTC
// timezones this whole time; removing it (to fix the inclusive-end bug)
// unmasked it.
//
// Root cause fixed by routing every internal date-string parse through
// parseLocalDate() instead of the bare `new Date(str)` constructor. This
// suite's real value is running under playwright.config.js's non-UTC
// timezoneId ('America/New_York') -- these tests are meaningless in UTC,
// which is exactly how this bug went unnoticed for so long.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
});

test('the test browser is actually running in a non-UTC, behind-UTC timezone', async ({ page }) => {
  // Sanity check on the test setup itself: if this ever reports UTC, every
  // other test in this file would silently stop testing anything.
  const offsetMinutes = await page.evaluate(() => new Date().getTimezoneOffset());
  expect(offsetMinutes).toBeGreaterThan(0); // positive = behind UTC
});

test('exact regression: a 1-day task starting 2026-08-20 does not show End one day before Start', async ({ page }) => {
  const end = await page.evaluate(() => calculateEndDate('2026-08-20', 1));
  expect(end).toBe('2026-08-20');
  expect(new Date(end + 'T00:00:00').getTime()).toBeGreaterThanOrEqual(new Date('2026-08-20T00:00:00').getTime());
});

test('End is never before Start, for a range of durations and weekend settings', async ({ page }) => {
  const results = await page.evaluate(() => {
    const out = [];
    for (const skipWeekends of [true, false]) {
      document.getElementById('skipWeekends').checked = skipWeekends;
      for (const dur of [0, 1, 2, 3, 5, 10]) {
        const end = calculateEndDate('2026-08-20', dur);
        out.push({ skipWeekends, dur, start: '2026-08-20', end });
      }
    }
    return out;
  });

  results.forEach(({ dur, start, end }) => {
    // Compare as local-midnight datetimes (not bare YYYY-MM-DD, which would
    // reintroduce the exact UTC-parsing bug into this assertion itself).
    expect(new Date(end + 'T00:00:00').getTime(), `dur=${dur} start=${start} end=${end}`)
      .toBeGreaterThanOrEqual(new Date(start + 'T00:00:00').getTime());
  });
});

test('parseLocalDate matches the calendar date in the string, regardless of browser timezone', async ({ page }) => {
  const results = await page.evaluate(() => {
    return ['2026-01-01', '2026-06-15', '2026-12-31', '2026-08-20'].map((s) => {
      const d = parseLocalDate(s);
      return { input: s, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
    });
  });
  expect(results).toEqual([
    { input: '2026-01-01', year: 2026, month: 1, day: 1 },
    { input: '2026-06-15', year: 2026, month: 6, day: 15 },
    { input: '2026-12-31', year: 2026, month: 12, day: 31 },
    { input: '2026-08-20', year: 2026, month: 8, day: 20 },
  ]);
});

test('exact reproduction of the reported production bug, using the real project shape', async ({ page }) => {
  // Same shape reported: task 43 (dur=0, stale dates) is parent of 44/45
  // (dur=1, Start=2026-08-20). Under the timezone bug, children would show
  // End=2026-08-19 (before their own Start), and the parent rollup would
  // inherit that same broken date.
  const [row43, row44] = await page.evaluate((COL) => {
    const data = [
      ['43', '1', 'Style List of Values', '', '', '43', '2026-08-19', '0', '2026-08-19', '', ''],
      ['44', '1.1', 'LOV Applied 1', 'Adam', '100', '100', '2026-08-20', '1', '2026-08-20', '', '43'],
      ['45', '1.2', 'LOV Applied 2', 'Adam', '100', '100', '2026-08-20', '1', '2026-08-20', '', '43'],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
    const rows = sheet.getData();
    return [rows.find((r) => r[COL.ID] === '43'), rows.find((r) => r[COL.ID] === '44')];
  }, COL);

  expect(row44[COL.END]).toBe('2026-08-20'); // not 2026-08-19
  expect(row43[COL.END]).toBe('2026-08-20'); // parent matches its children
  expect(new Date(row44[COL.END] + 'T00:00:00').getTime())
    .toBeGreaterThanOrEqual(new Date(row44[COL.START] + 'T00:00:00').getTime());
});
