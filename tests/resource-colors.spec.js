// @ts-check
const { test, expect } = require('@playwright/test');

// Covers resource color-coding on the Gantt bars: a deterministic
// alphabetical name -> color mapping, a thin left-edge stripe appended to
// each qualifying bar (skipping milestones and unassigned tasks), the
// first-listed resource winning the color for multi-resource tasks, and a
// matching resource/color section appended to the chart legend.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(500);
});

async function loadTasks(page, rows) {
  await page.evaluate((rows) => {
    appDB.projects[appDB.activeId].data = rows;
    renderGrid(rows);
    syncToGantt(true);
  }, rows);
  await page.waitForTimeout(300);
}

test('a task with one resource gets a colored stripe on its bar', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '2', '2026-08-25', '', ''],
  ]);

  const wrapper = page.locator('.bar-wrapper[data-id="1"]');
  const stripe = wrapper.locator('rect.resource-stripe');
  await expect(stripe).toHaveCount(1);
  const fill = await stripe.getAttribute('fill');
  expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
});

test('an unassigned task gets no stripe', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '', '', '0', '2026-08-24', '2', '2026-08-25', '', ''],
  ]);

  const wrapper = page.locator('.bar-wrapper[data-id="1"]');
  await expect(wrapper.locator('rect.resource-stripe')).toHaveCount(0);
});

test('a milestone (0-duration task) gets no stripe even if assigned', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Kickoff', 'Alice', '100', '0', '2026-08-24', '0', '2026-08-24', '', ''],
  ]);

  const wrapper = page.locator('.bar-wrapper[data-id="1"]');
  await expect(wrapper).toHaveClass(/is-milestone/);
  await expect(wrapper.locator('rect.resource-stripe')).toHaveCount(0);
});

test('a multi-resource task is striped with the first-listed resource\'s color', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Bob (50%), Alice (50%)', '100', '0', '2026-08-24', '2', '2026-08-25', '', ''],
  ]);

  // Only the first-listed resource (Bob) should ever enter the color map --
  // Alice, second-listed, must not appear in the legend or get a color slot.
  const stripeColor = await page.locator('.bar-wrapper[data-id="1"] rect.resource-stripe').getAttribute('fill');
  const expectedColor = await page.evaluate(() => getResourceColorMap([{ _assignments: [{ name: 'Bob', alloc: 50 }] }])['Bob']);
  expect(stripeColor).toBe(expectedColor);

  const legendLabels = await page.locator('#ganttLegend .legend-item').allTextContents();
  expect(legendLabels.map((s) => s.trim())).toContain('Bob');
  expect(legendLabels.map((s) => s.trim())).not.toContain('Alice');
});

test('the same resource name always gets the same color, regardless of row order', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Zoe', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
    ['2', '1', 'Task B', 'Alice', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''],
  ]);
  const colorAlice1 = await page.locator('.bar-wrapper[data-id="2"] rect.resource-stripe').getAttribute('fill');

  // Reload with the rows reversed -- the alphabetical mapping should be stable.
  await loadTasks(page, [
    ['2', '1', 'Task B', 'Alice', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''],
    ['1', '1', 'Task A', 'Zoe', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);
  const colorAlice2 = await page.locator('.bar-wrapper[data-id="2"] rect.resource-stripe').getAttribute('fill');

  expect(colorAlice1).toBe(colorAlice2);
});

test('two different resources get two different colors', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Alice', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
    ['2', '1', 'Task B', 'Bob', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''],
  ]);

  const colorA = await page.locator('.bar-wrapper[data-id="1"] rect.resource-stripe').getAttribute('fill');
  const colorB = await page.locator('.bar-wrapper[data-id="2"] rect.resource-stripe').getAttribute('fill');
  expect(colorA).not.toBe(colorB);
});

test('the legend lists resources alphabetically with matching swatch colors', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', 'Zoe', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
    ['2', '1', 'Task B', 'Alice', '100', '0', '2026-08-25', '1', '2026-08-25', '', ''],
  ]);

  const legendLabels = await page.locator('#ganttLegend .legend-item').allTextContents();
  const trimmed = legendLabels.map((s) => s.trim());
  // Status legend items come first, then a separator, then resources (alphabetical).
  expect(trimmed.slice(-2)).toEqual(['Alice', 'Zoe']);

  await expect(page.locator('#ganttLegend .legend-sep')).toHaveCount(1);

  const aliceSwatchColor = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#ganttLegend .legend-item'));
    const aliceItem = items.find((el) => el.textContent.trim() === 'Alice');
    return aliceItem.querySelector('.swatch').style.background;
  });
  const aliceStripeColor = await page.locator('.bar-wrapper[data-id="2"] rect.resource-stripe').getAttribute('fill');
  // style.background normalizes hex to rgb(); compare via a throwaway element.
  const normalized = await page.evaluate((hex) => {
    const el = document.createElement('div');
    el.style.background = hex;
    return el.style.background;
  }, aliceStripeColor);
  expect(aliceSwatchColor).toBe(normalized);
});

test('no legend separator or resource entries when no task has an assigned resource', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '', '', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);

  await expect(page.locator('#ganttLegend .legend-sep')).toHaveCount(0);
  const legendLabels = await page.locator('#ganttLegend .legend-item').allTextContents();
  expect(legendLabels.map((s) => s.trim())).not.toContain('Task A');
});

test('resource names with special characters render safely in the legend (no HTML injection)', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Task A', '<b>Eve</b>', '100', '0', '2026-08-24', '1', '2026-08-24', '', ''],
  ]);

  await expect(page.locator('#ganttLegend b')).toHaveCount(0);
  const legendLabels = await page.locator('#ganttLegend .legend-item').allTextContents();
  expect(legendLabels.some((s) => s.includes('<b>Eve</b>'))).toBe(true);
});

test('no uncaught JS errors when rendering resource stripes and legend', async ({ page }) => {
  await loadTasks(page, [
    ['1', '1', 'Parent', '', '', '0', '', '', '', '', ''],
    ['2', '1.1', 'Kickoff', 'Alice', '100', '0', '2026-08-24', '0', '2026-08-24', '', '1'],
    ['3', '1.2', 'Build', 'Bob (50%), Charlie (50%)', '100', '0', '2026-08-24', '2', '2026-08-25', '', '1'],
    ['4', '1.3', 'Ship', '', '', '0', '2026-08-26', '1', '2026-08-26', '', '1'],
  ]);

  expect(page.consoleErrors).toEqual([]);
});
