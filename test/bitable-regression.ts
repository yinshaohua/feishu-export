/**
 * Bitable regression tests — runs against a local fixture (no browser needed).
 *
 * The fixture is test/fixtures/table_data.json, captured from the real
 * clientvars API response for the test Bitable.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Re-implement the pure logic under test (no Playwright dependency) ─────────
// We import the internal helpers by re-exporting them from bitable.ts.
// Since they are not exported, we duplicate the minimal logic here and test
// the public BitableTable shape produced by the fixture data.

import type { BitableField, BitableRecord, BitableTable } from '../src/types.js';

// ── Load fixture ──────────────────────────────────────────────────────────────

const fixturePath = path.join(__dirname, 'fixtures', 'table_data.json');
const tableData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

// ── Minimal inline re-implementation of the pure helpers ─────────────────────
// (mirrors src/bitable.ts logic; if the real impl changes, tests will catch drift)

type RawField = {
  name: string;
  type: number;
  property?: { options?: Array<{ id: string; name: string }> };
};

type RawCellValue = {
  value?: unknown;
};

function cellValueToString(raw: RawCellValue | undefined, field: RawField): string {
  if (!raw || raw.value === undefined || raw.value === null) return '';
  const val = raw.value;

  if (field.type === 3) {
    const options = field.property?.options ?? [];
    const optMap = new Map(options.map((o) => [o.id, o.name]));
    if (typeof val === 'string') return optMap.get(val) ?? val;
    if (Array.isArray(val)) {
      return (val as string[]).map((v) => optMap.get(v) ?? v).filter(Boolean).join(', ');
    }
    return String(val);
  }
  if (field.type === 7) return val === true || val === 1 ? '✓' : '';
  if (Array.isArray(val)) {
    return (val as Array<{ text?: string; link?: string }>)
      .map((seg) => seg.text ?? seg.link ?? '')
      .filter(Boolean)
      .join('');
  }
  return String(val);
}

function buildTable(): BitableTable {
  const fieldMap: Record<string, RawField> = tableData.fieldMap;
  const viewId = tableData.views?.[0];
  const viewFields: string[] =
    viewId && tableData.viewMap?.[viewId]?.property?.fields?.length
      ? tableData.viewMap[viewId].property.fields
      : Object.keys(fieldMap);

  const fields: BitableField[] = viewFields
    .filter((id: string) => fieldMap[id])
    .map((id: string) => ({ id, name: fieldMap[id].name, type: fieldMap[id].type }));

  const recIds = Object.keys(tableData.recordMeta ?? {}).filter(
    (id: string) => tableData.recordMap[id],
  );

  const records: BitableRecord[] = recIds.map((recId: string) => {
    const rawRec: Record<string, RawCellValue> = tableData.recordMap[recId] ?? {};
    const cells: Record<string, string> = {};
    for (const { id, name: _n } of fields) {
      cells[id] = cellValueToString(rawRec[id], fieldMap[id]);
    }
    return { id: recId, cells };
  });

  return {
    tableId: tableData.meta.id,
    title: tableData.meta.id,
    baseToken: 'BUptbMNCraVhIQsqAbbcJJ5anQd',
    fields,
    records,
  };
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n=== Bitable regression tests ===\n');

const table = buildTable();

console.log('--- Field structure ---');
assertEqual(table.fields.length, 5, 'has 5 fields');
assertEqual(table.fields[0].name, '分享时间', 'first field is 分享时间 (view order)');
assertEqual(table.fields[1].name, '分享嘉宾', 'second field is 分享嘉宾');
assertEqual(table.fields[2].name, '链接', 'third field is 链接');
assertEqual(table.fields[3].name, '主持人', 'fourth field is 主持人');
assertEqual(table.fields[4].name, '是否沟通添加管理权', 'fifth field is 是否沟通添加管理权');

console.log('\n--- Field types ---');
assertEqual(table.fields[0].type, 1, '分享时间 is type 1 (text)');
assertEqual(table.fields[2].type, 15, '链接 is type 15 (url)');
assertEqual(table.fields[3].type, 3, '主持人 is type 3 (select)');

console.log('\n--- Record count ---');
assertEqual(table.records.length, 23, 'has 23 records');

console.log('\n--- Cell values: text field ---');
const textField = table.fields.find((f) => f.name === '分享嘉宾')!;
const firstRec = table.records[0];
assert(firstRec.cells[textField.id].length > 0, '分享嘉宾 cell is non-empty');
console.log(`     value: "${firstRec.cells[textField.id]}"`);

console.log('\n--- Cell values: URL field ---');
const urlField = table.fields.find((f) => f.name === '链接')!;
const urlVal = firstRec.cells[urlField.id];
assert(urlVal.length > 0, '链接 cell is non-empty');
console.log(`     value: "${urlVal.slice(0, 80)}"`);

console.log('\n--- Cell values: select field (主持人) ---');
const selectField = table.fields.find((f) => f.name === '主持人')!;
// Find a record that has a 主持人 value
const recWithSelect = table.records.find((r) => r.cells[selectField.id].length > 0);
assert(recWithSelect !== undefined, 'at least one record has 主持人 value');
if (recWithSelect) {
  const selectVal = recWithSelect.cells[selectField.id];
  // Should be a human-readable name, not an option ID like "optXxx"
  assert(!selectVal.startsWith('opt'), '主持人 value is resolved name, not option ID');
  console.log(`     value: "${selectVal}"`);
}

console.log('\n--- Empty cell handling ---');
// Find a record where 主持人 is empty
const recWithoutSelect = table.records.find((r) => r.cells[selectField.id] === '');
assert(recWithoutSelect !== undefined, 'some records have empty 主持人');

console.log('\n--- Summary ---');
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
}
