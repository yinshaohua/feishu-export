import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    // 去除飞书注入的零宽/不可见 Unicode 字符（用于水印追踪）
    // 覆盖范围：零宽空格、零宽非连接符、零宽连接符、变体选择符、
    // 软连字符、左右标记、Mongolian 分隔符、Hangul 填充等
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF\u00AD\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180D\u180E\u3164\uFFA0]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');

  return cleaned || 'untitled-feishu-doc';
}

export function createStableFilePath(dir: string, title: string): string {
  const safe = sanitizeFileName(title);
  return path.join(dir, `${safe}.md`);
}

export async function readUrlList(filePath: string): Promise<string[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

export async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}
