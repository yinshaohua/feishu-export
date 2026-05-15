import type { DocBlock, HeadingLevel } from './types.js';

function isMetadataLine(text: string): boolean {
  return /^分享者：/.test(text);
}

function isSectionHeading(block: DocBlock | null | undefined): boolean {
  return block?.type === 'heading' && block.level <= 3;
}

type SplitParagraphResult =
  | { kind: 'unchanged' }
  | { kind: 'split'; headingText: string; headingLevel: HeadingLevel; paragraphText: string };

function parseParenOrderedItem(text: string): { index: number; content: string } | null {
  const match = text.match(/^（(\d+)）\s*(.+)$/);
  if (!match) return null;
  return {
    index: Number(match[1]),
    content: match[2].trim(),
  };
}

function normalizeHeadingNumberMarker(text: string): string {
  return text.replace(/^(\d+(?:\.\d+)*)\.(\s*)/, '$1．$2');
}

function inferHeadingLevelFromParagraph(text: string): HeadingLevel | null {
  if (/^[一二三四五六七八九十]+、/.test(text)) return 2;
  if (/^\d+[、]/.test(text)) return 3;
  if (/^（\d+）/.test(text) && text.length <= 18 && !/[，。；：,.]/.test(text.replace(/^（\d+）/, ''))) return 3;
  return null;
}

function isSequentialParenOrderedContext(blocks: DocBlock[], index: number): boolean {
  const current = blocks[index];
  const currentText = current?.type === 'paragraph' || current?.type === 'heading' ? current.text : null;
  const parsedCurrent = currentText ? parseParenOrderedItem(currentText) : null;
  if (!parsedCurrent) return false;

  const prev = index > 0 ? blocks[index - 1] : null;
  const prevText = prev?.type === 'paragraph' || prev?.type === 'heading' ? prev.text : null;
  const parsedPrev = prevText ? parseParenOrderedItem(prevText) : null;

  const next = index + 1 < blocks.length ? blocks[index + 1] : null;
  const nextText = next?.type === 'paragraph' || next?.type === 'heading' ? next.text : null;
  const parsedNext = nextText ? parseParenOrderedItem(nextText) : null;

  return Boolean(
    (parsedPrev && parsedPrev.index + 1 === parsedCurrent.index) ||
    (parsedNext && parsedNext.index === parsedCurrent.index + 1),
  );
}

function isContextualSectionSource(block: DocBlock | null | undefined): boolean {
  if (!block) return false;
  if (isSectionHeading(block)) return true;
  if (block.type !== 'paragraph') return false;

  const text = block.text.trim();
  if (!text) return false;
  if (/^\d+(?:\.\d+)*[.．]?\s*[^：；:]{2,24}[：；:]$/.test(text)) return true;
  if (/^[一二三四五六七八九十]+、.+$/.test(text)) return true;
  if (/^（\d+）.+$/.test(text) && text.length <= 18) return true;
  return false;
}

function inferContextualNumericHeading(blocks: DocBlock[], index: number): DocBlock | null {
  const block = blocks[index];
  if (block?.type !== 'paragraph') return null;

  const match = block.text.match(/^(\d+(?:\.\d+)*)[.．]\s*(.+)$/);
  if (!match) return null;

  const marker = match[1];
  const content = match[2].trim();
  if (!/[：；:]$/.test(content)) return null;
  if (content.length > 28) return null;

  const prevSectionHeading = findNearbySectionHeading(blocks, index);
  const next = index + 1 < blocks.length ? blocks[index + 1] : null;
  if (!prevSectionHeading && !isSectionHeading(next)) return null;

  return {
    type: 'heading',
    level: 4,
    text: normalizeHeadingNumberMarker(`${marker}. ${content}`),
  };
}

function findNearbySectionHeading(blocks: DocBlock[], index: number): DocBlock | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = blocks[cursor];
    if (isContextualSectionSource(candidate)) return candidate;
    if (candidate?.type === 'heading' && candidate.level <= 3) return candidate;
    if (candidate?.type === 'heading' && candidate.level >= 4) continue;
    if (candidate?.type && candidate.type !== 'paragraph' && candidate.type !== 'heading') break;
  }
  return null;
}

function splitInlineNumericSectionParagraph(blocks: DocBlock[], index: number): SplitParagraphResult {
  const block = blocks[index];
  if (block?.type !== 'paragraph') return { kind: 'unchanged' };

  const prevSectionHeading = findNearbySectionHeading(blocks, index);
  if (!prevSectionHeading) return { kind: 'unchanged' };

  const match = block.text.match(/^(\d+(?:\.\d+)*)(?:[.．])?\s*([^：；:]{2,24}[：；:])(\s*.+)$/);
  if (!match) return { kind: 'unchanged' };

  const [, marker, rawTitle, rawBody] = match;
  const headingText = normalizeHeadingNumberMarker(`${marker}. ${rawTitle.trim()}`);
  const paragraphText = rawBody.trim();

  if (/https?:$/i.test(rawTitle.trim())) return { kind: 'unchanged' };
  if (paragraphText.length < 18) return { kind: 'unchanged' };
  if (/^https?:\/\//i.test(paragraphText)) return { kind: 'unchanged' };

  return {
    kind: 'split',
    headingLevel: 4,
    headingText,
    paragraphText,
  };
}

function collapseContextualOrderedParagraphs(blocks: DocBlock[]): DocBlock[] {
  const result: DocBlock[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const currentText = block.type === 'paragraph' || block.type === 'heading' ? block.text : null;
    const current = currentText ? parseParenOrderedItem(currentText) : null;
    if (!current) {
      result.push(block);
      continue;
    }

    const prevBlock = i > 0 ? blocks[i - 1] : null;
    const nextBlock = i + 1 < blocks.length ? blocks[i + 1] : null;
    const prevText = prevBlock && (prevBlock.type === 'paragraph' || prevBlock.type === 'heading') ? prevBlock.text : null;
    const nextText = nextBlock && (nextBlock.type === 'paragraph' || nextBlock.type === 'heading') ? nextBlock.text : null;
    const prev = prevText ? parseParenOrderedItem(prevText) : null;
    const next = nextText ? parseParenOrderedItem(nextText) : null;
    const isSequence =
      (prev !== null && prev.index + 1 === current.index) ||
      (next !== null && next.index === current.index + 1) ||
      current.index === 1;

    if (!isSequence) {
      result.push(block);
      continue;
    }

    const items: string[] = [current.content];
    let cursor = i + 1;
    let expectedIndex = current.index + 1;

    while (cursor < blocks.length) {
      const candidate = blocks[cursor];
      const candidateText = candidate.type === 'paragraph' || candidate.type === 'heading' ? candidate.text : null;
      if (!candidateText) break;
      const parsed = parseParenOrderedItem(candidateText);
      if (!parsed || parsed.index !== expectedIndex) break;
      items.push(parsed.content);
      expectedIndex += 1;
      cursor += 1;
    }

    result.push({ type: 'ordered_list', items });
    i = cursor - 1;
  }

  return result;
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

export function normalizeStructuralBlocks(blocks: DocBlock[]): DocBlock[] {
  const normalized: DocBlock[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (block.type === 'heading') {
      if (isMetadataLine(block.text)) {
        normalized.push({ type: 'paragraph', text: block.text });
      } else {
        normalized.push({
          ...block,
          text: normalizeHeadingNumberMarker(block.text),
        });
      }
      continue;
    }

    if (block.type === 'paragraph') {
      const split = splitInlineNumericSectionParagraph(blocks, index);
      if (split.kind === 'split') {
        normalized.push({ type: 'heading', level: split.headingLevel, text: split.headingText });
        normalized.push({ type: 'paragraph', text: split.paragraphText });
        continue;
      }

      const contextualNumericHeading = inferContextualNumericHeading(blocks, index);
      if (contextualNumericHeading) {
        normalized.push(contextualNumericHeading);
        continue;
      }

      const inferredLevel = inferHeadingLevelFromParagraph(block.text);
      if (inferredLevel) {
        if (/^（\d+）/.test(block.text) && isSequentialParenOrderedContext(blocks, index)) {
          normalized.push(block);
          continue;
        }
        normalized.push({ type: 'heading', level: inferredLevel, text: normalizeHeadingNumberMarker(block.text) });
        continue;
      }
    }

    normalized.push(block);
  }

  return mergeAdjacentLists(collapseContextualOrderedParagraphs(normalized));
}
