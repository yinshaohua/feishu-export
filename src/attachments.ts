/**
 * 飞书云盘附件下载器。
 *
 * 飞书上传的文件（data-type=12，URL 格式 /file/<token>）通过
 * 页面内 fetch（携带 Cookie）直接下载二进制内容。
 *
 * 下载 URL 格式（从网络请求观察）：
 *   /space/api/box/stream/download/all/<token>
 *
 * 若直接下载失败，回退到导航到 /file/<token> 页面并触发浏览器下载事件。
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import { ensureDir, log } from './utils.js';

// ── 文件名处理 ────────────────────────────────────────────────────────────────

/** 从 Content-Disposition 头提取文件名 */
function extractFilenameFromContentDisposition(header: string): string | null {
  // filename*=UTF-8''xxx 或 filename="xxx"
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try { return decodeURIComponent(utf8Match[1]); } catch { /* ignore */ }
  }
  const plainMatch = header.match(/filename="([^"]+)"/i);
  if (plainMatch) return plainMatch[1];
  const noQuoteMatch = header.match(/filename=([^;]+)/i);
  if (noQuoteMatch) return noQuoteMatch[1].trim();
  return null;
}

/** 从 URL 推断扩展名 */
function inferExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (ext && ext.length <= 6) return ext;
  } catch { /* ignore */ }
  return '';
}

/** 生成稳定的本地文件名 */
function makeLocalFilename(originalName: string, token: string, fallbackExt = ''): string {
  if (originalName) {
    // 清理非法字符
    return originalName.replace(/[\\/:*?"<>|]/g, '_').trim();
  }
  const hash = crypto.createHash('sha1').update(token).digest('hex').slice(0, 8);
  return `attachment-${hash}${fallbackExt}`;
}

// ── 下载实现 ──────────────────────────────────────────────────────────────────

export interface AttachmentDownloadResult {
  /** 原始 token */
  token: string;
  /** 原始名称（可能为空） */
  originalName: string;
  /** 本地保存路径（绝对路径），失败时为 null */
  localPath: string | null;
  /** 相对于 outDir 的路径，用于 Markdown 链接 */
  relativePath: string | null;
}

/**
 * 下载单个飞书附件到 destDir。
 *
 * @param page      已认证的 Playwright page（用于携带 Cookie 发起 fetch）
 * @param token     文件 token（来自 data-obj-token）
 * @param name      文件名（来自 DOM 文本，可能为空）
 * @param destDir   目标目录（绝对路径）
 */
export async function downloadAttachment(
  page: Page,
  token: string,
  name: string,
  destDir: string,
): Promise<AttachmentDownloadResult> {
  await ensureDir(destDir);

  const origin = new URL(page.url()).origin;
  // 飞书附件直接下载端点
  const downloadUrl = `${origin}/space/api/box/stream/download/all/${token}`;

  log(`[attachments] 正在下载: ${name || token}`);

  try {
    // 在 page context 里执行 fetch，自动携带飞书 Cookie
    const result = await page.evaluate(async (url: string) => {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) return { ok: false, status: resp.status, contentDisposition: '', contentType: '' };

      const contentDisposition = resp.headers.get('content-disposition') ?? '';
      const contentType = resp.headers.get('content-type') ?? '';
      const buffer = await resp.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 分块转 base64（避免大文件栈溢出）
      const chunkSize = 8192;
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }

      return {
        ok: true,
        status: resp.status,
        contentDisposition,
        contentType,
        base64: btoa(binary),
        size: bytes.byteLength,
      };
    }, downloadUrl) as {
      ok: boolean;
      status: number;
      contentDisposition: string;
      contentType: string;
      base64?: string;
      size?: number;
    };

    if (!result.ok || !result.base64) {
      log(`[attachments] 下载失败 HTTP ${result.status}: ${token}`);
      return { token, originalName: name, localPath: null, relativePath: null };
    }

    // 确定文件名
    const cdName = extractFilenameFromContentDisposition(result.contentDisposition);
    const finalName = makeLocalFilename(cdName ?? name, token, inferExtFromUrl(downloadUrl));
    const localPath = path.join(destDir, finalName);
    const relativePath = path.relative(path.dirname(destDir), localPath).replace(/\\/g, '/');

    const buffer = Buffer.from(result.base64, 'base64');
    await fs.writeFile(localPath, buffer);

    log(`[attachments] 已保存 (${Math.round((result.size ?? buffer.length) / 1024)} KB): ${finalName}`);
    return { token, originalName: name, localPath, relativePath };
  } catch (err) {
    log(`[attachments] 下载异常: ${(err as Error).message} — ${token}`);
    return { token, originalName: name, localPath: null, relativePath: null };
  }
}

/**
 * 批量下载附件列表。
 *
 * @param page      已认证的 Playwright page
 * @param files     附件列表 [{token, name}]
 * @param destDir   目标目录
 */
export async function downloadAttachments(
  page: Page,
  files: Array<{ token: string; name: string }>,
  destDir: string,
): Promise<AttachmentDownloadResult[]> {
  if (files.length === 0) return [];

  log(`[attachments] 开始下载 ${files.length} 个附件到: ${destDir}`);
  const results: AttachmentDownloadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const { token, name } = files[i];
    log(`[attachments] [${i + 1}/${files.length}]`);
    const result = await downloadAttachment(page, token, name, destDir);
    results.push(result);
  }

  const succeeded = results.filter((r) => r.localPath !== null).length;
  log(`[attachments] 完成: ${succeeded}/${files.length} 个成功`);
  return results;
}
