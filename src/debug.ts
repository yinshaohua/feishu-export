import type { Page } from 'playwright';

export interface DebugSnapshot {
  url: string;
  title: string;
  bodyTextLength: number;
  mainTextLength: number;
  visibleTextSample: string[];
  iframeCount: number;
  contentEditableCount: number;
  roleSummary: Array<{ role: string; count: number }>;
  tagSummary: Array<{ tag: string; count: number }>;
  selectors: Record<string, number>;
  selectionTextarea: {
    exists: boolean;
    valueLength: number;
    textLength: number;
    selectionStart: number;
    selectionEnd: number;
    sampleStart: string;
    sampleEnd: string;
    className: string;
    ariaHidden: string;
  };
  activeElement: {
    tag: string;
    role: string;
    className: string;
    contenteditable: string;
    sample: string;
  };
  editableAncestors: Array<{
    depth: number;
    tag: string;
    role: string;
    contenteditable: string;
    className: string;
    textLength: number;
    childCount: number;
    sample: string;
  }>;
  bodySubtrees: Array<{
    path: string;
    level: number;
    index: number;
    tag: string;
    role: string;
    className: string;
    textLength: number;
    childCount: number;
    rectTop: number;
    rectHeight: number;
    sample: string;
  }>;
}

const DEBUG_SCRIPT = String.raw`
(() => {
  function textOf(el) {
    return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function cleanSnippet(text) {
    return (text || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function summarize(items) {
    const counts = new Map();
    for (const item of items) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  function nodeInfo(el, level, index, path) {
    const rect = el.getBoundingClientRect();
    const text = textOf(el);
    return {
      path,
      level,
      index,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      className: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
      textLength: text.length,
      childCount: el.childElementCount,
      rectTop: Math.round(rect.top),
      rectHeight: Math.round(rect.height),
      sample: text.slice(0, 160),
    };
  }

  const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
  const visibleNodes = Array.from(document.querySelectorAll('body *'))
    .filter((el) => isVisible(el))
    .map((el) => textOf(el))
    .filter((text) => text.length >= 20)
    .slice(0, 50);

  const roleSummary = summarize(
    Array.from(document.querySelectorAll('[role]')).map((el) => el.getAttribute('role') || ''),
  ).map((item) => ({ role: item.key, count: item.count }));

  const tagSummary = summarize(
    Array.from(document.querySelectorAll('body *')).map((el) => el.tagName.toLowerCase()),
  ).map((item) => ({ tag: item.key, count: item.count }));

  const selectors = {
    main: document.querySelectorAll('main').length,
    roleMain: document.querySelectorAll('[role="main"]').length,
    article: document.querySelectorAll('article').length,
    contentEditable: document.querySelectorAll('[contenteditable="true"]').length,
    iframe: document.querySelectorAll('iframe').length,
    canvas: document.querySelectorAll('canvas').length,
    paragraph: document.querySelectorAll('p').length,
    heading: document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]').length,
    pre: document.querySelectorAll('pre').length,
    table: document.querySelectorAll('table').length,
  };

  const editableAncestors = [];
  const activeElement = (() => {
    const el = document.activeElement;
    if (!(el instanceof Element)) {
      return { tag: '', role: '', className: '', contenteditable: '', sample: '' };
    }
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      className: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
      contenteditable: el.getAttribute('contenteditable') || '',
      sample: cleanSnippet((el.textContent || '').slice(0, 120)),
    };
  })();
  const selectionTextarea = (() => {
    const textarea = document.querySelector('textarea.docx-selection-hidden-textarea');
    if (!textarea) {
      return {
        exists: false,
        valueLength: 0,
        textLength: 0,
        selectionStart: -1,
        selectionEnd: -1,
        sampleStart: '',
        sampleEnd: '',
        className: '',
        ariaHidden: '',
      };
    }

    const value = textarea.value || '';
    const textContent = textarea.textContent || '';
    return {
      exists: true,
      valueLength: value.length,
      textLength: textContent.length,
      selectionStart: typeof textarea.selectionStart === 'number' ? textarea.selectionStart : -1,
      selectionEnd: typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : -1,
      sampleStart: cleanSnippet(value.slice(0, 200) || textContent.slice(0, 200)),
      sampleEnd: cleanSnippet(value.slice(-200) || textContent.slice(-200)),
      className: textarea.className || '',
      ariaHidden: textarea.getAttribute('aria-hidden') || '',
    };
  })();

  const editable = document.querySelector('[contenteditable="true"]');
  if (editable) {
    let node = editable;
    let depth = 0;
    while (node && node instanceof Element) {
      const text = textOf(node);
      editableAncestors.push({
        depth,
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute('role') || '',
        contenteditable: node.getAttribute('contenteditable') || '',
        className: typeof node.className === 'string' ? node.className.slice(0, 120) : '',
        textLength: text.length,
        childCount: node.childElementCount,
        sample: text.slice(0, 120),
      });
      node = node.parentElement;
      depth += 1;
      if (depth > 12) break;
    }
  }

  const bodySubtrees = [];
  const level1 = Array.from(document.body.children).filter((el) => isVisible(el));
  level1.forEach((el, i) => {
    bodySubtrees.push(nodeInfo(el, 1, i, String(i)));
  });

  const mainRoot = level1.find((el) => textOf(el).length > 500) || level1[0];
  if (mainRoot) {
    const level2 = Array.from(mainRoot.children).filter((el) => isVisible(el));
    level2.forEach((el, i) => {
      bodySubtrees.push(nodeInfo(el, 2, i, '0>' + i));
    });

    const biggestLevel2 = level2
      .map((el, i) => ({ el, i, len: textOf(el).length }))
      .sort((a, b) => b.len - a.len)[0];

    if (biggestLevel2) {
      const level3 = Array.from(biggestLevel2.el.children).filter((el) => isVisible(el));
      level3.forEach((el, i) => {
        bodySubtrees.push(nodeInfo(el, 3, i, '0>' + biggestLevel2.i + '>' + i));
      });
    }
  }

  bodySubtrees.sort((a, b) => b.textLength - a.textLength);

  return {
    url: location.href,
    title: document.title,
    bodyTextLength: textOf(document.body).length,
    mainTextLength: textOf(main).length,
    visibleTextSample: visibleNodes,
    iframeCount: document.querySelectorAll('iframe').length,
    contentEditableCount: document.querySelectorAll('[contenteditable="true"]').length,
    roleSummary,
    tagSummary,
    selectors,
    selectionTextarea,
    activeElement,
    editableAncestors,
    bodySubtrees: bodySubtrees.slice(0, 20),
  };
})()
`;

export async function collectDebugSnapshot(page: Page): Promise<DebugSnapshot> {
  return (await page.evaluate(DEBUG_SCRIPT)) as DebugSnapshot;
}
