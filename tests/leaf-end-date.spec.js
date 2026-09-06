// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #18: typing an explicit End date directly on a leaf task
// (no children), instead of only ever deriving it from Duration.
//
// - A parent task's End stays exactly as it always was: read-only, driven
//   purely by the rollup of its children's dates -- never hand-entered.
// - A leaf task's End is directly editable. Typing one back-solves Duration
//   from Start using calculateWorkingDays() (the same inverse of
//   calculateEndDate() parent rollup already relies on), so Start/Duration/
//   End stay internally consistent.
// - The edit still flows through the normal syncToGantt() pipeline -- the
//   same dependency-successor and parent-rollup passes "Sync Dependencies"
//   runs -- so it cascades down to dependents and up to parents with no
//   separate propagation logic.
// - CSV import gets the same treatment: an imported leaf row's End is
//   honored (Duration back-solved from it) rather than silently overwritten
//   by the forced Start+Duration -> End recompute import already runs.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  // Weekends off, same reasoning as the other date-math specs: Mon-start day
  // math shouldn't be sensitive to which day of the week "today" happens to be.
  await page.evaluate(() => { document.getElementById('skipWeekends').checked = false; });
});

async function loadTasks(page, rows) {
  await page.evaluate((rows) => {
    appDB.projects[appDB.activeId].data = rows;
    renderGrid(rows);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

test('typing an End date on a leaf task back-solves Duration, keeping Start/Duration/End consistent', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Leaf Task', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);

  await page.evaluate((COL) => sheet.setValueFromCoords(COL.END, 0, '2026-08-28', true), COL);
  await page.waitForTimeout(300);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.END]).toBe('2026-08-28');
  expect(parseInt(row[COL.DUR])).toBe(5); // Mon 24 - Fri 28 inclusive, calendar days since skipWeekends is off
});

test('editing Duration on a leaf task still forward-computes End as before (unaffected regression)', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Leaf Task', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);

  await page.evaluate((COL) => sheet.setValueFromCoords(COL.DUR, 0, '4', true), COL);
  await page.waitForTimeout(300);

  const row = await page.evaluate(() => sheet.getData()[0]);
  expect(parseInt(row[COL.DUR])).toBe(4); // numeric-type column preserves the raw '4' string jexcel was given -- app only ever consumes it via parseInt()
  expect(row[COL.END]).toBe('2026-08-27'); // Mon 24 + 3 more days = Thu 27
});

test('a parent task\'s End cell stays read-only and rollup-driven, never directly editable', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', ''],
    ['2', '1.1', 'Child One', 'Alice', '100', '0', '2026-08-24', '2', '2026-08-25', '', '1'],
    ['3', '1.2', 'Child Two', 'Bob', '100', '0', '2026-08-26', '1', '2026-08-26', '', '1'],
  ]);

  const isReadOnly = await page.evaluate(() => sheet.isReadOnly([8, 0])); // COL.END, row 0 (Parent)
  expect(isReadOnly).toBe(true);

  const parentRow = await page.evaluate(() => sheet.getData()[0]);
  expect(parentRow[COL.END]).toBe('2026-08-26'); // max of children's ends

  // A programmatic write to the parent's End (something the UI itself could
  // never do, since it's read-only) gets overwritten right back by the next
  // rollup pass -- the parent's End is never actually driven by its own cell.
  await page.evaluate((COL) => sheet.setValueFromCoords(COL.END, 0, '2026-09-15', true), COL);
  await page.waitForTimeout(300);
  const afterRow = await page.evaluate(() => sheet.getData()[0]);
  expect(afterRow[COL.END]).toBe('2026-08-26');
});

test('a leaf task\'s End cell is NOT read-only', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Leaf Task', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  const isReadOnly = await page.evaluate(() => sheet.isReadOnly([8, 0])); // COL.END, row 0
  expect(isReadOnly).toBe(false);
});

test('editing a leaf task\'s End cascades DOWN to a dependent successor\'s Start, same as Sync Dependencies would', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Predecessor', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
    ['2', '2', 'Successor', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '1', ''],
  ]);

  // Push task 1's End out three days by typing a new End directly.
  await page.evaluate((COL) => sheet.setValueFromCoords(COL.END, 0, '2026-08-27', true), COL);
  await page.waitForTimeout(300);

  const rows = await page.evaluate(() => sheet.getData());
  expect(rows[0][COL.END]).toBe('2026-08-27');
  expect(parseInt(rows[0][COL.DUR])).toBe(4); // Mon 24 - Thu 27 inclusive
  expect(rows[1][COL.START]).toBe('2026-08-28'); // the working day right after the new End
});

test('editing a leaf child\'s End cascades UP to the parent rollup, same as Sync Dependencies would', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', ''],
    ['2', '1.1', 'Child', 'Alice', '100', '0', '2026-08-24', '2', '2026-08-25', '', '1'],
  ]);

  await page.evaluate((COL) => sheet.setValueFromCoords(COL.END, 1, '2026-08-31', true), COL);
  await page.waitForTimeout(300);

  const rows = await page.evaluate(() => sheet.getData());
  expect(rows[1][COL.END]).toBe('2026-08-31');
  expect(parseInt(rows[1][COL.DUR])).toBe(8); // Mon 24 - Mon 31 inclusive, calendar days (skipWeekends is off)
  expect(rows[0][COL.END]).toBe('2026-08-31'); // parent rollup follows the child
  expect(parseInt(rows[0][COL.DUR])).toBe(8);
});

test('a task that gains a child stops being directly End-editable -- rollup takes back over', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Soon-to-be Parent', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  // Hand-type an End on it while it's still a leaf.
  await page.evaluate((COL) => sheet.setValueFromCoords(COL.END, 0, '2026-08-28', true), COL);
  await page.waitForTimeout(300);
  let row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.END]).toBe('2026-08-28');

  // Now give it a child.
  await page.evaluate((COL) => {
    const data = sheet.getData();
    data.push(['2', '', 'New Child', 'Bob', '100', '0', '2026-09-01', '1', '2026-09-01', '', '1']);
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  }, COL);
  await page.waitForTimeout(300);

  const isReadOnly = await page.evaluate(() => sheet.isReadOnly([8, 0]));
  expect(isReadOnly).toBe(true);
  row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.END]).toBe('2026-09-01'); // now driven by the child, not the earlier hand-typed value
});

test('a task that loses its last child becomes a leaf again, End editable and Duration-driven', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', ''],
    ['2', '1.1', 'Only Child', 'Alice', '100', '0', '2026-08-24', '3', '2026-08-26', '', '1'],
  ]);
  let row = await page.evaluate(() => sheet.getData()[0]);
  expect(row[COL.END]).toBe('2026-08-26');
  let isReadOnly = await page.evaluate(() => sheet.isReadOnly([8, 0]));
  expect(isReadOnly).toBe(true);

  // Un-parent the child.
  await page.evaluate((COL) => sheet.setValueFromCoords(COL.PARENT, 1, '', true), COL);
  await page.waitForTimeout(300);

  isReadOnly = await page.evaluate(() => sheet.isReadOnly([8, 0]));
  expect(isReadOnly).toBe(false);
  row = await page.evaluate(() => sheet.getData()[0]);
  // Now an ordinary leaf task, driven forward from whatever Start/Duration it
  // was left with by the last rollup (Start '2026-08-24', Duration 3) --
  // unchanged, since that's already self-consistent under the normal
  // Start+Duration -> End leaf computation.
  expect(row[COL.START]).toBe('2026-08-24');
  expect(parseInt(row[COL.DUR])).toBe(3);
  expect(row[COL.END]).toBe('2026-08-26');
});

test('CSV import honors an explicit End on a leaf task, back-solving Duration instead of overwriting it', async ({ page }) => {
  const csv = 'ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent,Labels\n' +
    '1,1,Imported Leaf,Alice,100,0,2026-08-24,1,2026-08-28,,,\n';

  await page.setInputFiles('#csvFile', {
    name: 'end-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.waitForTimeout(400);

  const row = await page.evaluate(() => sheet.getData().find((r) => r[0] === '1'));
  expect(row[COL.END]).toBe('2026-08-28'); // honored, not silently recomputed back to the file's own (wrong) Dur.=1
  expect(parseInt(row[COL.DUR])).toBe(5);
});

test('CSV import still ignores a parent row\'s own End value -- rollup always wins there', async ({ page }) => {
  const csv = 'ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent,Labels\n' +
    '1,1,Parent,,,0,2026-08-24,1,2026-12-31,,,\n' + // a bogus End that should never survive
    '2,1.1,Child,Alice,100,0,2026-08-24,2,2026-08-25,,1,\n';

  await page.setInputFiles('#csvFile', {
    name: 'parent-end-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.waitForTimeout(400);

  const parentRow = await page.evaluate(() => sheet.getData().find((r) => r[0] === '1'));
  expect(parentRow[COL.END]).toBe('2026-08-25'); // the child's End, not the CSV's bogus one
});
