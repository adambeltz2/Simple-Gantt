// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');

// Covers backlog #16: exportCSV visually indents Task Name by outline depth
// (mirroring the grid's own Parent-chain indentation from formatCells), and
// that indent is stripped back off on import so an export -> re-import ->
// re-export cycle can't compound into double indentation.

const COL = { ID: 0, OUTLINE: 1, NAME: 2, RESOURCE: 3, ALLOC: 4, PCT: 5, START: 6, DUR: 7, END: 8, DEP: 9, PARENT: 10 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.consoleErrors = errors;

  await page.goto('/index.html');
  await page.waitForSelector('#spreadsheet .jexcel');
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById('skipWeekends').checked = false; });
});

async function loadNestedFixture(page) {
  await page.evaluate(() => {
    appDB.projects[appDB.activeId].columns = [];
    const data = [
      ['1', '1', 'Parent Task', '', '', '0', '', '', '', '', '', ''],
      ['2', '1.1', 'Child Task', '', '', '0', '2026-08-24', '2', '2026-08-25', '', '1', ''],
      ['3', '1.1.1', 'Grandchild Task', '', '', '0', '2026-08-24', '1', '2026-08-24', '', '2', ''],
    ];
    appDB.projects[appDB.activeId].data = data;
    renderGrid(data);
    syncToGantt(true);
  });
  await page.waitForTimeout(300);
}

async function exportAndRead(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  return fs.readFileSync(await download.path(), 'utf8');
}

// Papaparse quotes any field with leading/trailing whitespace (exactly what
// the outline indent produces), so a naive comma-split would leave the
// literal quote characters in place -- parse properly instead.
function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

function fieldsOf(content, linePrefix) {
  const line = content.split('\n').find((l) => l.startsWith(linePrefix));
  expect(line, `no exported line starting with "${linePrefix}"`).toBeTruthy();
  return parseCsvLine(line.replace(/\r?\n$/, ''));
}

test('exportCSV indents Task Name by outline depth, top-level rows unindented', async ({ page }) => {
  await loadNestedFixture(page);
  const content = await exportAndRead(page);

  expect(fieldsOf(content, '1,1,')[COL.NAME]).toBe('Parent Task');
  expect(fieldsOf(content, '2,1.1,')[COL.NAME]).toBe('    Child Task');
  expect(fieldsOf(content, '3,1.1.1,')[COL.NAME]).toBe('        Grandchild Task');
});

test('re-importing an indented export strips the indent back off Task Name', async ({ page }) => {
  await loadNestedFixture(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[onclick="exportCSV()"]'),
  ]);
  const csvBuffer = fs.readFileSync(await download.path());

  await page.setInputFiles('#csvFile', {
    name: 'export.csv',
    mimeType: 'text/csv',
    buffer: csvBuffer,
  });
  await page.waitForTimeout(400);

  const rows = await page.evaluate(() => sheet.getData());
  const child = rows.find((r) => r[COL.ID] === '2');
  const grandchild = rows.find((r) => r[COL.ID] === '3');
  expect(child[COL.NAME]).toBe('Child Task');
  expect(grandchild[COL.NAME]).toBe('Grandchild Task');
  expect(page.consoleErrors).toEqual([]);
});

test('export -> re-import -> re-export does not compound the indent', async ({ page }) => {
  await loadNestedFixture(page);

  const csvBuffer1 = fs.readFileSync((await (async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button[onclick="exportCSV()"]'),
    ]);
    return download.path();
  })()));

  await page.setInputFiles('#csvFile', {
    name: 'export.csv',
    mimeType: 'text/csv',
    buffer: csvBuffer1,
  });
  await page.waitForTimeout(400);

  const content2 = await exportAndRead(page);
  // Same single-level indent as the very first export, not doubled.
  expect(fieldsOf(content2, '2,1.1,')[COL.NAME]).toBe('    Child Task');
  expect(fieldsOf(content2, '3,1.1.1,')[COL.NAME]).toBe('        Grandchild Task');
});
