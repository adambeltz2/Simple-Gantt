// @ts-check
const { test, expect } = require('./fixtures');

// Covers the column hide/show feature: a per-column visibility toggle for
// system-led (core) and custom columns alike. Per the user's explicit
// architecture requirements, this must be a pure view-state concern, same
// tier as row Collapse/the In Progress flag -- localStorage-only, per
// project, and it must never remove a column's data or narrow what CSV
// export / Dropbox backup carry. jexcel's own native hideColumn/showColumn
// (a pure CSS-display toggle, same mechanism hideRow/showRow already use for
// Collapse) is what makes this possible with zero data risk.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10, LABELS: 11, NOTES: 12, STATUS: 13 };

function colHeaderItems(page, colIndex) {
  return page.evaluate((x) => sheet.options.contextMenu(sheet, String(x), null, {}), colIndex);
}

test('every column starts visible, and the toolbar button reads "All Columns"', async ({ page }) => {
  const hidden = await page.evaluate(() => appDB.projects[appDB.activeId].hiddenColumns);
  expect(hidden).toEqual([]);
  await expect(page.locator('#columnVisibilityBtnText')).toHaveText('All Columns');
});

test('the column right-click menu offers "Hide Column" on a core column', async ({ page }) => {
  const items = await colHeaderItems(page, COL.RESOURCE);
  const hideItem = items.find((i) => i.title.includes('Hide Column') || i.title.includes('Show Column'));
  expect(hideItem).toBeTruthy();
  expect(hideItem.title).toBe('🙈 Hide Column');
});

test('clicking "Hide Column" hides that column via jexcel\'s native hideColumn, and the menu label flips to "Show Column"', async ({ page }) => {
  await page.evaluate((x) => {
    sheet.options.contextMenu(sheet, String(x), null, {}).find((i) => i.title.includes('Hide Column')).onclick();
  }, COL.RESOURCE);
  await page.waitForTimeout(200);

  const hidden = await page.evaluate(() => appDB.projects[appDB.activeId].hiddenColumns);
  expect(hidden).toEqual(['Resource']);

  const display = await page.evaluate((x) => sheet.headers[x].style.display, COL.RESOURCE);
  expect(display).toBe('none');

  const items = await colHeaderItems(page, COL.RESOURCE);
  const item = items.find((i) => i.title.includes('Hide Column') || i.title.includes('Show Column'));
  expect(item.title).toBe('👁️ Show Column');
});

test('clicking "Show Column" on an already-hidden column restores it', async ({ page }) => {
  await page.evaluate((x) => {
    sheet.options.contextMenu(sheet, String(x), null, {}).find((i) => i.title.includes('Hide Column')).onclick();
  }, COL.RESOURCE);
  await page.waitForTimeout(200);

  await page.evaluate((x) => {
    sheet.options.contextMenu(sheet, String(x), null, {}).find((i) => i.title.includes('Show Column')).onclick();
  }, COL.RESOURCE);
  await page.waitForTimeout(200);

  const hidden = await page.evaluate(() => appDB.projects[appDB.activeId].hiddenColumns);
  expect(hidden).toEqual([]);
  const display = await page.evaluate((x) => sheet.headers[x].style.display, COL.RESOURCE);
  expect(display).toBe('');
});

test('hiding a column is available on a core column that cannot be renamed or deleted (Task ID)', async ({ page }) => {
  const items = await colHeaderItems(page, COL.ID);
  expect(items.some((i) => i.title.includes('Rename Column'))).toBe(false);
  expect(items.some((i) => i.title.includes('Delete Column'))).toBe(false);
  expect(items.some((i) => i.title.includes('Hide Column'))).toBe(true);
});

test('hiding a column never touches the underlying data -- sheet.getData() keeps every column', async ({ page }) => {
  const before = await page.evaluate(() => sheet.getData());

  await page.evaluate((x) => {
    sheet.options.contextMenu(sheet, String(x), null, {}).find((i) => i.title.includes('Hide Column')).onclick();
  }, COL.RESOURCE);
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => sheet.getData());
  expect(after).toEqual(before);
  expect(after[0].length).toBe(before[0].length);
});

test('a hidden column still exports fully in CSV -- header and every row\'s value are present', async ({ page }) => {
  await page.evaluate((x) => {
    sheet.options.contextMenu(sheet, String(x), null, {}).find((i) => i.title.includes('Hide Column')).onclick();
  }, COL.RESOURCE);
  await page.waitForTimeout(200);

  const headers = await page.evaluate(() => sheet.options.columns.map((c) => c.title));
  expect(headers).toContain('Resource');

  const exportData = await page.evaluate(() => sheet.getData());
  expect(exportData[1][COL.RESOURCE]).toBe('Alice 50%, Bob');
});

test('hidden columns are never carried into a Dropbox backup\'s meta.json', async ({ page }) => {
  await page.evaluate((x) => {
    sheet.options.contextMenu(sheet, String(x), null, {}).find((i) => i.title.includes('Hide Column')).onclick();
  }, COL.RESOURCE);
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
  expect(meta.hiddenColumns).toBeUndefined();
  expect(Object.keys(meta).sort()).toEqual(['name', 'projectNotes', 'updatedAt']);
});

test('the toolbar "Columns" popover lists one checkbox per column, all checked by default', async ({ page }) => {
  await page.click('#columnVisibilityBtn');
  const boxes = page.locator('.columnVisibilityCheckbox');
  await expect(boxes).toHaveCount(14);
  const uncheckedCount = await boxes.evaluateAll((els) => els.filter((el) => !el.checked).length);
  expect(uncheckedCount).toBe(0);
});

test('unchecking a column in the popover hides it and updates the badge to "N hidden"', async ({ page }) => {
  await page.click('#columnVisibilityBtn');
  await page.locator('.columnVisibilityCheckbox[value="Labels"]').uncheck();
  await page.waitForTimeout(200);

  await expect(page.locator('#columnVisibilityBtnText')).toHaveText('1 hidden');
  const hidden = await page.evaluate(() => appDB.projects[appDB.activeId].hiddenColumns);
  expect(hidden).toEqual(['Labels']);
  const display = await page.evaluate(() => sheet.headers[11].style.display); // COL.LABELS
  expect(display).toBe('none');
});

test('re-checking a hidden column in the popover shows it again and the badge reverts to "All Columns"', async ({ page }) => {
  await page.click('#columnVisibilityBtn');
  await page.locator('.columnVisibilityCheckbox[value="Labels"]').uncheck();
  await page.waitForTimeout(200);
  await page.locator('.columnVisibilityCheckbox[value="Labels"]').check();
  await page.waitForTimeout(200);

  await expect(page.locator('#columnVisibilityBtnText')).toHaveText('All Columns');
  const hidden = await page.evaluate(() => appDB.projects[appDB.activeId].hiddenColumns);
  expect(hidden).toEqual([]);
});

test('the Columns popover stays open after toggling a checkbox, unlike the auto-closing Export menu', async ({ page }) => {
  await page.click('#columnVisibilityBtn');
  await page.locator('.columnVisibilityCheckbox[value="Labels"]').uncheck();
  await page.waitForTimeout(200);

  await expect(page.locator('#columnVisibilityDropdown')).toBeVisible();
});

test('clicking outside the Columns popover closes it', async ({ page }) => {
  await page.click('#columnVisibilityBtn');
  await expect(page.locator('#columnVisibilityDropdown')).toBeVisible();

  await page.click('#spreadsheet');
  await expect(page.locator('#columnVisibilityDropdown')).toBeHidden();
});

test('hiding multiple columns via the right-click menu accumulates in the toolbar badge', async ({ page }) => {
  await page.evaluate((x) => {
    sheet.options.contextMenu(sheet, String(x), null, {}).find((i) => i.title.includes('Hide Column')).onclick();
  }, COL.RESOURCE);
  await page.waitForTimeout(200);
  await page.evaluate((x) => {
    sheet.options.contextMenu(sheet, String(x), null, {}).find((i) => i.title.includes('Hide Column')).onclick();
  }, COL.LABELS);
  await page.waitForTimeout(200);

  await expect(page.locator('#columnVisibilityBtnText')).toHaveText('2 hidden');
  const hidden = await page.evaluate(() => appDB.projects[appDB.activeId].hiddenColumns);
  expect(hidden.sort()).toEqual(['Labels', 'Resource']);
});

test('hidden-column state persists per project across a reload', async ({ page }) => {
  await page.evaluate((x) => {
    sheet.options.contextMenu(sheet, String(x), null, {}).find((i) => i.title.includes('Hide Column')).onclick();
  }, COL.RESOURCE);
  await page.waitForTimeout(300);

  await page.reload();
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);

  const hidden = await page.evaluate(() => appDB.projects[appDB.activeId].hiddenColumns);
  expect(hidden).toEqual(['Resource']);
  const display = await page.evaluate(() => sheet.headers[3].style.display); // COL.RESOURCE
  expect(display).toBe('none');
});

test('a custom column can be hidden and un-hidden the same as a core column', async ({ page }) => {
  await page.evaluate(() => {
    sheet.insertColumn(1, 13, false);
    sheet.setHeader(14, 'JIRA');
    syncColumnsToDB();
  });
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    sheet.options.contextMenu(sheet, '14', null, {}).find((i) => i.title.includes('Hide Column')).onclick();
  });
  await page.waitForTimeout(200);

  const hidden = await page.evaluate(() => appDB.projects[appDB.activeId].hiddenColumns);
  expect(hidden).toEqual(['JIRA']);
  const display = await page.evaluate(() => sheet.headers[14].style.display);
  expect(display).toBe('none');
});

test('deleting a hidden custom column does not crash, and the toolbar badge recovers to "All Columns"', async ({ page }) => {
  await page.evaluate(() => {
    sheet.insertColumn(1, 13, false);
    sheet.setHeader(14, 'JIRA');
    syncColumnsToDB();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    sheet.options.contextMenu(sheet, '14', null, {}).find((i) => i.title.includes('Hide Column')).onclick();
  });
  await page.waitForTimeout(200);

  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => {
    sheet.options.contextMenu(sheet, '14', null, {}).find((i) => i.title.includes('Delete Column')).onclick();
  });
  await page.waitForTimeout(200);

  await expect(page.locator('#columnVisibilityBtnText')).toHaveText('All Columns');
});
