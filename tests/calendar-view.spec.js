// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #34: the Calendar view -- a fifth, full-width workspace
// mode alongside Grid/Split/Chart/Kanban. Leaf tasks only (same exclusion
// Kanban/Workload/Critical Path already apply) draw as Start-to-End bars
// on a month grid; a task missing Start or End can't be placed on a grid
// at all, so it lists in a small Unscheduled tray instead of disappearing.
// View-only for v1 -- a bar or tray item opens the same Detail Card every
// other view already uses. Reuses kanbanHiddenRowIndices directly for its
// filter-visibility set, so a Label/Search/etc. filter hides a calendar
// bar the same way it hides a grid row or Kanban card.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12, STATUS: 13, TOPIC: 14, LANE: 15 };

function row(overrides) {
  const r = Array(16).fill('');
  Object.assign(r, overrides);
  return r;
}

async function loadTasks(page, rows) {
  await page.evaluate((data) => {
    appDB.projects[appDB.activeId].data = data;
    appDB.projects[appDB.activeId].collapsed = [];
    renderGrid(data);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

async function openCalendar(page) {
  await page.click('#btnCalendarView');
  await page.waitForTimeout(200);
}

// Same relative-to-"today" pattern tests/kanban-board.spec.js and
// tests/plan-my-day.spec.js use, so a date-dependent assertion never goes
// stale as real time passes, and the browser's own notion of "today" (the
// pinned America/New_York test timezone) is always the source of truth.
async function dateOffset(page, n) {
  return page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return format(d);
  }, n);
}

test('clicking Calendar shows the panel and hides the grid/chart workspace; Grid returns to it', async ({ page }) => {
  await expect(page.locator('#calendarPanel')).toBeHidden();
  await openCalendar(page);
  await expect(page.locator('#calendarPanel')).toBeVisible();
  await expect(page.locator('.workspace')).toBeHidden();

  await page.click('button:has-text("Grid")');
  await page.waitForTimeout(200);
  await expect(page.locator('#calendarPanel')).toBeHidden();
  await expect(page.locator('.workspace')).toBeVisible();
});

test('Calendar and Kanban are mutually exclusive -- opening one closes the other', async ({ page }) => {
  await openCalendar(page);
  await expect(page.locator('#calendarPanel')).toBeVisible();

  await page.click('#btnKanbanView');
  await page.waitForTimeout(200);
  await expect(page.locator('#calendarPanel')).toBeHidden();
  await expect(page.locator('#kanbanPanel')).toBeVisible();

  await openCalendar(page);
  await expect(page.locator('#kanbanPanel')).toBeHidden();
  await expect(page.locator('#calendarPanel')).toBeVisible();
});

test('the month label shows the current month and year by default', async ({ page }) => {
  const expected = await page.evaluate(() => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  await openCalendar(page);
  await expect(page.locator('#calendarMonthLabel')).toHaveText(expected);
});

test('Next/Previous month navigation changes the label, and Today returns to the current month', async ({ page }) => {
  const thisMonth = await page.evaluate(() => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  const nextMonth = await page.evaluate(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); });

  await openCalendar(page);
  await page.click('.calendar-nav-btn[title="Next month"]');
  await page.waitForTimeout(150);
  await expect(page.locator('#calendarMonthLabel')).toHaveText(nextMonth);

  await page.click('.calendar-nav-btn[title="Previous month"]');
  await page.waitForTimeout(150);
  await expect(page.locator('#calendarMonthLabel')).toHaveText(thisMonth);

  await page.click('.calendar-nav-btn[title="Next month"]');
  await page.waitForTimeout(150);
  await page.click('.calendar-today-btn');
  await page.waitForTimeout(150);
  await expect(page.locator('#calendarMonthLabel')).toHaveText(thisMonth);
});

test('today\'s cell is visually marked', async ({ page }) => {
  const todayNum = await page.evaluate(() => new Date().getDate().toString());
  await openCalendar(page);
  await expect(page.locator('.calendar-cell.is-today .calendar-daynum')).toHaveText(todayNum);
});

test('a leaf task with both Start and End draws exactly one bar carrying its name and resource', async ({ page }) => {
  const start = await dateOffset(page, 1);
  const end = await dateOffset(page, 1);
  await loadTasks(page, [row({ [COL.ID]: '1', [COL.NAME]: 'Design review', [COL.RESOURCE]: 'Adam Beltz', [COL.START]: start, [COL.END]: end, [COL.PCT]: '0' })]);
  await openCalendar(page);

  const bars = page.locator('.calendar-bar', { hasText: 'Design review' });
  await expect(bars).toHaveCount(1);
  await expect(bars.first()).toContainText('Adam Beltz');
});

test('a parent task (has children) does not get a bar -- leaf tasks only, same as Kanban/Workload', async ({ page }) => {
  const d = await dateOffset(page, 0);
  await loadTasks(page, [
    row({ [COL.ID]: '1', [COL.NAME]: 'Parent phase', [COL.START]: d, [COL.END]: d }),
    row({ [COL.ID]: '2', [COL.NAME]: 'Child task', [COL.PARENT]: '1', [COL.START]: d, [COL.END]: d }),
  ]);
  await openCalendar(page);

  await expect(page.locator('.calendar-bar', { hasText: 'Parent phase' })).toHaveCount(0);
  await expect(page.locator('.calendar-bar', { hasText: 'Child task' })).toHaveCount(1);
});

test('a task missing Start or End lists in the Unscheduled tray instead of disappearing', async ({ page }) => {
  const d = await dateOffset(page, 0);
  // Note: a Start with no Duration/End isn't actually "missing a date" in
  // this app's own data model -- syncToGantt() auto-fills End = Start for
  // a 0-duration task (see calculateEndDate's t.dur===0 branch), so that
  // combination is legitimately scheduled, not unscheduled. The genuinely
  // unscheduled cases are: no Start at all (nothing to compute an End
  // from), or an End typed directly with no Start (never auto-filled the
  // other way).
  await loadTasks(page, [
    row({ [COL.ID]: '1', [COL.NAME]: 'No dates at all', [COL.RESOURCE]: 'Jolee Dawson' }),
    row({ [COL.ID]: '2', [COL.NAME]: 'Only an End', [COL.END]: d }),
    row({ [COL.ID]: '3', [COL.NAME]: 'Fully scheduled', [COL.START]: d, [COL.END]: d }),
  ]);
  await openCalendar(page);

  await expect(page.locator('#calendarUnscheduled')).toContainText('Unscheduled (2)');
  await expect(page.locator('.calendar-unscheduled-item', { hasText: 'No dates at all' })).toHaveCount(1);
  await expect(page.locator('.calendar-unscheduled-item', { hasText: 'Jolee Dawson' })).toHaveCount(1);
  await expect(page.locator('.calendar-unscheduled-item', { hasText: 'Only an End' })).toHaveCount(1);
  await expect(page.locator('.calendar-unscheduled-item', { hasText: 'Fully scheduled' })).toHaveCount(0);
  await expect(page.locator('.calendar-bar', { hasText: 'Fully scheduled' })).toHaveCount(1);
});

test('the Unscheduled tray is empty-state when everything has a Start and End', async ({ page }) => {
  const d = await dateOffset(page, 0);
  await loadTasks(page, [row({ [COL.ID]: '1', [COL.NAME]: 'Scheduled', [COL.START]: d, [COL.END]: d })]);
  await openCalendar(page);

  await expect(page.locator('#calendarUnscheduled')).toContainText('Nothing missing a Start or End date.');
});

test('clicking a bar opens that task\'s real Detail Card', async ({ page }) => {
  const d = await dateOffset(page, 0);
  await loadTasks(page, [row({ [COL.ID]: '1', [COL.NAME]: 'Open me', [COL.START]: d, [COL.END]: d })]);
  await openCalendar(page);

  await page.locator('.calendar-bar', { hasText: 'Open me' }).click();
  await expect(page.locator('#detailCardModal')).toHaveClass(/active/);
  await expect(page.locator('#detailCardTaskName')).toHaveText('Open me');
});

test('clicking an Unscheduled-tray item opens that task\'s real Detail Card', async ({ page }) => {
  await loadTasks(page, [row({ [COL.ID]: '1', [COL.NAME]: 'Needs a date' })]);
  await openCalendar(page);

  await page.locator('.calendar-unscheduled-item', { hasText: 'Needs a date' }).click();
  await expect(page.locator('#detailCardModal')).toHaveClass(/active/);
  await expect(page.locator('#detailCardTaskName')).toHaveText('Needs a date');
});

test('bar color follows the same Overdue/Due-today/In-progress/Complete/Not-started palette as the Status column', async ({ page }) => {
  const overdue = await dateOffset(page, -2);
  const dueToday = await dateOffset(page, 0);
  const future = await dateOffset(page, 5);

  await loadTasks(page, [
    row({ [COL.ID]: '1', [COL.NAME]: 'Overdue task', [COL.START]: overdue, [COL.END]: overdue, [COL.PCT]: '20' }),
    row({ [COL.ID]: '2', [COL.NAME]: 'Due today task', [COL.START]: dueToday, [COL.END]: dueToday, [COL.PCT]: '0' }),
    row({ [COL.ID]: '3', [COL.NAME]: 'In progress task', [COL.START]: future, [COL.END]: future, [COL.PCT]: '40' }),
    row({ [COL.ID]: '4', [COL.NAME]: 'Complete task', [COL.START]: future, [COL.END]: future, [COL.PCT]: '100' }),
    row({ [COL.ID]: '5', [COL.NAME]: 'Not started task', [COL.START]: future, [COL.END]: future, [COL.PCT]: '0' }),
  ]);
  await openCalendar(page);

  await expect(page.locator('.calendar-bar', { hasText: 'Overdue task' })).toHaveCSS('background-color', 'rgb(254, 202, 202)');
  await expect(page.locator('.calendar-bar', { hasText: 'Due today task' })).toHaveCSS('background-color', 'rgb(254, 240, 138)');
  await expect(page.locator('.calendar-bar', { hasText: 'In progress task' })).toHaveCSS('background-color', 'rgb(219, 234, 254)');
  await expect(page.locator('.calendar-bar', { hasText: 'Complete task' })).toHaveCSS('background-color', 'rgb(220, 252, 231)');
  await expect(page.locator('.calendar-bar', { hasText: 'Not started task' })).toHaveCSS('background-color', 'rgb(241, 245, 249)');
});

test('a multi-day task draws as a single bar, not one chip per day it spans', async ({ page }) => {
  const start = await dateOffset(page, 1);
  const end = await dateOffset(page, 3);
  await loadTasks(page, [row({ [COL.ID]: '1', [COL.NAME]: 'Three day span', [COL.START]: start, [COL.END]: end })]);
  await openCalendar(page);

  await expect(page.locator('.calendar-bar', { hasText: 'Three day span' })).toHaveCount(1);
});

test('the calendar reuses the grid\'s filters -- a Label filter hides a task\'s bar the same way it hides a grid row', async ({ page }) => {
  const d = await dateOffset(page, 0);
  await page.evaluate(() => { appDB.projects[appDB.activeId].labels = ['Urgent']; });
  await loadTasks(page, [
    row({ [COL.ID]: '1', [COL.NAME]: 'Flagged task', [COL.START]: d, [COL.END]: d, [COL.LABELS]: 'Urgent' }),
    row({ [COL.ID]: '2', [COL.NAME]: 'Plain task', [COL.START]: d, [COL.END]: d }),
  ]);
  await openCalendar(page);

  await expect(page.locator('.calendar-bar', { hasText: 'Flagged task' })).toHaveCount(1);
  await expect(page.locator('.calendar-bar', { hasText: 'Plain task' })).toHaveCount(1);

  await page.click('#labelFilterBtn');
  await page.locator('.labelFilterCheckbox[value="Urgent"]').check();
  await page.waitForTimeout(200);

  await expect(page.locator('.calendar-bar', { hasText: 'Flagged task' })).toHaveCount(1);
  await expect(page.locator('.calendar-bar', { hasText: 'Plain task' })).toHaveCount(0);
});

test('a week with more than 3 overlapping tasks stacks 3 bars and shows a "+N more" label', async ({ page }) => {
  const start = await dateOffset(page, 1);
  const end = await dateOffset(page, 2);
  const rows = [];
  for (let i = 1; i <= 5; i++) {
    rows.push(row({ [COL.ID]: String(i), [COL.NAME]: `Overlap task ${i}`, [COL.START]: start, [COL.END]: end }));
  }
  await loadTasks(page, rows);
  await openCalendar(page);

  await expect(page.locator('.calendar-bar', { hasText: /Overlap task/ })).toHaveCount(3);
  await expect(page.locator('.calendar-more', { hasText: /\+2 more/ }).first()).toBeVisible();
});
