// @ts-check
const { test, expect } = require('./fixtures');

// User-requested: Markdown code formatting in task and project Notes --
// "3 '`' on top and bottom would indicate code formatting" (a fenced code
// block), plus the natural companion single-backtick inline code span.
// Extends the shared renderNotesMarkdown() renderer (index.html), same one
// task-level Notes (tests/task-notes.spec.js) and the project-level Notes
// field (tests/project-notes.spec.js) already share -- exercised through
// the task-Notes modal here covers both surfaces, per the same precedent
// tests/notes-task-checkboxes.spec.js already established, plus one test
// through the Project Notes modal directly to confirm it really is shared.
//
// A fenced block takes precedence over everything else, same as real
// Markdown: no inline formatting and no block-level parsing (headings/
// bullets/numbered lists) applies to a line inside one -- rendered
// completely literally, only HTML-escaped for safety.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12 };

async function notesFlag(page, row) {
  const handle = await page.evaluateHandle(
    ([c, y]) => sheet.records[y][c].querySelector('.notes-flag'),
    [COL.NOTES, row]
  );
  return handle.asElement();
}

async function setNotesAndSave(page, markdown) {
  const flag = await notesFlag(page, 0);
  await flag.click();
  await page.click('#notesEditBtn');
  await page.fill('#notesEditTextarea', markdown);
  await page.click('#notesSaveBtn');
}

test('a fenced code block renders as <pre><code>', async ({ page }) => {
  await setNotesAndSave(page, '```\nconst x = 1;\n```');

  await expect(page.locator('#notesBody pre code')).toHaveCount(1);
  await expect(page.locator('#notesBody pre code')).toHaveText('const x = 1;');
});

test('a fenced code block with a language tag still renders as a plain code block', async ({ page }) => {
  await setNotesAndSave(page, '```js\nconst x = 1;\n```');

  await expect(page.locator('#notesBody pre code')).toHaveText('const x = 1;');
});

test('markdown syntax inside a fenced code block is not interpreted', async ({ page }) => {
  await setNotesAndSave(page, '```\n**not bold**\n- not a bullet\n# not a heading\n```');

  const codeText = await page.locator('#notesBody pre code').innerText();
  expect(codeText).toContain('**not bold**');
  expect(codeText).toContain('- not a bullet');
  expect(codeText).toContain('# not a heading');
  await expect(page.locator('#notesBody strong')).toHaveCount(0);
  await expect(page.locator('#notesBody h1')).toHaveCount(0);
  await expect(page.locator('#notesBody li')).toHaveCount(0);
});

test('a multi-line fenced code block preserves line breaks', async ({ page }) => {
  await setNotesAndSave(page, '```\nline one\nline two\nline three\n```');

  const codeText = await page.locator('#notesBody pre code').innerText();
  expect(codeText.split('\n').map((l) => l.trim())).toEqual(['line one', 'line two', 'line three']);
});

test('a fenced code block is HTML-escaped, not executed', async ({ page }) => {
  let dialogFired = false;
  page.on('dialog', (d) => { dialogFired = true; d.dismiss(); });

  await setNotesAndSave(page, '```\n<script>alert(1)</script>\n```');
  await page.waitForTimeout(200);

  expect(dialogFired).toBe(false);
  await expect(page.locator('#notesBody pre code')).toContainText('<script>alert(1)</script>');
  await expect(page.locator('#notesBody script')).toHaveCount(0);
});

test('normal Markdown parsing resumes after the closing fence', async ({ page }) => {
  await setNotesAndSave(page, 'Before\n```\ncode here\n```\n**after, bold**');

  await expect(page.locator('#notesBody pre code')).toHaveText('code here');
  await expect(page.locator('#notesBody strong')).toHaveText('after, bold');
});

test('an unterminated fence still renders whatever it captured, without crashing', async ({ page }) => {
  await setNotesAndSave(page, 'Before\n```\nunterminated code');

  await expect(page.locator('#notesBody pre code')).toContainText('unterminated code');
});

test('inline code (single backticks) renders as <code>, separate from a fenced block', async ({ page }) => {
  await setNotesAndSave(page, 'Run `npm install` to set up.');

  await expect(page.locator('#notesBody code')).toHaveText('npm install');
  await expect(page.locator('#notesBody pre')).toHaveCount(0);
});

test('bold/italic markers inside inline code are not reformatted', async ({ page }) => {
  await setNotesAndSave(page, 'See `**not bold** and *not italic*` here.');

  await expect(page.locator('#notesBody code')).toHaveText('**not bold** and *not italic*');
  await expect(page.locator('#notesBody strong')).toHaveCount(0);
  await expect(page.locator('#notesBody em')).toHaveCount(0);
});

test('inline code composes with plain text and bold on the same line', async ({ page }) => {
  await setNotesAndSave(page, 'The **key** setting is `DEBUG=true` by default.');

  await expect(page.locator('#notesBody strong')).toHaveText('key');
  await expect(page.locator('#notesBody code')).toHaveText('DEBUG=true');
});

test('the raw Markdown round-trips through Edit unchanged', async ({ page }) => {
  const raw = '```\nconst x = 1;\n```\n\nSee `DEBUG=true`.';
  await setNotesAndSave(page, raw);

  const stored = await page.evaluate((c) => sheet.getData()[0][c], COL.NOTES);
  expect(stored).toBe(raw);

  await page.click('#notesEditBtn');
  await expect(page.locator('#notesEditTextarea')).toHaveValue(raw);
});

test('the Project Notes modal renders code formatting too (same shared renderer)', async ({ page }) => {
  await page.click('#btnProjectNotes');
  await page.click('#projectNotesEditBtn');
  await page.fill('#projectNotesEditTextarea', 'Run `npm test` before:\n```\nnpm ci\nnpm test\n```');
  await page.click('#projectNotesSaveBtn');

  await expect(page.locator('#projectNotesBody code').first()).toHaveText('npm test');
  await expect(page.locator('#projectNotesBody pre code')).toHaveText('npm ci\nnpm test');
});
