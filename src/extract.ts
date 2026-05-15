import { gunzipSync } from 'node:zlib';
import type { DocBlock, ExtractedDocument, HeadingLevel } from './types.js';
import type { Page, Response } from 'playwright';
import { normalizeStructuralBlocks } from './normalize.js';

const verboseDebug = process.env.FEISHU_EXPORT_DEBUG === '1';

function normalizeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeLooseText(text: string | null | undefined): string {
  return (text ?? '').replace(/\u200b/g, '').replace(/[ \t]+/g, ' ').trim();
}

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .map((part) => part.replace(/[ \t]+/g, ' '))
    .filter(Boolean);
}

function blocksFromPlainText(text: string): string[] {
  return splitParagraphs(text);
}

function attributedTextToString(source: unknown): string {
  if (!source || typeof source !== 'object') return '';
  const textContainer = source as Record<string, unknown>;
  const rawText = textContainer.text;
  if (!rawText || typeof rawText !== 'object') return '';

  const entries = Object.entries(rawText as Record<string, unknown>)
    .filter(([key, value]) => /^\d+$/.test(key) && typeof value === 'string')
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  return normalizeText(entries.map(([, value]) => String(value)).join(''));
}

function paragraphsToBlocks(paragraphs: string[]): DocBlock[] {
  const blocks: DocBlock[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph) continue;

    if (/^(#{1,6})\s+/.test(paragraph)) {
      const match = paragraph.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        blocks.push({ type: 'heading', level: match[1].length as HeadingLevel, text: match[2].trim() });
        continue;
      }
    }

    const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
    const bulletLike = lines.length > 1 && lines.every((line) => /^[-*•]\s+/.test(line));
    const orderedLike = lines.length > 1 && lines.every((line) => /^\d+[.、]\s*/.test(line));

    if (bulletLike) {
      blocks.push({ type: 'bullet_list', items: lines.map((line) => line.replace(/^[-*•]\s+/, '').trim()) });
      continue;
    }

    if (orderedLike) {
      blocks.push({ type: 'ordered_list', items: lines.map((line) => line.replace(/^\d+[.、]\s*/, '').trim()) });
      continue;
    }

    blocks.push({ type: 'paragraph', text: paragraph });
  }

  return blocks;
}

function buildFeishuImageUrl(token: string, mountNodeToken: string, width?: number, height?: number): string {
  const params = new URLSearchParams({
    fallback_source: '1',
    mount_node_token: mountNodeToken,
    mount_point: 'docx_image',
    policy: 'equal',
    width: String(width ?? 1280),
    height: String(height ?? 1280),
  });
  return `https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/v2/cover/${token}/?${params.toString()}`;
}

function buildFeishuSheetUrl(token: string): string {
  const [baseToken] = token.split('_');
  return `https://ivtafhlzcve.feishu.cn/base/${baseToken}`;
}

type SheetPayloadSummary = {
  token: string;
  textLines: string[];
};

type SheetStructuredSummary = {
  kind: 'fee-matrix' | 'checklist' | 'generic';
  headings: string[];
  rangeValuePairs: string[];
  tableHeader: [string, string];
  tableRows: string[][];
};

function normalizeSheetToken(token: string | null | undefined): string {
  return (token || '').trim();
}

function cleanSheetLine(raw: string): string {
  return normalizeText(raw)
    .replace(/^[!#%&/*]+(?=\S)/g, '')
    .replace(/^\d+(?=[\u4e00-\u9fffA-Za-z])/g, '')
    .replace(/^[A-Za-z]\s+[*]+$/g, '')
    .trim();
}

function isUsefulSheetLine(line: string): boolean {
  if (!line) return false;
  if (line.length < 2) return false;
  if (/^rgb\(/i.test(line)) return false;
  if (/^[A-Za-z0-9+/=]{20,}$/.test(line)) return false;
  if (/^[A-Za-z0-9]{1,2}$/.test(line)) return false;
  if (/^[A-Za-z]{1,8}$/.test(line)) return false;
  return true;
}

function extractPrintableSheetLines(buffer: Buffer): string[] {
  const text = buffer
    .toString('utf8')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '\n')
    .replace(/\uFFFD/g, '\n');

  const seen = new Set<string>();
  const lines: string[] = [];

  for (const raw of text.split(/\n+/)) {
    const line = cleanSheetLine(raw);
    if (!isUsefulSheetLine(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length >= 120) break;
  }

  return lines;
}

function buildStructuredSheetSummary(lines: string[]): SheetStructuredSummary {
  const headings: string[] = [];
  const rangeValuePairs: string[] = [];
  const seenHeadings = new Set<string>();
  const seenPairs = new Set<string>();
  const tableRows: string[][] = [];

  const isMoneyLike = (line: string): boolean =>
    /^\$\d/.test(line)
    || /\$\d/.test(line)
    || /超出首(?:磅|重)/.test(line)
    || /每磅\s*\$/.test(line)
    || /每半磅\s*\$/.test(line)
    || /每4盎司.*\$/.test(line)
    || /\/磅.*\$/.test(line);
  const isRangeLike = (line: string): boolean => /至|以上|以下|不超过|超过|磅|盎司|千克|尺寸|分段/.test(line);
  const isHeadingLike = (line: string): boolean => line.length <= 24 && !isMoneyLike(line) && /[\u4e00-\u9fff]/.test(line);
  const candidateScore = (line: string): number => {
    let score = 0;
    if (/^\$\d/.test(line)) score += 5;
    if (/\$\d/.test(line)) score += 3;
    if (/超出首(?:磅|重)/.test(line)) score += 3;
    if (/每磅\s*\$|每半磅\s*\$|每4盎司.*\$|\/磅.*\$/.test(line)) score += 3;
    if (/低库存|高峰期|配送费|销售佣金|月度仓储/.test(line)) score += 2;
    if (/盎司（不含|磅（不含|至\s*\d+\s*(?:盎司|磅)/.test(line) && !/超出首(?:磅|重)|每磅\s*\$|每半磅\s*\$/.test(line)) {
      score -= 4;
    }
    return score;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (isHeadingLike(line) && !seenHeadings.has(line)) {
      seenHeadings.add(line);
      headings.push(line);
    }

    if (!isRangeLike(line)) continue;

    let bestCandidate = '';
    let bestScore = 0;
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j += 1) {
      const candidate = lines[j];
      if (!isMoneyLike(candidate)) continue;
      const score = candidateScore(candidate);
      if (score > bestScore) {
        bestCandidate = candidate;
        bestScore = score;
      }
    }

    if (bestCandidate && bestScore > 0) {
      const pair = `${line} → ${bestCandidate}`;
      if (!seenPairs.has(pair)) {
        seenPairs.add(pair);
        rangeValuePairs.push(pair);
        tableRows.push([line, bestCandidate]);
      }
    } else if (i > 0 && isMoneyLike(lines[i - 1]) && candidateScore(lines[i - 1]) > 0) {
      const pair = `${line} → ${lines[i - 1]}`;
      if (!seenPairs.has(pair)) {
        seenPairs.add(pair);
        rangeValuePairs.push(pair);
        tableRows.push([line, lines[i - 1]]);
      }
    }

    if (rangeValuePairs.length >= 12 && headings.length >= 8) break;
  }

  const headerLeft = '区间/分段';
  const headerRight = '费用/规则';
  const kind: SheetStructuredSummary['kind'] = rangeValuePairs.length >= 2
    ? 'fee-matrix'
    : headings.some((item) => /核查|检查|参数|步骤/.test(item))
      ? 'checklist'
      : 'generic';

  return {
    kind,
    headings: headings.slice(0, 8),
    rangeValuePairs: rangeValuePairs.slice(0, 12),
    tableHeader: [headerLeft, headerRight],
    tableRows: tableRows.slice(0, 12),
  };
}

function decodeSheetPayloadText(payload: string): string[] {
  try {
    const parsed = JSON.parse(payload) as {
      data?: {
        blocks?: Record<string, string>;
      };
    };

    const encodedBlocks = parsed.data?.blocks ?? {};
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const encoded of Object.values(encodedBlocks)) {
      if (typeof encoded !== 'string' || !encoded) continue;
      const compressed = Buffer.from(encoded, 'base64');
      const gunzipped = gunzipSync(compressed);
      const printable = extractPrintableSheetLines(Buffer.from(gunzipped));
      for (const line of printable) {
        if (seen.has(line)) continue;
        seen.add(line);
        lines.push(line);
        if (lines.length >= 60) return lines;
      }
    }

    return lines;
  } catch {
    return [];
  }
}

export function startSheetPayloadCapture(page: Page): { stop: () => SheetPayloadSummary[] } {
  const captured = new Map<string, string[]>();

  const onResponse = async (response: Response): Promise<void> => {
    const url = response.url();
    if (!url.includes('/space/api/v3/sheet/block?')) return;

    try {
      const token = normalizeSheetToken(new URL(url).searchParams.get('token'));
      if (!token) return;
      const body = await response.text();
      const lines = decodeSheetPayloadText(body);
      if (lines.length > 0) captured.set(token, lines);
    } catch {
      // ignore capture failures; sheet payloads are best-effort only
    }
  };

  page.on('response', onResponse);

  return {
    stop: () => {
      page.off('response', onResponse);
      return Array.from(captured.entries()).map(([token, textLines]) => ({ token, textLines }));
    },
  };
}

function inferOrderedMarkerPrefix(text: string): string {
  if (/^(\d+(?:\.\d+)*[.．、]|（\d+）)/.test(text)) return '';
  return '1. ';
}

function buildSheetSummaryBlocks(record: RuntimeBlock, sourceDocUrl: string | undefined, sheetPayloads: Map<string, string[]>): DocBlock[] {
  const sheetUrl = buildFeishuSheetUrl(record.sheetToken!);
  const linkBlock: DocBlock = {
    type: 'link',
    url: sheetUrl,
    text: record.sheetTitle || '查看内嵌表格（需在原文中展开）',
  };

  const fullToken = normalizeSheetToken(record.sheetToken || '');
  const baseToken = fullToken.split('_')[0];
  const lines = sheetPayloads.get(fullToken) || sheetPayloads.get(baseToken) || [];
  if (lines.length === 0) {
    if (sourceDocUrl && sourceDocUrl !== sheetUrl) {
      return [
        linkBlock,
        { type: 'paragraph', text: `原文位置：${sourceDocUrl}` },
      ];
    }
    return [linkBlock];
  }

  const summaryText = lines.slice(0, 40).join('\n');
  const structured = buildStructuredSheetSummary(lines);
  const blocks: DocBlock[] = [
    linkBlock,
    {
      type: 'code',
      language: 'text',
      text: `[内嵌表格文本摘要]\n${summaryText}`,
    },
  ];

  if (structured.kind === 'checklist' && structured.headings.length > 0) {
    blocks.push({
      type: 'paragraph',
      text: '内嵌表格类型：参数核查/步骤清单',
    });
    blocks.push({
      type: 'bullet_list',
      items: structured.headings.map((item) => `核查项：${item}`),
    });
  } else if (structured.kind === 'fee-matrix') {
    if (structured.headings.length > 0) {
      blocks.push({
        type: 'bullet_list',
        items: structured.headings.map((item) => `字段/分段：${item}`),
      });
    }

    if (structured.rangeValuePairs.length > 0) {
      blocks.push({
        type: 'bullet_list',
        items: structured.rangeValuePairs.map((item) => `费用线索：${item}`),
      });
    }

    if (structured.tableRows.length >= 2) {
      blocks.push({
        type: 'table',
        rows: [
          structured.tableHeader,
          ...structured.tableRows,
        ],
      });
    }
  } else if (structured.headings.length > 0) {
    blocks.push({
      type: 'bullet_list',
      items: structured.headings.map((item) => `表格线索：${item}`),
    });
  }

  if (sourceDocUrl && sourceDocUrl !== sheetUrl) {
    blocks.push({ type: 'paragraph', text: `原文位置：${sourceDocUrl}` });
  }

  return blocks;
}

/** Map Feishu language labels to standard markdown fence identifiers. */
function normalizeCodeLanguage(lang: string | undefined): string {
  if (!lang) return '';
  const lower = lang.toLowerCase().trim();
  const map: Record<string, string> = {
    markdown: 'markdown',
    md: 'markdown',
    javascript: 'javascript',
    js: 'javascript',
    typescript: 'typescript',
    ts: 'typescript',
    python: 'python',
    py: 'python',
    java: 'java',
    go: 'go',
    golang: 'go',
    rust: 'rust',
    c: 'c',
    'c++': 'cpp',
    cpp: 'cpp',
    'c#': 'csharp',
    csharp: 'csharp',
    shell: 'bash',
    bash: 'bash',
    sh: 'bash',
    zsh: 'bash',
    sql: 'sql',
    html: 'html',
    css: 'css',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    ruby: 'ruby',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kotlin: 'kotlin',
    scala: 'scala',
    r: 'r',
    matlab: 'matlab',
    text: '',
    plain: '',
    plaintext: '',
    'plain text': '',
  };
  return map[lower] ?? lower;
}

/** Regex that matches image placeholders emitted by getCellText in the page script. */
const IMG_PLACEHOLDER_RE = /^__IMG__:([^:]+):([^:]+):(\d+):(\d+)$/;

/**
 * Parse a cell value: if it's an image placeholder, return an image DocBlock;
 * otherwise return a plain string (the cell text).
 */
function parseCellValue(cell: string): DocBlock | string {
  const m = IMG_PLACEHOLDER_RE.exec(cell.trim());
  if (!m) return cell;
  const [, token, mountNodeToken, w, h] = m;
  return {
    type: 'image',
    url: buildFeishuImageUrl(token, mountNodeToken, Number(w) || undefined, Number(h) || undefined),
    alt: 'image',
  };
}

/**
 * Expand a table that may contain image-placeholder cells into a sequence of
 * DocBlocks.  Pure-text tables become a single `table` block (unchanged).
 * Tables with image cells are emitted as: table (text-only columns) + image
 * blocks for each image cell, with a caption indicating row/col position.
 *
 * Strategy: replace image cells with "(图片)" in the table, then append the
 * actual image blocks after the table so they are downloaded and localised.
 */
function expandTableWithImages(tableRows: string[][]): DocBlock[] {
  let hasImages = false;
  for (const row of tableRows) {
    for (const cell of row) {
      if (IMG_PLACEHOLDER_RE.test(cell.trim())) {
        hasImages = true;
        break;
      }
    }
    if (hasImages) break;
  }

  if (!hasImages) {
    return [{ type: 'table', rows: tableRows }];
  }

  const textRows: string[][] = [];
  const imageBlocks: DocBlock[] = [];

  for (let r = 0; r < tableRows.length; r++) {
    const textRow: string[] = [];
    for (let c = 0; c < tableRows[r].length; c++) {
      const cell = tableRows[r][c];
      const parsed = parseCellValue(cell);
      if (typeof parsed === 'string') {
        textRow.push(parsed);
      } else {
        // Replace image cell with a placeholder label in the table
        textRow.push('（图片）');
        imageBlocks.push(parsed);
      }
    }
    textRows.push(textRow);
  }

  const blocks: DocBlock[] = [{ type: 'table', rows: textRows }];
  blocks.push(...imageBlocks);
  return blocks;
}

function mapRecordToBlocks(record: RuntimeBlock, sourceDocUrl: string | undefined, sheetPayloads: Map<string, string[]>): DocBlock[] {
  const recordType = record.type;

  // Code blocks: preserve raw text with newlines, use language from data
  if (recordType === 'code') {
    const codeText = record.text; // already has newlines preserved
    if (!codeText) return [];
    // Normalize the language label to a common markdown fence identifier
    const lang = normalizeCodeLanguage(record.codeLanguage);
    return [{ type: 'code', text: codeText, language: lang }];
  }

  const text = normalizeText(record.text);
  if (recordType === 'heading1') return text ? [{ type: 'heading', level: 1, text }] : [];
  if (recordType === 'heading2') return text ? [{ type: 'heading', level: 2, text }] : [];
  if (recordType === 'heading3') return text ? [{ type: 'heading', level: 3, text }] : [];
  if (recordType === 'heading4') return text ? [{ type: 'heading', level: 4, text }] : [];
  if (recordType === 'heading5') return text ? [{ type: 'heading', level: 5, text }] : [];
  if (recordType === 'heading6') return text ? [{ type: 'heading', level: 6, text }] : [];

  if (recordType === 'bullet') return text ? [{ type: 'bullet_list', items: [text] }] : [];
  if (recordType === 'ordered' || recordType === 'numbered') return text ? [{ type: 'paragraph', text: `${inferOrderedMarkerPrefix(text)}${text}` }] : [];
  if (recordType === 'image' && record.imageToken) {
    return [{
      type: 'image',
      url: buildFeishuImageUrl(record.imageToken, record.id, record.imageWidth, record.imageHeight),
      alt: record.imageCaption || record.imageName || 'image',
    }];
  }
  if (recordType === 'sheet' && record.sheetToken) {
    return buildSheetSummaryBlocks(record, sourceDocUrl, sheetPayloads);
  }
  if (recordType === 'table' && record.tableRows && record.tableRows.length > 0) {
    return expandTableWithImages(record.tableRows);
  }
  if (recordType === 'divider') return [{ type: 'divider' }];
  if (recordType === 'grid' || recordType === 'grid_column' || recordType === 'page') return [];

  return text ? [{ type: 'paragraph', text }] : [];
}

function mergeAdjacentLists(blocks: DocBlock[]): DocBlock[] {
  const merged: DocBlock[] = [];

  for (const block of blocks) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(block);
      continue;
    }

    if (block.type === 'bullet_list' && prev.type === 'bullet_list') {
      prev.items.push(...block.items);
      continue;
    }

    if (block.type === 'ordered_list' && prev.type === 'ordered_list') {
      prev.items.push(...block.items);
      continue;
    }

    merged.push(block);
  }

  return merged;
}

function blockText(block: DocBlock): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'blockquote':
    case 'code':
      return block.text;
    case 'image':
      return block.alt || block.url;
    case 'link':
      return `${block.text} ${block.url}`;
    case 'bullet_list':
    case 'ordered_list':
      return block.items.join(' ');
    case 'todo_list':
      return block.items.map((item) => item.text).join(' ');
    case 'table':
      return block.rows.flat().join(' ');
    case 'divider':
      return '';
    default:
      return '';
  }
}

function buildHybridBlocks(runtimeBlocks: DocBlock[], plainBlocks: DocBlock[]): DocBlock[] {
  if (runtimeBlocks.length === 0) return plainBlocks;
  if (plainBlocks.length === 0) return runtimeBlocks;

  const normalizedRuntimeSet = new Set(
    runtimeBlocks
      .map((block) => normalizeLooseText(blockText(block)))
      .filter(Boolean),
  );

  const trailingPlainBlocks = plainBlocks.filter((block) => {
    const normalized = normalizeLooseText(blockText(block));
    return normalized && !normalizedRuntimeSet.has(normalized);
  });

  return dedupeAdjacentBlocks(mergeAdjacentLists([...runtimeBlocks, ...trailingPlainBlocks]));
}

function dedupeAdjacentBlocks(blocks: DocBlock[]): DocBlock[] {
  const result: DocBlock[] = [];

  for (const block of blocks) {
    const prev = result[result.length - 1];
    if (!prev) {
      result.push(block);
      continue;
    }

    if (prev.type === block.type && normalizeLooseText(blockText(prev)) === normalizeLooseText(blockText(block))) {
      continue;
    }

    result.push(block);
  }

  return result;
}

const EXTRACT_DOCUMENT_SCRIPT = String.raw`
(() => {
  function clean(text) {
    return (text || '').replace(/\u200b/g, '').replace(/[ \t]+/g, ' ').trim();
  }

  function getDocId() {
    // wiki 页面：根节点 ID 存在 window.DATA.clientVars.data.id，不等于 URL token
    const isWiki = /\/wiki\//i.test(location.pathname);
    if (isWiki) {
      const dataId = window.DATA && window.DATA.clientVars && window.DATA.clientVars.data && window.DATA.clientVars.data.id;
      if (dataId && typeof dataId === 'string') return dataId;
    }
    const match = location.pathname.match(/\/(?:docx|wiki)\/([^/?#]+)/i);
    return match ? match[1] : '';
  }

  function attributedTextToStringInPage(source, preserveNewlines) {
    if (!source || typeof source !== 'object' || !source.text || typeof source.text !== 'object') return '';
    var raw = Object.entries(source.text)
      .filter(([key, value]) => /^\d+$/.test(key) && typeof value === 'string')
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, value]) => value)
      .join('')
      .replace(/\u200b/g, '');
    if (preserveNewlines) {
      // For code blocks: only collapse horizontal whitespace runs, keep newlines
      return raw.replace(/[ \t]+/g, ' ').replace(/^ | $/gm, '').replace(/^\n+|\n+$/g, '');
    }
    return raw.replace(/[ \t]+/g, ' ').trim();
  }

  function getSelectionTextareaText() {
    const textarea = document.querySelector('textarea.docx-selection-hidden-textarea');
    if (!textarea) return '';
    return textarea.value || textarea.textContent || '';
  }

  function getLongestTextCandidate() {
    const candidates = [
      document.querySelector('textarea.docx-selection-hidden-textarea'),
      document.querySelector('[data-testid="bitable-rich-text-editor"]'),
      document.querySelector('[role="main"]'),
      document.querySelector('main'),
    ].filter(Boolean);

    let bestText = '';
    for (const node of candidates) {
      const raw = node.value || node.textContent || '';
      if (raw.length > bestText.length) bestText = raw;
    }
    return bestText;
  }

  function normalizeType(type) {
    return typeof type === 'string' ? type : '';
  }

  function valueFromPath(root, path) {
    let current = root;
    for (const part of path) {
      if (!current || typeof current !== 'object') return null;
      current = current[part];
    }
    return current;
  }

  function summarizeBlockStore(path, store, docId) {
    if (!store || typeof store !== 'object') return null;
    const entries = Object.entries(store);
    if (entries.length === 0) return null;

    const summary = {
      path,
      size: entries.length,
      typedCount: 0,
      docParentMatchCount: 0,
      nonEmptyTextCount: 0,
      typeHistogram: {},
      versionSamples: [],
      samples: [],
    };

    for (const [entryKey, raw] of entries.slice(0, 5000)) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw;
      const data = entry.data && typeof entry.data === 'object' ? entry.data : entry;
      if (!data || typeof data !== 'object') continue;

      const type = normalizeType(data.type);
      const parentId = typeof data.parent_id === 'string' ? data.parent_id : '';
      const version = typeof entry.version === 'number' ? entry.version : null;
      const childCount = Array.isArray(data.children) ? data.children.length : 0;
      const textSource = data.text && data.text.initialAttributedTexts ? data.text.initialAttributedTexts : data.initialAttributedTexts || data.text;
      const text = attributedTextToStringInPage(textSource);
      const isTyped = Boolean(type || parentId || childCount > 0 || text);

      if (isTyped) summary.typedCount += 1;
      if (parentId === docId) summary.docParentMatchCount += 1;
      if (text) summary.nonEmptyTextCount += 1;
      if (type) summary.typeHistogram[type] = (summary.typeHistogram[type] || 0) + 1;
      if (version != null && summary.versionSamples.length < 20) summary.versionSamples.push(version);

      if ((parentId === docId || text) && summary.samples.length < 20) {
        summary.samples.push({
          key: entryKey,
          id: typeof entry.id === 'string' ? entry.id : entryKey,
          parentId,
          type,
          version,
          childCount,
          text: text.slice(0, 120),
        });
      }
    }

    return summary;
  }

  function extractOrderedBlocksFromStore(store, docId) {
    if (!store || typeof store !== 'object' || !docId) return [];

    const pageEntry = store[docId];
    const pageData = pageEntry && pageEntry.data && typeof pageEntry.data === 'object' ? pageEntry.data : null;
    const pageChildren = Array.isArray(pageData && pageData.children) ? pageData.children : [];
    const blocks = [];
    const visited = new Set();

    function visit(blockId) {
      if (!blockId || visited.has(blockId)) return;
      visited.add(blockId);

      const entry = store[blockId];
      if (!entry || typeof entry !== 'object') return;
      const data = entry.data && typeof entry.data === 'object' ? entry.data : entry;
      if (!data || typeof data !== 'object') return;

      const type = normalizeType(data.type);
      const parentId = typeof data.parent_id === 'string' ? data.parent_id : '';
      const childIds = Array.isArray(data.children) ? data.children : [];
      const textSource = data.text && data.text.initialAttributedTexts ? data.text.initialAttributedTexts : data.initialAttributedTexts || data.text;
      // Code blocks need newlines preserved; other blocks collapse whitespace
      const isCodeBlock = type === 'code';
      const text = attributedTextToStringInPage(textSource, isCodeBlock);
      // Language for code blocks (e.g. "Markdown", "Python", "JavaScript")
      const codeLanguage = isCodeBlock && typeof data.language === 'string' && data.language ? data.language.toLowerCase() : undefined;

      const imageData = data.image && typeof data.image === 'object' ? data.image : null;
      const imageCaption = imageData ? attributedTextToStringInPage(imageData.caption && imageData.caption.text ? imageData.caption.text : imageData.caption) : '';
      const sheetToken = typeof data.token === 'string' && type === 'sheet' ? data.token : undefined;

      // ── docx native table ────────────────────────────────────────────────────
      // Feishu docx tables use rows_id + columns_id + cell_set instead of children.
      let tableRows = undefined;
      if (type === 'table') {
        const rowsId = Array.isArray(data.rows_id) ? data.rows_id : [];
        const colsId = Array.isArray(data.columns_id) ? data.columns_id : [];
        const cellSet = data.cell_set && typeof data.cell_set === 'object' ? data.cell_set : {};

        function getCellText(cellBlockId) {
          const cellEntry = store[cellBlockId];
          if (!cellEntry) return '';
          const cellData = cellEntry.data && typeof cellEntry.data === 'object' ? cellEntry.data : cellEntry;
          const cellChildren = Array.isArray(cellData.children) ? cellData.children : [];
          return cellChildren.map(function(childId) {
            const childEntry = store[childId];
            if (!childEntry) return '';
            const childData = childEntry.data && typeof childEntry.data === 'object' ? childEntry.data : childEntry;
            const childType = normalizeType(childData.type);
            // Image block inside a table cell: emit a placeholder token
            if (childType === 'image') {
              const imgData = childData.image && typeof childData.image === 'object' ? childData.image : null;
              if (imgData && typeof imgData.token === 'string' && imgData.token) {
                const w = typeof imgData.width === 'number' ? imgData.width : 0;
                const h = typeof imgData.height === 'number' ? imgData.height : 0;
                // Use the cell block id as mount_node_token (same as top-level image handling)
                return '__IMG__:' + imgData.token + ':' + cellBlockId + ':' + w + ':' + h;
              }
              return '';
            }
            const textSource = childData.text && childData.text.initialAttributedTexts
              ? childData.text.initialAttributedTexts
              : childData.text;
            return attributedTextToStringInPage(textSource);
          }).join('\n').trim();
        }

        if (rowsId.length > 0 && colsId.length > 0) {
          tableRows = rowsId.map(function(rowId) {
            return colsId.map(function(colId) {
              const cellKey = rowId + colId;
              const cellInfo = cellSet[cellKey];
              if (!cellInfo || !cellInfo.block_id) return '';
              return getCellText(cellInfo.block_id);
            });
          });
        }
      }

      blocks.push({
        key: blockId,
        id: typeof entry.id === 'string' ? entry.id : blockId,
        parentId,
        type,
        version: typeof entry.version === 'number' ? entry.version : null,
        childCount: childIds.length,
        text,
        codeLanguage,
        imageToken: imageData && typeof imageData.token === 'string' ? imageData.token : undefined,
        imageName: imageData && typeof imageData.name === 'string' ? imageData.name : undefined,
        imageCaption,
        imageWidth: imageData && typeof imageData.width === 'number' ? imageData.width : undefined,
        imageHeight: imageData && typeof imageData.height === 'number' ? imageData.height : undefined,
        sheetToken,
        sheetTitle: type === 'sheet' ? text : undefined,
        tableRows,
      });

      for (const childId of childIds) {
        visit(childId);
      }
    }

    for (const childId of pageChildren) {
      visit(childId);
    }

    return blocks;
  }

  function inspectRuntimeData() {
    const docId = getDocId();
    const root = window.DATA && window.DATA.clientVars && window.DATA.clientVars.data ? window.DATA.clientVars.data : null;
    if (!docId || !root || typeof root !== 'object') return null;

    const candidatePaths = [
      ['window.DATA.clientVars.data.block_map', root.block_map],
      ['window.DATA.clientVars.data', root],
      ['window.DATA.clientVars', window.DATA && window.DATA.clientVars],
      ['window.DATA', window.DATA],
      ['window.__SSR_DOC_INFO__', window.__SSR_DOC_INFO__],
      ['window.SERVER_DATA', window.SERVER_DATA],
    ];

    const storeSummaries = [];
    let chosenStorePath = '';
    let orderedBlocks = [];

    for (const [path, value] of candidatePaths) {
      const summary = summarizeBlockStore(path, value, docId);
      if (summary) storeSummaries.push(summary);
      if (!chosenStorePath && path === 'window.DATA.clientVars.data.block_map' && value && typeof value === 'object') {
        chosenStorePath = path;
        orderedBlocks = extractOrderedBlocksFromStore(value, docId);
      }
    }

    storeSummaries.sort((a, b) => b.docParentMatchCount - a.docParentMatchCount || b.nonEmptyTextCount - a.nonEmptyTextCount || b.size - a.size);

    const pageEntry = valueFromPath(root, ['block_map', docId]);
    const pageData = pageEntry && pageEntry.data && typeof pageEntry.data === 'object' ? pageEntry.data : null;
    const pageTitle = pageData ? attributedTextToStringInPage(pageData.text && pageData.text.initialAttributedTexts ? pageData.text.initialAttributedTexts : pageData.text) : '';

    return {
      docId,
      pageTitle,
      chosenStorePath,
      topLevelBlocks: orderedBlocks,
      storeSummaries,
    };
  }

  const title =
    clean(document.querySelector('h1')?.textContent) ||
    clean(document.querySelector('[role="heading"]')?.textContent) ||
    clean(document.title.replace(/\s*-\s*飞书.*/, '')) ||
    'Untitled Feishu Doc';

  const selectionText = getSelectionTextareaText();
  const bestText = getLongestTextCandidate();
  const runtime = inspectRuntimeData();

  return {
    title,
    selectionText,
    bestText,
    runtime,
  };
})()
`;

type RuntimeBlock = {
  key: string;
  id: string;
  parentId: string;
  type: string;
  version: number | null;
  childCount: number;
  text: string;
  codeLanguage?: string;
  imageToken?: string;
  imageName?: string;
  imageCaption?: string;
  imageWidth?: number;
  imageHeight?: number;
  sheetToken?: string;
  sheetTitle?: string;
  /** Populated for type === 'table': rows × cols matrix of cell text */
  tableRows?: string[][];
};

type RuntimeStoreSummary = {
  path: string;
  size: number;
  typedCount: number;
  docParentMatchCount: number;
  nonEmptyTextCount: number;
  typeHistogram: Record<string, number>;
  versionSamples: number[];
  samples: Array<{
    key: string;
    id: string;
    parentId: string;
    type: string;
    version: number | null;
    childCount: number;
    text: string;
  }>;
};

type RuntimeData = {
  docId: string;
  pageTitle: string;
  chosenStorePath: string;
  topLevelBlocks: RuntimeBlock[];
  storeSummaries: RuntimeStoreSummary[];
};

function debugBlockWindow(label: string, blocks: Array<{ type: string; text: string }>, keywords: string[]): void {
  for (const keyword of keywords) {
    const index = blocks.findIndex((block) => block.text.includes(keyword));
    if (index === -1) continue;

    const start = Math.max(0, index - 4);
    const end = Math.min(blocks.length, index + 5);
    console.log(`[extract] ${label} window for "${keyword}":`, JSON.stringify(
      blocks.slice(start, end).map((block, offset) => ({
        index: start + offset,
        type: block.type,
        text: block.text,
      })),
      null,
      2,
    ));
  }
}

function runtimeBlocksToDocBlocks(
  runtime: RuntimeData,
  sourceDocUrl: string | undefined,
  capturedSheets: SheetPayloadSummary[] = [],
): DocBlock[] {
  const sheetPayloads = new Map(capturedSheets.map((item) => [item.token, item.textLines]));

  return normalizeStructuralBlocks(
    mergeAdjacentLists(
      runtime.topLevelBlocks.flatMap((record) => mapRecordToBlocks(record, sourceDocUrl, sheetPayloads)),
    ),
  );
}

async function readRuntimeFromPage(page: Page): Promise<{
  title: string;
  selectionText: string;
  bestText: string;
  runtime: RuntimeData | null;
}> {
  return (await page.evaluate(EXTRACT_DOCUMENT_SCRIPT)) as {
    title: string;
    selectionText: string;
    bestText: string;
    runtime: RuntimeData | null;
  };
}

async function readRuntimeWithRetry(page: Page): Promise<{
  title: string;
  selectionText: string;
  bestText: string;
  runtime: RuntimeData | null;
}> {
  let last = await readRuntimeFromPage(page);
  if (last.runtime?.topLevelBlocks?.length) return last;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.waitForTimeout(800 * attempt);
    last = await readRuntimeFromPage(page);
    if (last.runtime?.topLevelBlocks?.length) return last;
  }

  return last;
}

export async function extractDocument(page: Page, capturedSheets: SheetPayloadSummary[] = []): Promise<ExtractedDocument> {
  const url = page.url();
  const capturedAt = new Date().toISOString();
  const data = await readRuntimeWithRetry(page);

  const runtimeBlocks = data.runtime ? runtimeBlocksToDocBlocks(data.runtime, url, capturedSheets) : [];

  if (data.runtime) {
    const imageCount = data.runtime.topLevelBlocks.filter((block) => block.type === 'image').length;
    const sheetCount = data.runtime.topLevelBlocks.filter((block) => block.type === 'sheet').length;
    console.log('[extract] runtime summary:', JSON.stringify({
      docId: data.runtime.docId,
      storePath: data.runtime.chosenStorePath,
      blockCount: data.runtime.topLevelBlocks.length,
      imageCount,
      sheetCount,
      firstBlocks: verboseDebug
        ? data.runtime.topLevelBlocks.slice(0, 8).map((block) => ({
            id: block.id,
            type: block.type,
            text: block.text,
            childCount: block.childCount,
          }))
        : undefined,
    }, null, 2));

    if (verboseDebug) {
      debugBlockWindow(
        'runtime-top-level',
        data.runtime.topLevelBlocks.map((block) => ({ type: block.type, text: block.text })),
        ['市场增长趋势', '避免选择需要类目审核'],
      );
      debugBlockWindow(
        'runtime-doc-blocks',
        runtimeBlocks.map((block) => ({ type: block.type, text: blockText(block) })),
        ['市场增长趋势', '避免选择需要类目审核'],
      );
    }
  } else {
    console.log('[extract] runtime summary: null');
  }

  const sourceText = normalizeLooseText(data.selectionText).length > 200 ? data.selectionText : data.bestText;
  const plainBlocks = normalizeStructuralBlocks(paragraphsToBlocks(blocksFromPlainText(sourceText)));

  let blocks = buildHybridBlocks(runtimeBlocks, plainBlocks);
  if (blocks.length === 0) {
    blocks = runtimeBlocks.length > 0 ? runtimeBlocks : plainBlocks;
  }

  const finalTitle = normalizeText(data.runtime?.pageTitle) || normalizeText(data.title) || 'Untitled Feishu Doc';

  return {
    title: finalTitle,
    url,
    capturedAt,
    blocks,
  };
}
