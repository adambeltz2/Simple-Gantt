// @ts-check
const { test, expect } = require('./fixtures');

// Covers "Plan My Day": a per-project, view-only focus list. Recommended
// candidates are computed live from Late/upcoming End dates (same source
// data the existing Late Indicator already reads), capped so the drawer
// never turns into a second copy of the grid; the user pins whichever ones
// matter into Today's Plan, which persists per project (same localStorage
// tier as collapsed/flagged/hiddenColumns -- never in CSV export or a
// Dropbox backup's meta.json). Marking a pinned task complete and editing
// its Notes both go through the exact same grid-level calls the grid itself
// uses, not a parallel data path.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12, STATUS: 13 };

async function loadTasks(page, rows) {
  await page.evaluate((data) => {
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

// Computes a YYYY-MM-DD date string N days from "today" as the app itself
// reckons it (its own format()/parseLocalDate helpers, in the pinned
// America/New_York test timezone) -- never a hardcoded calendar date, since
// this feature's whole premise is relative to whatever day it actually runs.
async function dateOffset(page, n) {
  return page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return format(d);
  }, n);
}

function row(id, name, { end = '', pct = '0', parent = '', resource = '' } = {}) {
  const r = Array(14).fill('');
  r[COL.ID] = id; r[COL.OUTLINE] = id; r[COL.NAME] = name; r[COL.RESOURCE] = resource;
  r[COL.ALLOC] = '100'; r[COL.PCT] = pct; r[COL.END] = end; r[COL.PARENT] = parent;
  return r;
}

test('the toolbar badge is hidden with nothing pinned, and shows the count once something is', async ({ page }) => {
  await expect(page.locator('#planMyDayBadge')).toBeHidden();

  const overdue = await dateOffset(page, -3);
  await loadTasks(page, [row('1', 'A', { end: overdue })]);
  await page.evaluate(() => toggleTodayPin('1'));
  await page.waitForTimeout(200);

  await expect(page.locator('#planMyDayBadge')).toBeVisible();
  await expect(page.locator('#planMyDayBadge')).toHaveText('1');
});

test('Recommended surfaces overdue and due-soon tasks, in that order, and excludes far-future ones', async ({ page }) => {
  const overdue = await dateOffset(page, -4);
  const today = await dateOffset(page, 0);
  const soon = await dateOffset(page, 2);
  const farFuture = await dateOffset(page, 30);

  await loadTasks(page, [
    row('1', 'Far future', { end: farFuture }),
    row('2', 'Due soon', { end: soon }),
    row('3', 'Overdue', { end: overdue }),
    row('4', 'Due today', { end: today }),
  ]);

  await page.click('#planMyDayBtn');
  await page.waitForTimeout(200);
  const html = await page.evaluate(() => document.getElementById('planMyDayRecommended').innerHTML);

  expect(html).not.toContain('Far future');
  const overdueIdx = html.indexOf('Overdue');
  const todayIdx = html.indexOf('Due today');
  const soonIdx = html.indexOf('Due soon');
  expect(overdueIdx).toBeGreaterThan(-1);
  expect(todayIdx).toBeGreaterThan(overdueIdx); // most overdue first
  expect(soonIdx).toBeGreaterThan(todayIdx); // then due-today, then upcoming
});

test('Recommended excludes parent rows, already-100% rows, rows with no End date, and already-pinned rows', async ({ page }) => {
  const overdue = await dateOffset(page, -1);
  await loadTasks(page, [
    row('1', 'Parent row', { end: overdue }),
    row('2', 'Child of parent', { end: overdue, parent: '1' }),
    row('3', 'Already complete', { end: overdue, pct: '100' }),
    row('4', 'No end date at all'),
    row('5', 'Genuinely recommendable', { end: overdue }),
  ]);
  await page.evaluate(() => toggleTodayPin('5'));

  await page.click('#planMyDayBtn');
  await page.waitForTimeout(200);
  const html = await page.evaluate(() => document.getElementById('planMyDayRecommended').innerHTML);

  expect(html).not.toContain('Parent row');
  expect(html).toContain('Child of parent'); // the leaf child itself is still a valid candidate
  expect(html).not.toContain('Already complete');
  expect(html).not.toContain('No end date at all');
  expect(html).not.toContain('Genuinely recommendable'); // already pinned -> belongs in Today's Plan, not repeated here
});

test('more than the visible cap shows a "show more" link, which reveals the rest', async ({ page }) => {
  const overdue = await dateOffset(page, -1);
  await loadTasks(page, [
    row('1', 'Task One', { end: overdue }),
    row('2', 'Task Two', { end: overdue }),
    row('3', 'Task Three', { end: overdue }),
    row('4', 'Task Four', { end: overdue }),
    row('5', 'Task Five', { end: overdue }),
  ]);

  await page.click('#planMyDayBtn');
  await page.waitForTimeout(200);
  let html = await page.evaluate(() => document.getElementById('planMyDayRecommended').innerHTML);
  expect(html).not.toContain('Task Four');
  expect(html).toContain('Showing 3 of 5');

  await page.evaluate(() => expandPlanMyDayRecommended());
  await page.waitForTimeout(200);
  html = await page.evaluate(() => document.getElementById('planMyDayRecommended').innerHTML);
  expect(html).toContain('Task Four');
  expect(html).toContain('Task Five');
});

test('clicking "+" on a Recommended card pins it into Today\'s Plan', async ({ page }) => {
  const overdue = await dateOffset(page, -1);
  await loadTasks(page, [row('1', 'Pin me', { end: overdue })]);

  await page.click('#planMyDayBtn');
  await page.waitForTimeout(200);
  await page.locator('#planMyDayRecommended span[onclick*="toggleTodayPin"]').click();
  await page.waitForTimeout(200);

  const ids = await page.evaluate(() => appDB.projects[appDB.activeId].today);
  expect(ids).toEqual(['1']);
  const todayHtml = await page.evaluate(() => document.getElementById('planMyDayTodayList').innerHTML);
  expect(todayHtml).toContain('Pin me');
});

test('the grid\'s own ★ pin toggle and the drawer stay in sync both ways', async ({ page }) => {
  await loadTasks(page, [row('1', 'Task A'), row('2', 'Task B')]);
  await page.click('#planMyDayBtn');
  await page.waitForTimeout(200);

  // Pin from the grid directly
  await page.locator('.today-pin-toggle').first().click();
  await page.waitForTimeout(200);
  let todayHtml = await page.evaluate(() => document.getElementById('planMyDayTodayList').innerHTML);
  expect(todayHtml).toContain('Task A');

  // Unpin from the drawer's own remove ("✕") control
  await page.locator('#planMyDayTodayList span[title="Remove from today\'s plan"]').click();
  await page.waitForTimeout(200);
  const ids = await page.evaluate(() => appDB.projects[appDB.activeId].today);
  expect(ids).toEqual([]);
  const pinColor = await page.evaluate(() => sheet.records[0][0].querySelector('.today-pin-toggle').style.color);
  expect(pinColor).not.toBe('rgb(14, 165, 233)'); // back to the unpinned gray
});

test('checking a pinned task off sets % Done to 100 in the grid, strikes it through, and it is a single Undo step', async ({ page }) => {
  await loadTasks(page, [row('1', 'Finish this', { pct: '40' })]);
  await page.evaluate(() => toggleTodayPin('1'));
  await page.click('#planMyDayBtn');
  await page.waitForTimeout(200);

  await page.evaluate(() => markTodayTaskComplete('1'));
  await page.waitForTimeout(300);

  const pct = await page.evaluate(() => sheet.getData()[0][COL.PCT]);
  expect(pct).toBe('100');
  const todayHtml = await page.evaluate(() => document.getElementById('planMyDayTodayList').innerHTML);
  expect(todayHtml).toContain('text-decoration:line-through');
  expect(todayHtml).toContain('Marked complete');

  await expect(page.locator('#btnUndo')).toBeEnabled();
  await page.click('#btnUndo');
  await page.waitForTimeout(300);
  const reverted = await page.evaluate(() => sheet.getData()[0][COL.PCT]);
  expect(reverted).toBe('40');
});

test('the 📝/+ notes icon opens the task\'s real Notes modal, and editing there updates the icon after save', async ({ page }) => {
  await loadTasks(page, [row('1', 'Needs notes')]);
  await page.evaluate(() => toggleTodayPin('1'));
  await page.click('#planMyDayBtn');
  await page.waitForTimeout(200);

  let todayHtml = await page.evaluate(() => document.getElementById('planMyDayTodayList').innerHTML);
  expect(todayHtml).toContain('title="Add notes"');

  await page.locator('#planMyDayTodayList span[title="Add notes"]').click();
  await expect(page.locator('#notesModal')).toHaveClass(/active/);
  await expect(page.locator('#notesModalTitle')).toHaveText('Notes — Needs notes');

  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', 'Waiting on design review.');
  await page.click('#notesSaveBtn');
  await page.click('#notesModal button:has-text("Close")');
  await page.waitForTimeout(200);

  todayHtml = await page.evaluate(() => document.getElementById('planMyDayTodayList').innerHTML);
  expect(todayHtml).toContain('title="View/edit notes"');

  const stored = await page.evaluate(() => sheet.getData()[0][COL.NOTES]);
  expect(stored).toBe('Waiting on design review.');
});

test('the today list is per-project -- switching projects shows a different pinned set', async ({ page }) => {
  await loadTasks(page, [row('1', 'Project A task')]);
  await page.evaluate(() => toggleTodayPin('1'));

  page.once('dialog', (d) => d.accept('Second Project'));
  await page.evaluate(() => createNewProject());
  await loadTasks(page, [row('1', 'Project B task')]);

  await page.click('#planMyDayBtn');
  await page.waitForTimeout(200);
  await expect(page.locator('#planMyDayBadge')).toBeHidden(); // nothing pinned in this fresh project

  const ids = await page.evaluate(() => appDB.projects[appDB.activeId].today);
  expect(ids).toEqual([]);
});

test('the today list survives a reload, per project', async ({ page }) => {
  await loadTasks(page, [row('1', 'Persisted pin')]);
  await page.evaluate(() => toggleTodayPin('1'));
  await page.waitForTimeout(300);

  await page.reload();
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);

  const ids = await page.evaluate(() => appDB.projects[appDB.activeId].today);
  expect(ids).toEqual(['1']);
  await expect(page.locator('#planMyDayBadge')).toHaveText('1');
});

test('the today list is never part of CSV export', async ({ page }) => {
  await loadTasks(page, [row('1', 'Pinned task')]);
  await page.evaluate(() => toggleTodayPin('1'));
  await page.waitForTimeout(200);

  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers).not.toContain('Today');
  expect(headers).not.toContain('today');
});

test('the today list is never carried into a Dropbox backup\'s meta.json', async ({ page }) => {
  await loadTasks(page, [row('1', 'Pinned task')]);
  await page.evaluate(() => toggleTodayPin('1'));
  await page.waitForTimeout(200);

  const metaContents = await page.evaluate(() => {
    return new Promise((resolve) => {
      dbx = {
        filesUpload: (opts) => {
          if (opts.path.endsWith('meta.json')) resolve(opts.contents);
          return Promise.resolve();
        },
        filesListFolder: () => Promise.resolve({ result: { entries: [], has_more: false } }),
      };
      backupToDropbox(false);
    });
  });

  const meta = JSON.parse(metaContents);
  expect(meta.today).toBeUndefined();
});

test('pinning/unpinning never changes the underlying task data', async ({ page }) => {
  await loadTasks(page, [row('1', 'Untouched'), row('2', 'Also untouched')]);
  const before = await page.evaluate(() => sheet.getData());

  await page.evaluate(() => toggleTodayPin('1'));
  await page.evaluate(() => toggleTodayPin('2'));
  await page.evaluate(() => toggleTodayPin('1'));
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => sheet.getData());
  expect(after).toEqual(before);
});
