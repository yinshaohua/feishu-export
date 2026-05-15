/**
 * Bitable output serialisers.
 *
 * saveBitableMarkdown — writes a Markdown table (.md) to outDir.
 * saveBitableExcel    — writes an Excel workbook (.xlsx) to outDir.
 *
 * File naming: sanitizeFileName(baseToken) + date suffix, matching the
 * convention used for document exports.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { BitableTable } from './types.js';
import { sanitizeFileName, ensureDir } from './utils.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a date suffix like _2024-01-15 for file names. */
function dateSuffix(): string {
  return `_${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Detect whether a cell value looks like a URL.
 * Used to write hyperlinks in Excel.
 */
function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

// ── Markdown ──────────────────────────────────────────────────────────────────

/**
 * Escape pipe characters inside a Markdown table cell.
 */
function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Render a CellValue for a Markdown table cell.
 * URL fields become [text](link); plain text is escaped normally.
 */
function mdCellValue(cell: import('./types.js').CellValue): string {
  if (cell.link) {
    const text = mdCell(cell.text || cell.link);
    const link = cell.link.replace(/\)/g, '%29');
    return `[${text}](${link})`;
  }
  return mdCell(cell.text);
}

/**
 * Serialise a BitableTable to a Markdown file and return the file path.
 */
export async function saveBitableMarkdown(
  table: BitableTable,
  outDir: string,
): Promise<string> {
  await ensureDir(outDir);

  const safeName = sanitizeFileName(table.baseToken);
  const filePath = path.join(outDir, `${safeName}${dateSuffix()}.md`);

  const lines: string[] = [];

  // YAML front-matter (mirrors document export convention)
  lines.push('---');
  lines.push(`source_url: https://feishu.cn/base/${table.baseToken}`);
  lines.push(`table_id: ${table.tableId}`);
  lines.push(`captured_at: ${new Date().toISOString()}`);
  lines.push(`record_count: ${table.records.length}`);
  lines.push('---');
  lines.push('');

  // Header row
  const headerCells = table.fields.map((f) => mdCell(f.name));
  lines.push(`| ${headerCells.join(' | ')} |`);

  // Separator row
  lines.push(`| ${table.fields.map(() => '---').join(' | ')} |`);

  // Data rows
  for (const record of table.records) {
    const cells = table.fields.map((f) => mdCellValue(record.cells[f.id] ?? { text: '' }));
    lines.push(`| ${cells.join(' | ')} |`);
  }

  lines.push('');

  await fs.writeFile(filePath, lines.join('\n'), 'utf8');
  console.log(`[bitable] md  → ${filePath} (${table.records.length} records)`);
  return filePath;
}

// ── Excel ─────────────────────────────────────────────────────────────────────

/**
 * Serialise a BitableTable to an Excel workbook (.xlsx) and return the file path.
 *
 * Sheet name: the view name or "Sheet1" if unavailable.
 * Row 1: bold field names (header).
 * Rows 2+: record values; URL-like values are written as hyperlinks.
 */
export async function saveBitableExcel(
  table: BitableTable,
  outDir: string,
): Promise<string> {
  await ensureDir(outDir);

  const safeName = sanitizeFileName(table.baseToken);
  const filePath = path.join(outDir, `${safeName}${dateSuffix()}.xlsx`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'feishu-export';
  workbook.created = new Date();

  // One worksheet per table (future: one per view when multi-view is supported)
  const sheet = workbook.addWorksheet('Sheet1');

  // Header row — bold
  const headerRow = sheet.addRow(table.fields.map((f) => f.name));
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Auto-width: track max char length per column
  const colWidths = table.fields.map((f) => f.name.length);

  // Data rows
  for (const record of table.records) {
    const rowValues = table.fields.map((f, colIdx) => {
      const cell = record.cells[f.id] ?? { text: '' };
      const display = cell.text || cell.link || '';
      if (display.length > colWidths[colIdx]) colWidths[colIdx] = display.length;
      return display;
    });

    const row = sheet.addRow(rowValues);

    // Write URL cells as hyperlinks
    for (let colIdx = 0; colIdx < table.fields.length; colIdx++) {
      const cell = record.cells[table.fields[colIdx].id] ?? { text: '' };
      const link = cell.link ?? (isUrl(cell.text) ? cell.text : undefined);
      if (link) {
        const xlCell = row.getCell(colIdx + 1);
        xlCell.value = { text: cell.text || link, hyperlink: link };
        xlCell.font = { color: { argb: 'FF0563C1' }, underline: true };
      }
    }
  }

  // Set column widths (capped at 60 chars)
  for (let i = 0; i < table.fields.length; i++) {
    sheet.getColumn(i + 1).width = Math.min(colWidths[i] + 4, 60);
  }

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  await workbook.xlsx.writeFile(filePath);
  console.log(`[bitable] xlsx → ${filePath} (${table.records.length} records)`);
  return filePath;
}
