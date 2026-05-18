/**
 * 飞书云盘文件夹遍历器。
 *
 * 策略：导航到文件夹页面，等待 [class*="file-item"] 渲染，
 * 读取每个条目的 data-obj-token / data-type / data-node-token 属性和链接 href，
 * 递归遍历子文件夹，构建完整目录树。
 *
 * 文件类型（data-type）：
 *   0  → 子文件夹 (folder)
 *   22 → 飞书文档 docx
 *   23 → 飞书表格 sheet
 *   8  → 飞书多维表格 bitable
 *   12 → 上传的文件附件 (file)
 *   其他 → 未知，按文档处理
 */

import type { Page } from 'playwright';
import { log } from './utils.js';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type FolderItemType = 'folder' | 'doc' | 'sheet' | 'bitable' | 'file' | 'unknown';

export interface FolderItem {
  /** 飞书 token（文件夹或文件的唯一标识） */
  token: string;
  /** 节点 token（有时与 token 不同，用于 node 级操作） */
  nodeToken: string;
  /** 条目名称 */
  name: string;
  /** 条目类型 */
  type: FolderItemType;
  /** 完整 URL */
  url: string;
  /** data-type 原始值 */
  rawType: string;
  /** 子条目（仅 folder 类型有） */
  children?: FolderItem[];
}

// ── 类型映射 ──────────────────────────────────────────────────────────────────

function rawTypeToItemType(rawType: string, classes: string): FolderItemType {
  if (classes.includes('file-item-folder') || rawType === '0') return 'folder';
  if (rawType === '22' || classes.includes('file-item-docx')) return 'doc';
  if (rawType === '23' || classes.includes('file-item-sheet')) return 'sheet';
  if (rawType === '8' || classes.includes('file-item-bitable')) return 'bitable';
  if (rawType === '12' || classes.includes('file-item-file')) return 'file';
  return 'unknown';
}

// ── DOM 提取 ──────────────────────────────────────────────────────────────────

/**
 * 从当前页面提取文件夹内所有条目（不递归）。
 * 调用前页面必须已导航到目标文件夹 URL。
 */
export async function extractFolderItems(page: Page): Promise<FolderItem[]> {
  // 等待文件列表渲染
  try {
    await page.waitForSelector('[class*="file-item"]', { timeout: 15_000 });
  } catch {
    log('[folder] 等待 file-item 超时，尝试继续...');
  }
  // 额外等待虚拟列表完全渲染
  await page.waitForTimeout(1500);

  const items = await page.evaluate(`
    (function() {
      var results = [];
      // 只选取直接的 file-item 容器（带 data-obj-token 的那层）
      var els = document.querySelectorAll('[data-obj-token][data-type]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var rawToken = el.getAttribute('data-obj-token') || '';
        var rawType = el.getAttribute('data-type') || '';
        var nodeToken = el.getAttribute('data-node-token') || '';
        var classes = el.className || '';

        // 跳过面包屑等非列表项（它们没有 data-type）
        if (!rawType) continue;

        // token 格式：有时是 "Folder:TOKEN"，有时直接是 TOKEN
        var token = rawToken.includes(':') ? rawToken.split(':')[1] : rawToken;

        // 找链接（先找，名称提取会用到）
        var link = el.querySelector('a[href]');
        var href = link ? link.href : '';

        // 找名称：优先找专门的文件名元素
        var nameEl = el.querySelector('[class*="file-name"], [class*="item-name"], [class*="title-text"], [class*="name-text"]');
        var name = '';
        if (nameEl) {
          name = (nameEl.textContent || '').trim();
        }
        if (!name && link) {
          // 链接文本可能包含整个条目文本，取第一个子文本节点
          var walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
          var textParts = [];
          var node;
          while ((node = walker.nextNode())) {
            var t = (node.textContent || '').trim();
            if (t) textParts.push(t);
          }
          name = textParts[0] || (link.textContent || '').trim();
        }
        if (!name) {
          // 最后回退：取元素文本，去掉 "N-作者-地点日期" 后缀
          var fullText = (el.textContent || '').trim();
          // 飞书元数据格式：名称 + 数字 + "-" + 作者 + "-" + 地点 + 日期
          var match = fullText.match(/^(.+?)(?:\\d+-[^\\d].+)?$/);
          name = match ? match[1].trim() : fullText.slice(0, 80);
        }

        results.push({
          rawToken: rawToken,
          token: token,
          nodeToken: nodeToken,
          name: name,
          rawType: rawType,
          classes: classes,
          href: href,
        });
      }
      return results;
    })()
  `) as Array<{
    rawToken: string;
    token: string;
    nodeToken: string;
    name: string;
    rawType: string;
    classes: string;
    href: string;
  }>;

  // 去重（同一 token 可能出现多次，取第一个）
  const seen = new Set<string>();
  const result: FolderItem[] = [];

  for (const item of items) {
    if (!item.token || seen.has(item.token)) continue;
    seen.add(item.token);

    const type = rawTypeToItemType(item.rawType, item.classes);

    // 构造 URL：如果 href 已经是完整 URL 就用它，否则根据类型构造
    let url = item.href;
    if (!url || !url.startsWith('http')) {
      const origin = new URL(page.url()).origin;
      if (type === 'folder') {
        url = `${origin}/drive/folder/${item.token}`;
      } else if (type === 'doc') {
        url = `${origin}/docx/${item.token}`;
      } else if (type === 'sheet') {
        url = `${origin}/sheets/${item.token}`;
      } else if (type === 'bitable') {
        url = `${origin}/base/${item.token}`;
      } else if (type === 'file') {
        url = `${origin}/file/${item.token}`;
      } else {
        url = `${origin}/docx/${item.token}`;
      }
    }

    result.push({
      token: item.token,
      nodeToken: item.nodeToken || item.token,
      name: item.name || item.token,
      type,
      url,
      rawType: item.rawType,
    });
  }

  return result;
}

// ── 递归遍历 ──────────────────────────────────────────────────────────────────

export interface CrawlOptions {
  /** 最大递归深度，默认 10 */
  maxDepth?: number;
  /** 每次导航后的额外等待毫秒数，默认 500 */
  extraWaitMs?: number;
}

/**
 * 递归遍历文件夹，返回完整目录树。
 *
 * @param page      已认证的 Playwright page
 * @param folderUrl 文件夹 URL
 * @param depth     当前递归深度（内部使用）
 * @param opts      遍历选项
 */
export async function crawlFolderTree(
  page: Page,
  folderUrl: string,
  depth = 0,
  opts: CrawlOptions = {},
): Promise<FolderItem[]> {
  const maxDepth = opts.maxDepth ?? 10;
  const extraWaitMs = opts.extraWaitMs ?? 500;

  if (depth > maxDepth) {
    log(`[folder] 达到最大深度 ${maxDepth}，停止递归`);
    return [];
  }

  log(`[folder] ${'  '.repeat(depth)}正在读取: ${folderUrl}`);

  await page.goto(folderUrl, { waitUntil: 'domcontentloaded' });
  if (extraWaitMs > 0) await page.waitForTimeout(extraWaitMs);

  const items = await extractFolderItems(page);
  log(`[folder] ${'  '.repeat(depth)}找到 ${items.length} 个条目`);

  // 递归处理子文件夹
  for (const item of items) {
    if (item.type === 'folder') {
      item.children = await crawlFolderTree(page, item.url, depth + 1, opts);
    }
  }

  return items;
}

// ── 辅助：获取文件夹名称 ──────────────────────────────────────────────────────

/**
 * 从当前页面的面包屑或标题提取文件夹名称。
 */
export async function extractFolderName(page: Page): Promise<string> {
  // 等待标题从默认值（"Docs" / "飞书云文档"）变成真实文件夹名
  try {
    await page.waitForFunction(
      `document.title && !['Docs', '飞书云文档', 'Feishu Docs', 'Lark Docs'].includes(document.title.replace(/\\s*-\\s*飞书.*$/, '').trim())`,
      { timeout: 8_000 },
    );
  } catch {
    // 超时就用当前值
  }

  const name = await page.evaluate(`
    (function() {
      // 从 URL 提取 token（去掉 query string）
      var urlToken = location.pathname.split('/').filter(Boolean).pop() || '';

      // 找 data-obj-token 等于当前 URL token 的元素（面包屑或列表项）
      if (urlToken) {
        var tokenEl = document.querySelector('[data-obj-token="' + urlToken + '"]');
        if (tokenEl) {
          var text = (tokenEl.textContent || '').trim();
          if (text) return text;
        }
      }

      // 页面标题（去掉 " - 飞书云文档" 后缀）
      var title = document.title.replace(/\\s*-\\s*飞书.*$/, '').replace(/\\s*-\\s*Feishu.*$/i, '').replace(/\\s*-\\s*Lark.*$/i, '').trim();
      if (title && title !== 'Docs') return title;

      return 'feishu-folder';
    })()
  `) as string;

  return name || 'feishu-folder';
}

// ── 辅助：扁平化树 ────────────────────────────────────────────────────────────

/**
 * 将目录树扁平化为带路径的列表，方便批量处理。
 */
export interface FlatItem {
  item: FolderItem;
  /** 相对路径段，如 ['AI相关', '提示词'] */
  pathSegments: string[];
}

export function flattenTree(items: FolderItem[], segments: string[] = []): FlatItem[] {
  const result: FlatItem[] = [];
  for (const item of items) {
    const itemSegments = [...segments, item.name];
    result.push({ item, pathSegments: itemSegments });
    if (item.children) {
      result.push(...flattenTree(item.children, itemSegments));
    }
  }
  return result;
}
