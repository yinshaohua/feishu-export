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
  outDir: string;
  profileDir: string;
}
