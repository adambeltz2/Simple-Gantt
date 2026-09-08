// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #23: Markdown task-list checkboxes in Notes. Extends the
// shared renderNotesMarkdown() renderer (index.html) so a line starting
// with "- [ ]" renders as an unchecked checkbox and "- [x]" (or "- [X]")
// as a checked/completed item, instead of a plain bullet. Since task-level
// Notes (backlog #22, tests/task-notes.spec.js) and the project-level
// Notes field (backlog #19b, tests/project-notes.spec.js) already share
// this one renderer, exercising it through the task-Notes modal here
// covers both surfaces. Read-only rendering only, per the item's own
// scope -- clicking a rendered checkbox does not toggle the underlying
// Markdown; the raw text is still edited via the existing Edit textarea.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12 };

async function notesFlag(page, row) {
  const handle = await page.evaluateHandle(
    ([c, y]) => sheet.records[y][c].querySelector('.notes-flag'),
    [COL.NOTES, row]
  );
  return handle.asElement();
}

test('an unchecked task item renders as a disabled, unchecked checkbox', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', '- [ ] Buy milk');
  await page.click('#notesSaveBtn');

  const checkbox = page.locator('#notesBody input[type="checkbox"]');
  await expect(checkbox).toHaveCount(1);
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeDisabled();
  await expect(page.locator('#notesBody li')).toContainText('Buy milk');
});

test('a checked task item ("- [x]") renders checked, and "[X]" is accepted too', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', '- [x] Buy milk\n- [X] Walk the dog');
  await page.click('#notesSaveBtn');

  const checkboxes = page.locator('#notesBody input[type="checkbox"]');
  await expect(checkboxes).toHaveCount(2);
  await expect(checkboxes.nth(0)).toBeChecked();
  await expect(checkboxes.nth(1)).toBeChecked();
});

test('a checked item is visually struck through; an unchecked one is not', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', '- [x] Done thing\n- [ ] Not done thing');
  await page.click('#notesSaveBtn');

  const spans = page.locator('#notesBody li span');
  await expect(spans.nth(0)).toHaveCSS('text-decoration-line', 'line-through');
  await expect(spans.nth(1)).not.toHaveCSS('text-decoration-line', 'line-through');
});

test('task items mix with a plain bullet list without losing either', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', '- Plain bullet\n- [ ] Task item');
  await page.click('#notesSaveBtn');

  await expect(page.locator('#notesBody li')).toHaveCount(2);
  await expect(page.locator('#notesBody input[type="checkbox"]')).toHaveCount(1);
});

test('a bare "[ ]"/"[x]" without a leading bullet marker stays plain text, not a checkbox', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', 'Reminder: [ ] not a task list line');
  await page.click('#notesSaveBtn');

  await expect(page.locator('#notesBody input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator('#notesBody')).toContainText('Reminder: [ ] not a task list line');
});

test('inline formatting still works inside a task item\'s text', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', '- [ ] Review the **draft** and see [spec](https://example.com)');
  await page.click('#notesSaveBtn');

  await expect(page.locator('#notesBody li strong')).toHaveText('draft');
  await expect(page.locator('#notesBody li a')).toHaveAttribute('href', 'https://example.com');
});

test('raw Markdown round-trips through Edit unchanged (checkbox state is not writable from the rendered view)', async ({ page }) => {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', '- [ ] Buy milk\n- [x] Walk the dog');
  await page.click('#notesSaveBtn');

  const stored = await page.evaluate((c) => sheet.getData()[0][c], COL.NOTES);
  expect(stored).toBe('- [ ] Buy milk\n- [x] Walk the dog');

  await page.click('#notesEditBtn');
  await expect(page.locator('#notesEditTextarea')).toHaveValue('- [ ] Buy milk\n- [x] Walk the dog');
});
