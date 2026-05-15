/**
 * Feishu Bitable (多维表格) extractor.
 *
 * Strategy: intercept the /clientvars API response that the page fires on load.
 * The response contains a gzip+base64-encoded `data.table` field with the full
 * fieldMap + recordMap for the current view (up to recordLimit=200 records).
 *
 * No extra API token required — reuses the existing Playwright browser session.
 */

import zlib from 'node:zlib';
import { promisify } from 'node:util';
import type { Page, Response } from 'playwright';
import type { BitableField, BitableRecord, BitableTable, CellValue } from './types.js';

const gunzip = promisify(zlib.gunzip);

// ── Raw API shapes ────────────────────────────────────────────────────────────

interface RawCellText {
  type: 'text' | 'mention' | string;
  text?: string;
  link?: string;
  token?: string;
}

interface RawCellValue {
  value?: RawCellText[] | string | number | boolean;
  modifiedUser?: string;
  modifiedTime?: number;
}

interface RawFieldOption {
  id: string;
  name: string;
  color?: number;
}

interface RawField {
  name: string;
  type: number;
  isPrimary?: boolean;
  fieldUIType?: string;
  property?: {
    options?: RawFieldOption[];
    [key: string]: unknown;
  };
}

interface RawTableData {
  meta: { id: string; recordsNum: number };
  fieldMap: Record<string, RawField>;
  recordMap: Record<string, Record<string, RawCellValue>>;
  recordMeta: Record<string, unknown>;
  /** rankInfo.rankMap: recordId → lexicographic rank string (insertion order, NOT view order) */
  rankInfo?: { rankMap?: Record<string, string>; nextRank?: string };
  viewMap: Record<string, {
    id: string;
    name: string;
    type: number;
    property: {
      fields: string[];
      /** View sort rules */
      sortInfo?: Array<{ fieldId: string; desc: boolean }>;
      [key: string]: unknown;
    };
  }>;
  views: string[];
}

interface ClientVarsResponse {
  msg: string;
  data: {
    table: string; // gzip+base64
    [key: string]: unknown;
  };
}

// ── Cell value extraction ─────────────────────────────────────────────────────

/**
 * Convert a raw cell value to a CellValue with text and optional link.
 * Handles the main field types encountered in practice.
 */
function cellToValue(
  raw: RawCellValue | undefined,
  field: RawField,
): CellValue {
  if (!raw || raw.value === undefined || raw.value === null) return { text: '' };

  const val = raw.value;

  // Type 3 = select (single or multi). Wire value is an option ID string,
  // or an array of option ID strings for multi-select.
  if (field.type === 3) {
    const options = field.property?.options ?? [];
    const optMap = new Map(options.map((o) => [o.id, o.name]));

    if (typeof val === 'string') {
      return { text: optMap.get(val) ?? val };
    }
    if (Array.isArray(val)) {
      const text = val
        .map((v) => (typeof v === 'string' ? (optMap.get(v) ?? v) : ''))
        .filter(Boolean)
        .join(', ');
      return { text };
    }
    return { text: String(val) };
  }

  // Type 7 = checkbox
  if (field.type === 7) {
    return { text: val === true || val === 1 ? '✓' : '' };
  }

  // Number / auto-number
  if (field.type === 2 || field.type === 1005) {
    return { text: typeof val === 'number' ? String(val) : String(val) };
  }

  // Array of rich-text segments (type 1 text, type 15 URL, type 18 link, etc.)
  if (Array.isArray(val)) {
    // Collect all text segments and the first link found
    let link: string | undefined;
    const textParts: string[] = [];

    for (const seg of val as RawCellText[]) {
      if (seg.text) textParts.push(seg.text);
      if (seg.link && !link) link = seg.link;
    }

    // For pure URL fields (type 15): if there's no display text, use the link as text
    const text = textParts.join('') || link || '';
    return link ? { text, link } : { text };
  }

  // Scalar fallback
  return { text: String(val) };
}

// ── Field ordering ────────────────────────────────────────────────────────────

/**
 * Return fields in the view's column order.
 * Falls back to fieldMap insertion order if the view has no field list.
 */
function orderedFields(
  tableData: RawTableData,
  viewId: string | undefined,
): Array<{ id: string; field: RawField }> {
  const fieldMap = tableData.fieldMap;

  let orderedIds: string[] = [];
  if (viewId && tableData.viewMap[viewId]?.property?.fields?.length) {
    orderedIds = tableData.viewMap[viewId].property.fields;
  } else {
    orderedIds = Object.keys(fieldMap);
  }

  // Include any fields not listed in the view (safety net)
  const seen = new Set(orderedIds);
  for (const id of Object.keys(fieldMap)) {
    if (!seen.has(id)) orderedIds.push(id);
  }

  return orderedIds
    .filter((id) => fieldMap[id])
    .map((id) => ({ id, field: fieldMap[id] }));
}

// ── Record ordering ───────────────────────────────────────────────────────────

/**
 * Extract the plain text value of a cell for sorting purposes.
 */
function cellSortKey(raw: RawCellValue | undefined): string {
  if (!raw || raw.value === undefined || raw.value === null) return '';
  const val = raw.value;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val).padStart(20, '0');
  if (Array.isArray(val)) {
    return val.map((s: RawCellText) => s.text ?? '').join('');
  }
  return String(val);
}

/**
 * Return record IDs in the order defined by the view's sortInfo rules.
 *
 * Falls back to rankInfo.rankMap (insertion order) when no sortInfo is present,
 * then to recordMeta key order as a last resort.
 */
function orderedRecordIds(tableData: RawTableData, viewId: string | undefined): string[] {
  const allIds = Object.keys(tableData.recordMap);

  const sortInfo = viewId ? tableData.viewMap[viewId]?.property?.sortInfo : undefined;

  if (sortInfo && sortInfo.length > 0) {
    return [...allIds].sort((a, b) => {
      for (const { fieldId, desc } of sortInfo) {
        const ka = cellSortKey(tableData.recordMap[a]?.[fieldId]);
        const kb = cellSortKey(tableData.recordMap[b]?.[fieldId]);
        if (ka < kb) return desc ? 1 : -1;
        if (ka > kb) return desc ? -1 : 1;
      }
      return 0;
    });
  }

  // Fallback: rankInfo insertion order
  const rankMap = tableData.rankInfo?.rankMap;
  if (rankMap && Object.keys(rankMap).length > 0) {
    const allSet = new Set(allIds);
    const ranked = Object.entries(rankMap)
      .filter(([id]) => allSet.has(id))
      .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
      .map(([id]) => id);
    const rankedSet = new Set(ranked);
    for (const id of allIds) {
      if (!rankedSet.has(id)) ranked.push(id);
    }
    return ranked;
  }

  // Last resort: recordMeta key order
  const metaIds = Object.keys(tableData.recordMeta ?? {}).filter((id) => new Set(allIds).has(id));
  const metaSet = new Set(metaIds);
  for (const id of allIds) {
    if (!metaSet.has(id)) metaIds.push(id);
  }
  return metaIds;
}

// ── Main extractor ────────────────────────────────────────────────────────────

/**
 * Navigate to a Bitable URL and extract its table data.
 *
 * @param page  An already-authenticated Playwright page.
 * @param url   The Bitable URL, e.g. https://xxx.feishu.cn/base/TOKEN?table=tblXxx&view=vewXxx
 * @returns     Structured BitableTable ready for serialisation.
 */
export async function extractBitable(
  page: Page,
  url: string,
): Promise<BitableTable> {
  // Parse URL components
  const parsed = new URL(url);
  const baseToken = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
  const tableId = parsed.searchParams.get('table') ?? '';
  const viewId = parsed.searchParams.get('view') ?? undefined;

  // Set up response interception before navigation
  let resolveClientVars!: (r: Response) => void;
  const clientVarsPromise = new Promise<Response>((res) => {
    resolveClientVars = res;
  });

  const handler = (response: Response) => {
    if (response.url().includes('/clientvars?')) {
      resolveClientVars(response);
    }
  };
  page.on('response', handler);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait up to 30 s for the clientvars response
    const cvResponse = await Promise.race([
      clientVarsPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('clientvars response timeout after 30s')), 30_000),
      ),
    ]);

    const cvJson: ClientVarsResponse = await cvResponse.json();
    if (!cvJson?.data?.table) {
      throw new Error(
        'clientvars response missing data.table — the table may be empty or access-restricted',
      );
    }

    // Decompress gzip+base64 payload
    const compressed = Buffer.from(cvJson.data.table, 'base64');
    const decompressed = await gunzip(compressed);
    const tableData: RawTableData = JSON.parse(decompressed.toString('utf8'));

    // Build ordered field list
    const fieldEntries = orderedFields(tableData, viewId);
    const fields: BitableField[] = fieldEntries.map(({ id, field }) => ({
      id,
      name: field.name,
      type: field.type,
    }));

    // Build records, filtering out fully-empty rows (user-inserted blank separators)
    const recIds = orderedRecordIds(tableData, viewId);
    const records: BitableRecord[] = recIds
      .map((recId) => {
        const rawRec = tableData.recordMap[recId] ?? {};
        const cells: Record<string, CellValue> = {};
        for (const { id, field } of fieldEntries) {
          cells[id] = cellToValue(rawRec[id], field);
        }
        return { id: recId, cells };
      })
      .filter((rec) => Object.values(rec.cells).some((c) => c.text || c.link));

    // Derive a title: use the table meta id as fallback (title not in clientvars)
    const title = tableId || tableData.meta?.id || baseToken;

    console.log(
      `[bitable] ${baseToken} tableId=${tableId} fields=${fields.length} records=${records.length}`,
    );

    // Warn about unknown field types
    const knownTypes = new Set([1, 2, 3, 4, 5, 7, 11, 13, 15, 17, 18, 19, 20, 1002, 1003, 1004, 1005]);
    for (const { field } of fieldEntries) {
      if (!knownTypes.has(field.type)) {
        console.warn(`[bitable] warn: unknown field type ${field.type} for field "${field.name}"`);
      }
    }

    return { tableId, title, baseToken, fields, records };
  } finally {
    page.off('response', handler);
  }
}
