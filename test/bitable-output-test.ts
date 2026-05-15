/**
 * Smoke test for bitable-output.ts — builds a BitableTable from the fixture
 * and verifies that both .md and .xlsx files are written correctly.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { BitableTable } from '../src/types.js';
import { saveBitableMarkdown, saveBitableExcel } from '../src/bitable-output.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Build a BitableTable from fixture ─────────────────────────────────────────

const fixturePath = path.join(__dirname, 'fixtures', 'table_data.json');
const tableData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const fieldMap = tableData.fieldMap as Record<string, { name: string; type: number; property?: { options?: Array<{ id: string; name: string }> } }>;
const viewId: string = tableData.views?.[0];
const viewFields: string[] =
  viewId && tableData.viewMap?.[viewId]?.property?.fields?.length
    ? tableData.viewMap[viewId].property.fields
    : Object.keys(fieldMap);

const fields = viewFields
  .filter((id: string) => fieldMap[id])
  .map((id: string) => ({ id, name: fieldMap[id].name, type: fieldMap[id].type }));

function cellVal(raw: { value?: unknown } | undefined, field: { type: number; property?: { options?: Array<{ id: string; name: string }> } }): string {
  if (!raw || raw.value === undefined || raw.value === null) return '';
  const val = raw.value;
  if (field.type === 3) {
    const opts = field.property?.options ?? [];
    const m = new Map(opts.map((o) => [o.id, o.name]));
    if (typeof val === 'string') return m.get(val) ?? val;
    if (Array.isArray(val)) return (val as string[]).map((v) => m.get(v) ?? v).join(', ');
    return String(val);
  }
  if (Array.isArray(val)) return (val as Array<{ text?: string; link?: string }>).map((s) => s.text ?? s.link ?? '').join('');
  return String(val);
}

const recIds = Object.keys(tableData.recordMeta ?? {}).filter((id: string) => tableData.recordMap[id]);
const records = recIds.map((id: string) => {
  const raw = tableData.recordMap[id] ?? {};
  const cells: Record<string, string> = {};
  for (const f of fields) cells[f.id] = cellVal(raw[f.id], fieldMap[f.id]);
  return { id, cells };
});

const table: BitableTable = {
  tableId: tableData.meta.id,
  title: tableData.meta.id,
  baseToken: 'BUptbMNCraVhIQsqAbbcJJ5anQd',
  fields,
  records,
};

// ── Run and verify ────────────────────────────────────────────────────────────

const outDir = path.join(os.tmpdir(), 'feishu-bitable-test-' + Date.now());

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

console.log('\n=== bitable-output smoke tests ===\n');

const mdPath = await saveBitableMarkdown(table, outDir);
const xlsxPath = await saveBitableExcel(table, outDir);

// Markdown checks
const mdContent = fs.readFileSync(mdPath, 'utf8');
assert(mdPath.endsWith('.md'), '.md file has correct extension');
assert(fs.existsSync(mdPath), '.md file exists');
assert(mdContent.includes('| 分享时间 |'), '.md contains 分享时间 header');
assert(mdContent.includes('| --- |'), '.md contains separator row');
assert(mdContent.includes('source_url:'), '.md has YAML front-matter');
assert(mdContent.includes('record_count: 23'), '.md has correct record_count');
// Count data rows (lines starting with |, minus header and separator)
const dataRows = mdContent.split('\n').filter((l) => l.startsWith('|') && !l.includes('---')).length - 1;
assert(dataRows === 23, `.md has 23 data rows (got ${dataRows})`);

// Excel checks
assert(xlsxPath.endsWith('.xlsx'), '.xlsx file has correct extension');
assert(fs.existsSync(xlsxPath), '.xlsx file exists');
const xlsxSize = fs.statSync(xlsxPath).size;
assert(xlsxSize > 1000, `.xlsx file is non-trivial size (${xlsxSize} bytes)`);

console.log(`\nPassed: ${passed}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
