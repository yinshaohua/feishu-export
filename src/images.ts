/**
 * 图片本地化：用 Playwright page context（携带飞书登录态）下载图片到本地，
 * 返回相对于 markdown 文件的本地路径。
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { DocBlock } from './types.js';
import { ensureDir, log } from './utils.js';

/** 从 URL 推断扩展名，默认 .png */
function inferExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return ext;
  } catch {
    // ignore
  }
  return '.png';
}

/** 用 URL 内容做稳定文件名（避免路径过长） */
function urlToFilename(url: string, index: number): string {
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
  const ext = inferExtension(url);
  return `img-${String(index + 1).padStart(3, '0')}-${hash}${ext}`;
}

/**
 * 用 Playwright page 的 fetch（携带 Cookie）下载单张图片。
 * 返回写入的本地绝对路径，失败时返回 null。
 */
async function downloadImageWithPage(
  page: Page,
  url: string,
  destPath: string,
): Promise<boolean> {
  try {
    // 在 page context 里执行 fetch，自动带上飞书 Cookie
    const result = await page.evaluate(async (imageUrl: string) => {
      const resp = await fetch(imageUrl, { credentials: 'include' });
      if (!resp.ok) return { ok: false, status: resp.status };
      const buffer = await resp.arrayBuffer();
      // 转成 base64 传回 Node 侧
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return { ok: true, status: resp.status, base64: btoa(binary) };
    }, url) as { ok: boolean; status: number; base64?: string };

    if (!result.ok || !result.base64) {
      log(`[images] 下载失败 (HTTP ${result.status}): ${url}`);
      return false;
    }

    const buffer = Buffer.from(result.base64, 'base64');
    await fs.writeFile(destPath, buffer);
    return true;
  } catch (err) {
    log(`[images] 下载异常: ${(err as Error).message} — ${url}`);
    return false;
  }
}

export type ImageDownloadResult = {
  /** 原始飞书 URL */
  originalUrl: string;
  /** 相对于 markdown 文件的本地路径，如 assets/img-001-abc123.png */
  localPath: string | null;
};

/**
 * 下载文档中所有图片到 <outDir>/assets/ 目录。
 * 返回 URL → 本地相对路径的映射（失败的保留 null）。
 */
export async function downloadDocumentImages(
  page: Page,
  blocks: DocBlock[],
  outDir: string,
): Promise<Map<string, string | null>> {
  const imageBlocks = blocks.filter((b): b is Extract<DocBlock, { type: 'image' }> => b.type === 'image');
  if (imageBlocks.length === 0) return new Map();

  const assetsDir = path.join(outDir, 'assets');
  await ensureDir(assetsDir);

  const results = new Map<string, string | null>();
  log(`[images] 开始下载 ${imageBlocks.length} 张图片...`);

  for (let i = 0; i < imageBlocks.length; i++) {
    const { url } = imageBlocks[i];
    if (results.has(url)) continue; // 同一张图只下载一次

    const filename = urlToFilename(url, i);
    const destPath = path.join(assetsDir, filename);
    const localRelPath = `assets/${filename}`;

    const ok = await downloadImageWithPage(page, url, destPath);
    results.set(url, ok ? localRelPath : null);

    if (ok) {
      log(`[images] [${i + 1}/${imageBlocks.length}] 已保存: ${localRelPath}`);
    }
  }

  const succeeded = [...results.values()].filter(Boolean).length;
  log(`[images] 完成: ${succeeded}/${imageBlocks.length} 张成功`);
  return results;
}

/**
 * 将 blocks 中的图片 URL 替换为本地路径（下载失败的保持原 URL）。
 */
export function localizeImageBlocks(
  blocks: DocBlock[],
  imageMap: Map<string, string | null>,
): DocBlock[] {
  return blocks.map((block) => {
    if (block.type !== 'image') return block;
    const local = imageMap.get(block.url);
    if (!local) return block; // 下载失败，保留原 URL
    return { ...block, url: local };
  });
}
