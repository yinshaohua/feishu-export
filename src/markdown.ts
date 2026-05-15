import type { DocBlock, ExtractedDocument } from './types.js';

function escapeMarkdownImageAlt(text: string): string {
  return text.replace(/[\[\]\\]/g, '\\$&');
}

function toMarkdownLinkTarget(url: string): string {
  return url.trim().replace(/ /g, '%20');
}

function renderBlock(block: DocBlock): string {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${block.text}`;
    case 'paragraph':
      return block.text;
    case 'image': {
      const alt = escapeMarkdownImageAlt(block.alt?.trim() || 'image');
      const target = toMarkdownLinkTarget(block.url);
      // 本地路径直接嵌入图片；远程 URL（下载失败时的回退）附加备用链接
      const isLocal = !block.url.startsWith('http');
      return isLocal
        ? `![${alt}](${target})`
        : `[查看图片](${target})\n\n![${alt}](${target})`;
    }
    case 'link':
      return `[${block.text}](${block.url})`;
    case 'bullet_list':
      return block.items.map((item) => `- ${item}`).join('\n');
    case 'ordered_list':
      return block.items.map((item, index) => `${index + 1}. ${item}`).join('\n');
    case 'todo_list':
      return block.items
        .map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`)
        .join('\n');
    case 'blockquote':
      return block.text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'code': {
      const lang = block.language ?? '';
      return `\`\`\`${lang}\n${block.text}\n\`\`\``;
    }
    case 'table': {
      if (block.rows.length === 0) return '';
      const [header, ...rows] = block.rows;
      const separator = header.map(() => '---');
      const lines = [header, separator, ...rows].map((row) => `| ${row.join(' | ')} |`);
      return lines.join('\n');
    }
    case 'divider':
      return '---';
    default:
      return '';
  }
}

export function toMarkdown(doc: ExtractedDocument): string {
  const frontmatter = [
    '---',
    'source: feishu',
    `source_url: ${doc.url}`,
    `captured_at: ${doc.capturedAt}`,
    `title: ${JSON.stringify(doc.title)}`,
    `debug_notes: ${JSON.stringify(doc.debugNotes ?? [])}`,
    '---',
  ].join('\n');

  const body = doc.blocks.map(renderBlock).filter(Boolean).join('\n\n');
  return `${frontmatter}\n\n# ${doc.title}\n\n${body}\n`;
}
