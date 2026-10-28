// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #32 Slice 2: the Kanban board view itself and card
// drag-and-drop, on top of Slice 1's Topic/Lane columns and registries.
//
// Topics are tabs (one shown at a time, in the registry's own order, with a
// trailing "Uncategorized" catch-all always present); Lanes are the board's
// columns, left to right, within whichever Topic is selected ("Unsorted"
// first, then the registry's own order). Topic/Lane ordering itself (the
// ▲/▼ reorder controls, append-not-alphabetize on add/rename) is covered in
// tests/named-topics.spec.js and tests/named-lanes.spec.js -- this file
// just confirms the board renders whatever order those registries hold.
// Only leaf tasks become cards -- the same exclusion the Workload dashboard
// and Critical Path already apply.
//
// Mutation (moveCardToLane) is deliberately isolated from interaction and
// gets the bulk of coverage here, called directly with no synthetic drag
// events involved; a couple of real HTML5 drag-and-drop tests at the bottom
// cover the interaction layer itself, mirroring the split this app's
// fill-handle bug fix settled on after learning pixel-level drag simulation
// is the wrong thing to lean on for test coverage.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12, STATUS: 13, TOPIC: 14, LANE: 15 };

function row(overrides) {
  const r = Array(16).fill('');
  Object.assign(r, overrides);
  return r;
}

async function loadBoard(page, rows, extra) {
  await page.evaluate(({ rows, extra }) => {
    appDB.projects[appDB.activeId].data = rows;
    appDB.projects[appDB.activeId].topics = (extra && extra.topics) || [];
    appDB.projects[appDB.activeId].lanes = (extra && extra.lanes) || [];
    appDB.projects[appDB.activeId].resources = (extra && extra.resources) || [];
    appDB.projects[appDB.activeId].collapsed = [];
    renderGrid(rows);
    syncToGantt(true);
  }, { rows, extra });
  await page.waitForTimeout(300);
}

// Same relative-to-"today" pattern tests/plan-my-day.spec.js uses, so an
// Overdue/Due-today assertion never goes stale as real time passes.
async function dateOffset(page, n) {
  return page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return format(d);
  }, n);
}

async function openBoard(page) {
  await page.click('#btnKanbanView');
  await page.waitForTimeout(200);
}

function cardTexts(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.kanban-card')).map((c) => c.textContent));
}

function laneNames(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.kanban-lane')).map((l) => l.dataset.lane));
}

function tabNames(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.kanban-topic-tab')).map((t) => t.textContent));
}

test.beforeEach(async ({ page }) => {
  await loadBoard(
    page,
    [
      row({ [COL.ID]: '1', [COL.OUTLINE]: '1', [COL.NAME]: 'Parent', [COL.PCT]: '0' }),
      row({ [COL.ID]: '2', [COL.OUTLINE]: '1.1', [COL.NAME]: 'Build API', [COL.PARENT]: '1', [COL.PCT]: '0', [COL.TOPIC]: 'Backend', [COL.LANE]: 'To Do' }),
      row({ [COL.ID]: '3', [COL.OUTLINE]: '2', [COL.NAME]: 'Build UI', [COL.RESOURCE]: 'Alice', [COL.PCT]: '50', [COL.TOPIC]: 'Frontend', [COL.LANE]: 'In Progress' }),
      row({ [COL.ID]: '4', [COL.OUTLINE]: '3', [COL.NAME]: 'No topic yet', [COL.PCT]: '0' }),
    ],
    { topics: ['Backend', 'Frontend'], lanes: ['To Do', 'In Progress', 'Done'], resources: ['Alice'] }
  );
});

test('the Kanban toolbar button shows the board and hides the Grid/Chart workspace', async ({ page }) => {
  await expect(page.locator('#kanbanPanel')).toHaveCSS('display', 'none');
  await openBoard(page);
  await expect(page.locator('#kanbanPanel')).toHaveCSS('display', 'flex');
  const workspaceDisplay = await page.evaluate(() => document.querySelector('.workspace').style.display);
  expect(workspaceDisplay).toBe('none');
});

test('clicking Grid/Split/Chart exits the Kanban board back to the workspace', async ({ page }) => {
  await openBoard(page);
  await page.click('button[onclick="snapPanes(55)"]');
  await page.waitForTimeout(100);
  await expect(page.locator('#kanbanPanel')).toHaveCSS('display', 'none');
  const workspaceDisplay = await page.evaluate(() => document.querySelector('.workspace').style.display);
  expect(workspaceDisplay).toBe('flex');
});

test('Topic tabs default to the first registered tab, with a trailing "Uncategorized" always present', async ({ page }) => {
  await openBoard(page);
  expect(await tabNames(page)).toEqual(['Backend', 'Frontend', 'Uncategorized']);
  const active = await page.locator('.kanban-topic-tab.active').textContent();
  expect(active).toBe('Backend');
});

test('Topic tabs render in the registry\'s own order, not alphabetized', async ({ page }) => {
  // Reordered to the opposite of alphabetical -- an alphabetized tab order
  // would still read Backend, Frontend; the registry's own order doesn't.
  await page.evaluate(() => { appDB.projects[appDB.activeId].topics = ['Frontend', 'Backend']; });
  await openBoard(page);
  expect(await tabNames(page)).toEqual(['Frontend', 'Backend', 'Uncategorized']);
});

test('clicking a Topic tab switches which cards are shown', async ({ page }) => {
  await openBoard(page);
  await page.click('.kanban-topic-tab:has-text("Frontend")');
  await page.waitForTimeout(100);
  const texts = (await cardTexts(page)).join(' ');
  expect(texts).toContain('Build UI');
  expect(texts).not.toContain('Build API');
});

test('Lane columns render as "Unsorted" first, then the registry order, left to right', async ({ page }) => {
  await openBoard(page);
  expect(await laneNames(page)).toEqual(['Unsorted', 'To Do', 'In Progress', 'Done']);
});

test('only leaf tasks become cards -- a parent row never shows up on the board', async ({ page }) => {
  await openBoard(page);
  const texts = (await cardTexts(page)).join(' ');
  expect(texts).not.toContain('Parent');
});

test('a task with no Topic set lands under the Uncategorized tab, in the Unsorted lane', async ({ page }) => {
  await openBoard(page);
  await page.click('.kanban-topic-tab:has-text("Uncategorized")');
  await page.waitForTimeout(100);
  const texts = (await cardTexts(page)).join(' ');
  expect(texts).toContain('No topic yet');
});

test('an orphaned Topic value (deleted from the registry) falls back to Uncategorized instead of vanishing', async ({ page }) => {
  await page.evaluate((COL) => {
    const data = sheet.getData();
    data[3][COL.TOPIC] = 'Ghost Topic'; // not in the topics registry
    sheet.setValueFromCoords(COL.TOPIC, 3, 'Ghost Topic', true);
  }, COL);
  await page.waitForTimeout(200);
  await openBoard(page);
  await page.click('.kanban-topic-tab:has-text("Uncategorized")');
  await page.waitForTimeout(100);
  const texts = (await cardTexts(page)).join(' ');
  expect(texts).toContain('No topic yet');
});

test('a card shows its Resource and % Done', async ({ page }) => {
  await openBoard(page);
  await page.click('.kanban-topic-tab:has-text("Frontend")');
  await page.waitForTimeout(100);
  const card = page.locator('.kanban-card', { hasText: 'Build UI' });
  await expect(card).toContainText('Alice');
  await expect(card).toContainText('50%');
});

test('a card shows a "Blocked by" badge when its Depends task is not yet 100% done', async ({ page }) => {
  await page.evaluate((COL) => {
    const data = sheet.getData();
    data[1][COL.DEP] = '3'; // "Build API" now depends on "Build UI" (50% done)
    sheet.setValueFromCoords(COL.DEP, 1, '3', true);
  }, COL);
  await page.waitForTimeout(200);
  await openBoard(page);
  const card = page.locator('.kanban-card', { hasText: 'Build API' });
  await expect(card).toContainText('Blocked by 1');
});

test('an overdue card (past End, not 100% done) shows an Overdue badge', async ({ page }) => {
  const overdue = await dateOffset(page, -5);
  await page.evaluate(({ COL, overdue }) => {
    const data = sheet.getData();
    data[1][COL.END] = overdue;
    sheet.setValueFromCoords(COL.END, 1, overdue, true);
  }, { COL, overdue });
  await page.waitForTimeout(200);
  await openBoard(page);
  const card = page.locator('.kanban-card', { hasText: 'Build API' });
  await expect(card).toContainText('Overdue');
});

test('clicking a card opens the existing Detail Card modal for that task', async ({ page }) => {
  await openBoard(page);
  await page.click('.kanban-card:has-text("Build API")');
  await expect(page.locator('#detailCardModal')).toHaveClass(/active/);
  await expect(page.locator('#detailCardTaskName')).toHaveText('Build API');
});

test('Structured Filters (Resource) hide a card the same way they hide a grid row', async ({ page }) => {
  await page.evaluate(() => { appDB.projects[appDB.activeId].resources = ['Alice', 'Bob']; });
  await openBoard(page);
  await page.click('.kanban-topic-tab:has-text("Frontend")');
  await page.waitForTimeout(100);
  expect((await cardTexts(page)).join(' ')).toContain('Build UI');

  await page.click('#filtersBtn');
  await page.locator('.resourceFilterCheckbox[value="Bob"]').check();
  await page.waitForTimeout(200);

  const texts = (await cardTexts(page)).join(' ');
  expect(texts).not.toContain('Build UI'); // only assigned to Alice, filter narrowed to Bob
});

test('collapsing a parent in the Grid does not hide its leaf child\'s Kanban card', async ({ page }) => {
  await page.evaluate(() => toggleCollapse('1'));
  await page.waitForTimeout(200);
  const gridHidden = await page.evaluate(() => sheet.rows[1].style.display === 'none');
  expect(gridHidden).toBe(true); // the child row really is hidden in the grid by the collapse

  await openBoard(page);
  const texts = (await cardTexts(page)).join(' ');
  expect(texts).toContain('Build API'); // child of the now-collapsed "Parent", still a card
});

test('moveCardToLane() writes the Lane cell and triggers exactly one Undo step', async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => moveCardToLane('3', 'Done'));
  await page.waitForTimeout(200);

  const lane = await page.evaluate((COL) => sheet.getData()[2][COL.LANE], COL);
  expect(lane).toBe('Done');

  const undoDisabled = await page.evaluate(() => document.getElementById('btnUndo').disabled);
  expect(undoDisabled).toBe(false);
  await page.click('#btnUndo');
  const reverted = await page.evaluate((COL) => sheet.getData()[2][COL.LANE], COL);
  expect(reverted).toBe('In Progress');
});

test('moveCardToLane() to "Unsorted" clears the Lane cell back to blank', async ({ page }) => {
  await page.evaluate(() => moveCardToLane('3', 'Unsorted'));
  await page.waitForTimeout(200);
  const lane = await page.evaluate((COL) => sheet.getData()[2][COL.LANE], COL);
  expect(lane).toBe('');
});

test('moveCardToLane() onto the lane a card is already in is a no-op -- no new Undo step', async ({ page }) => {
  const before = await page.evaluate(() => appDB.projects[appDB.activeId].data.length);
  await page.evaluate(() => moveCardToLane('3', 'In Progress')); // already there
  await page.waitForTimeout(200);
  const undoDisabled = await page.evaluate(() => document.getElementById('btnUndo').disabled);
  expect(undoDisabled).toBe(true); // nothing to undo -- the write was skipped
});

test('moveCardToLane() on an unknown task ID is a safe no-op', async ({ page }) => {
  await expect(page.evaluate(() => moveCardToLane('does-not-exist', 'Done'))).resolves.not.toThrow();
});

test('a lane header shows the count of cards currently in it', async ({ page }) => {
  await openBoard(page);
  await page.click('.kanban-topic-tab:has-text("Frontend")');
  await page.waitForTimeout(100);
  const count = await page.locator('.kanban-lane[data-lane="In Progress"] .kanban-lane-count').textContent();
  expect(count).toBe('1');
});

test('an empty lane shows a "No cards" placeholder instead of looking broken', async ({ page }) => {
  await openBoard(page);
  await page.click('.kanban-topic-tab:has-text("Frontend")');
  await page.waitForTimeout(100);
  await expect(page.locator('.kanban-lane[data-lane="Done"]')).toContainText('No cards');
});

// --- Real HTML5 drag-and-drop smoke tests (interaction layer only; the
// mutation layer above is where the real coverage lives) ---

test('dragging a card from one lane and dropping it on another moves it there', async ({ page }) => {
  await openBoard(page);
  await page.click('.kanban-topic-tab:has-text("Frontend")');
  await page.waitForTimeout(100);

  const card = page.locator('.kanban-card', { hasText: 'Build UI' });
  const targetLane = page.locator('.kanban-lane[data-lane="Done"] .kanban-cards');
  await card.dragTo(targetLane);
  await page.waitForTimeout(300);

  const lane = await page.evaluate((COL) => sheet.getData()[2][COL.LANE], COL);
  expect(lane).toBe('Done');
});

test('dragging a card and dropping it back on its own lane leaves it unchanged', async ({ page }) => {
  await openBoard(page);
  await page.click('.kanban-topic-tab:has-text("Frontend")');
  await page.waitForTimeout(100);

  const card = page.locator('.kanban-card', { hasText: 'Build UI' });
  const sameLane = page.locator('.kanban-lane[data-lane="In Progress"] .kanban-cards');
  await card.dragTo(sameLane);
  await page.waitForTimeout(300);

  const lane = await page.evaluate((COL) => sheet.getData()[2][COL.LANE], COL);
  expect(lane).toBe('In Progress');
});
