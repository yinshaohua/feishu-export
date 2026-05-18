export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type DocBlock =
  | { type: 'heading'; level: HeadingLevel; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; url: string; alt?: string }
  | { type: 'link'; url: string; text: string }
  | { type: 'bullet_list'; items: string[] }
  | { type: 'ordered_list'; items: string[] }
  | { type: 'todo_list'; items: Array<{ checked: boolean; text: string }> }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; text: string; language?: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'divider' };

export interface ExtractedDocument {
  title: string;
  url: string;
  capturedAt: string;
  debugNotes?: string[];
  blocks: DocBlock[];
}

export interface CliOptions {
  interactive: boolean;
  url?: string;
  file?: string;
  /** 飞书云盘文件夹 URL，触发 --folder 模式 */
  folder?: string;
  outDir: string;
  profileDir: string;
}

// ── Bitable (多维表格) types ──────────────────────────────────────────────────

/** Feishu Bitable field type codes (from API) */
export const enum FieldType {
  Text       = 1,
  Number     = 2,
  SingleSelect = 3,
  MultiSelect  = 3,  // same wire type, distinguished by options presence
  DateTime   = 5,
  Checkbox   = 7,
  Person     = 11,
  Phone      = 13,
  Url        = 15,
  Attachment = 17,
  Link       = 18,
  Lookup     = 19,
  Formula    = 20,
  AutoNumber = 1005,
  CreatedTime = 1002,
  ModifiedTime = 1003,
  CreatedUser  = 1004,
  ModifiedUser = 1005,
}

export interface BitableField {
  id: string;
  name: string;
  /** Raw numeric type from API */
  type: number;
}

/** A single cell value. `text` is the human-readable label; `link` is present for URL/link fields. */
export interface CellValue {
  text: string;
  /** Hyperlink target, present when the field is a URL or link type */
  link?: string;
}

export interface BitableRecord {
  id: string;
  /** fieldId → cell value */
  cells: Record<string, CellValue>;
}

export interface BitableTable {
  /** The table (block) ID, e.g. tblXxx */
  tableId: string;
  /** Human-readable title from meta */
  title: string;
  /** Base token, e.g. BUptbXxx */
  baseToken: string;
  /** Ordered list of fields (columns) */
  fields: BitableField[];
  /** All records in the current view order */
  records: BitableRecord[];
}
