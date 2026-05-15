import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { log } from './utils.js';

const FEISHU_DOC_PATTERNS = [
  /feishu\.cn\/docx\//i,
  /feishu\.cn\/docs?\//i,
  /feishu\.cn\/wiki\//i,
  /larksuite\.com\/docx\//i,
  /larksuite\.com\/wiki\//i,
];

const GET_MAIN_TEXT_LENGTH_SCRIPT = String.raw`
(() => {
  const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
  return ((main && main.textContent) || '').replace(/\s+/g, ' ').trim().length;
})()
`;

const GET_SCROLL_METRICS_SCRIPT = String.raw`
(() => {
  const root = document.scrollingElement || document.documentElement;
  return {
    height: root.scrollHeight,
    scrollTop: root.scrollTop,
    clientHeight: root.clientHeight,
  };
})()
`;

const SCROLL_DOWN_SCRIPT = String.raw`
(() => {
  const root = document.scrollingElement || document.documentElement;
  root.scrollBy(0, Math.floor(root.clientHeight * 0.85));
})()
`;

const SCROLL_TO_TOP_SCRIPT = String.raw`
(() => {
  const root = document.scrollingElement || document.documentElement;
  root.scrollTo(0, 0);
})()
`;

const GET_RUNTIME_METRICS_SCRIPT = String.raw`
(() => {
  const dataRoot = window.DATA && window.DATA.clientVars && window.DATA.clientVars.data;
  const isWiki = /\/wiki\//i.test(location.pathname);
  const docId = isWiki
    ? (dataRoot && typeof dataRoot.id === 'string' ? dataRoot.id : '')
    : (() => { const m = location.pathname.match(/\/(?:docx|wiki)\/([^/?#]+)/i); return m ? m[1] : ''; })();
  const blockMap = dataRoot && typeof dataRoot === 'object' ? dataRoot.block_map : null;
  const pageEntry = blockMap && docId ? blockMap[docId] : null;
  const pageData = pageEntry && pageEntry.data && typeof pageEntry.data === 'object' ? pageEntry.data : null;
  const childCount = Array.isArray(pageData && pageData.children) ? pageData.children.length : 0;
  return {
    hasDocId: Boolean(docId),
    hasBlockMap: Boolean(blockMap && typeof blockMap === 'object'),
    hasPageEntry: Boolean(pageEntry && typeof pageEntry === 'object'),
    childCount,
  };
})()
`;

export async function launchPersistentBrowser(profileDir: string): Promise<{ context: BrowserContext; page: Page }> {
  const absoluteProfileDir = path.resolve(profileDir);
  const context = await chromium.launchPersistentContext(absoluteProfileDir, {
    headless: false,
    viewport: { width: 1440, height: 960 },
  });

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export function isFeishuDocUrl(url: string): boolean {
  return FEISHU_DOC_PATTERNS.some((pattern) => pattern.test(url));
}

export async function gotoIfNeeded(page: Page, url?: string): Promise<void> {
  if (!url) return;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

export async function waitForDocumentReady(page: Page, timeoutMs = 30_000): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });

  const start = Date.now();
  let stableCount = 0;
  let lastLength = -1;

  while (Date.now() - start < timeoutMs) {
    const currentLength = (await page.evaluate(GET_MAIN_TEXT_LENGTH_SCRIPT)) as number;

    if (currentLength > 0 && Math.abs(currentLength - lastLength) < 20) {
      stableCount += 1;
      if (stableCount >= 3) return;
    } else {
      stableCount = 0;
    }

    lastLength = currentLength;
    await page.waitForTimeout(500);
  }

  throw new Error('等待文档内容稳定超时。');
}

export async function ensureOnFeishuDoc(page: Page): Promise<void> {
  const currentUrl = page.url();
  if (!isFeishuDocUrl(currentUrl)) {
    throw new Error(`当前页面不是飞书文档页: ${currentUrl}`);
  }
}

export async function waitForRuntimeReady(page: Page, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const metrics = (await page.evaluate(GET_RUNTIME_METRICS_SCRIPT)) as {
      hasDocId: boolean;
      hasBlockMap: boolean;
      hasPageEntry: boolean;
      childCount: number;
    };

    if (metrics.hasDocId && metrics.hasBlockMap && metrics.hasPageEntry && metrics.childCount > 0) {
      return;
    }

    await page.waitForTimeout(400);
  }
}

export async function autoScrollDocument(page: Page): Promise<void> {
  log('正在滚动加载全文...');

  let previousHeight = -1;
  let unchangedRounds = 0;

  for (let i = 0; i < 200; i += 1) {
    const { height, scrollTop, clientHeight } = (await page.evaluate(GET_SCROLL_METRICS_SCRIPT)) as {
      height: number;
      scrollTop: number;
      clientHeight: number;
    };

    await page.evaluate(SCROLL_DOWN_SCRIPT);
    await page.waitForTimeout(400);

    const nearBottom = scrollTop + clientHeight >= height - 32;
    if (height === previousHeight || nearBottom) {
      unchangedRounds += 1;
    } else {
      unchangedRounds = 0;
    }

    previousHeight = height;

    if (unchangedRounds >= 3) break;
  }

  await page.evaluate(SCROLL_TO_TOP_SCRIPT);
  await page.waitForTimeout(300);
}
