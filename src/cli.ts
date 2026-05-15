import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs/promises';
import type { Page } from 'playwright';
import {
  autoScrollDocument,
  ensureOnFeishuDoc,
  gotoIfNeeded,
  launchPersistentBrowser,
  waitForDocumentReady,
  waitForRuntimeReady,
} from './browser.js';
import { collectDebugSnapshot } from './debug.js';
import { extractDocument, startSheetPayloadCapture } from './extract.js';
import { toMarkdown } from './markdown.js';
import type { CliOptions } from './types.js';
import { createStableFilePath, ensureDir, log, prompt, readUrlList } from './utils.js';

const verboseDebug = process.env.FEISHU_EXPORT_DEBUG === '1';

function parseArgs(argv: string[]): CliOptions {
  const baseDir = process.cwd();
  const options: CliOptions = {
    interactive: false,
    outDir: path.resolve(baseDir, 'output'),
    profileDir: path.resolve(baseDir, '.playwright-profile'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--interactive') {
      options.interactive = true;
    } else if (arg === '--url') {
      options.url = argv[++i];
    } else if (arg.startsWith('--url=')) {
      options.url = arg.slice('--url='.length);
    } else if (arg === '--file') {
      options.file = argv[++i];
    } else if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
    } else if (arg === '--out') {
      options.outDir = path.resolve(argv[++i]);
    } else if (arg.startsWith('--out=')) {
      options.outDir = path.resolve(arg.slice('--out='.length));
    } else if (arg === '--profile-dir') {
      options.profileDir = path.resolve(argv[++i]);
    } else if (arg.startsWith('--profile-dir=')) {
      options.profileDir = path.resolve(arg.slice('--profile-dir='.length));
    }
  }

  return options;
}

function validateOptions(options: CliOptions): void {
  const enabledModes = [options.interactive, Boolean(options.url), Boolean(options.file)].filter(Boolean).length;
  if (enabledModes !== 1) {
    throw new Error('必须且只能选择一种模式：--interactive / --url / --file');
  }
}

async function saveMarkdown(outDir: string, title: string, markdown: string): Promise<string> {
  await ensureDir(outDir);
  const filePath = createStableFilePath(outDir, title);
  await fs.writeFile(filePath, markdown, 'utf8');
  return filePath;
}

async function stabilizeDocumentIfNeeded(page: Page): Promise<boolean> {
  const initial = await collectDebugSnapshot(page);
  if (initial.mainTextLength >= 3000) return false;

  log(`[retry:short-content] 检测到正文长度偏短(${initial.mainTextLength})，追加等待并重试加载...`);
  await page.waitForTimeout(1200);
  await waitForRuntimeReady(page);
  await autoScrollDocument(page);
  return true;
}

async function preparePageForCapture(page: Page): Promise<{ debug: Awaited<ReturnType<typeof collectDebugSnapshot>>; shortContentRetried: boolean }> {
  await ensureOnFeishuDoc(page);
  log('正在等待文档内容稳定...');
  await waitForDocumentReady(page);
  await waitForRuntimeReady(page);
  await autoScrollDocument(page);
  const shortContentRetried = await stabilizeDocumentIfNeeded(page);
  return {
    debug: await collectDebugSnapshot(page),
    shortContentRetried,
  };
}

async function captureCurrentPage(page: Page, outDir: string): Promise<string> {
  const retryNotes: string[] = [];
  const sheetCapture = startSheetPayloadCapture(page);
  let prep = await preparePageForCapture(page);
  let debug = prep.debug;
  if (prep.shortContentRetried) {
    retryNotes.push(`retry:short-content(mainTextLength=${debug.mainTextLength})`);
  }

  if (debug.mainTextLength < 3000) {
    retryNotes.push(`retry:reload(mainTextLength=${debug.mainTextLength})`);
    log(`[retry:reload] 正文仍偏短(${debug.mainTextLength})，执行一次页面重载后重试...`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    prep = await preparePageForCapture(page);
    debug = prep.debug;
    if (prep.shortContentRetried) {
      retryNotes.push(`retry:short-content(after-reload,mainTextLength=${debug.mainTextLength})`);
    }
  }

  if (debug.mainTextLength < 3000) {
    retryNotes.push(`retry:second-reload(mainTextLength=${debug.mainTextLength})`);
    log(`[retry:second-reload] 正文仍偏短(${debug.mainTextLength})，执行第二次页面重载...`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    prep = await preparePageForCapture(page);
    debug = prep.debug;
    if (prep.shortContentRetried) {
      retryNotes.push(`retry:short-content(after-second-reload,mainTextLength=${debug.mainTextLength})`);
    }
  }
  log(
    `调试摘要: bodyTextLength=${debug.bodyTextLength}, mainTextLength=${debug.mainTextLength}, iframe=${debug.iframeCount}, contentEditable=${debug.contentEditableCount}, canvas=${debug.selectors.canvas}`,
  );
  if (verboseDebug && debug.visibleTextSample.length > 0) {
    log(`可见文本样本: ${debug.visibleTextSample.slice(0, 3).join(' | ')}`);
  }
  if (verboseDebug && debug.selectionTextarea.exists) {
    log(
      `textarea: valueLength=${debug.selectionTextarea.valueLength}, textLength=${debug.selectionTextarea.textLength}, selection=${debug.selectionTextarea.selectionStart}-${debug.selectionTextarea.selectionEnd}, ariaHidden=${debug.selectionTextarea.ariaHidden || '-'}, class=${debug.selectionTextarea.className || '-'}`,
    );
    if (debug.selectionTextarea.sampleStart) {
      log(`textarea起始样本: ${debug.selectionTextarea.sampleStart}`);
    }
    if (debug.selectionTextarea.sampleEnd && debug.selectionTextarea.sampleEnd !== debug.selectionTextarea.sampleStart) {
      log(`textarea末尾样本: ${debug.selectionTextarea.sampleEnd}`);
    }
  }
  if (verboseDebug && debug.activeElement.tag) {
    log(
      `activeElement: tag=${debug.activeElement.tag}, role=${debug.activeElement.role || '-'}, contenteditable=${debug.activeElement.contenteditable || '-'}, class=${debug.activeElement.className || '-'}, sample=${debug.activeElement.sample || '-'}`,
    );
  }
  if (verboseDebug && debug.editableAncestors.length > 0) {
    for (const item of debug.editableAncestors.slice(0, 8)) {
      log(
        `editable祖先[${item.depth}]: tag=${item.tag}, role=${item.role || '-'}, contenteditable=${item.contenteditable || '-'}, textLength=${item.textLength}, childCount=${item.childCount}, class=${item.className || '-'}, sample=${item.sample}`,
      );
    }
  }
  if (verboseDebug && debug.bodySubtrees.length > 0) {
    for (const item of debug.bodySubtrees.slice(0, 12)) {
      log(
        `body子树[path=${item.path}]: level=${item.level}, tag=${item.tag}, role=${item.role || '-'}, textLength=${item.textLength}, childCount=${item.childCount}, top=${item.rectTop}, height=${item.rectHeight}, class=${item.className || '-'}, sample=${item.sample}`,
      );
    }
  }

  log('正在提取文档结构...');
  const capturedSheets = sheetCapture.stop();
  const doc = await extractDocument(page, capturedSheets);
  if (retryNotes.length > 0) {
    doc.debugNotes = [...(doc.debugNotes ?? []), ...retryNotes];
  }
  const markdown = toMarkdown(doc);
  return await saveMarkdown(outDir, doc.title, markdown);
}

async function runInteractive(options: CliOptions): Promise<void> {
  const { context, page } = await launchPersistentBrowser(options.profileDir);

  try {
    log('已打开浏览器，请登录飞书并打开目标文档。');
    while (true) {
      const answer = await prompt('准备好后按 Enter 开始抓取当前文档；输入 q 退出: ');
      if (answer.toLowerCase() === 'q') break;

      try {
        const savedPath = await captureCurrentPage(page, options.outDir);
        log(`已保存: ${savedPath}`);
      } catch (error) {
        log(`抓取失败: ${(error as Error).message}`);
      }
    }
  } finally {
    await context.close();
  }
}

async function runSingleUrl(options: CliOptions): Promise<void> {
  const { context, page } = await launchPersistentBrowser(options.profileDir);

  try {
    await gotoIfNeeded(page, options.url);
    log('如果页面要求登录，请先在打开的浏览器中完成登录。');
    const answer = await prompt('确认已打开目标文档后按 Enter 继续: ');
    if (answer.toLowerCase() === 'q') return;

    const savedPath = await captureCurrentPage(page, options.outDir);
    log(`已保存: ${savedPath}`);
  } finally {
    await context.close();
  }
}

async function ensureLoggedInForBatch(page: Page, firstUrl: string): Promise<void> {
  log('检查是否已有可复用的飞书登录态...');
  await gotoIfNeeded(page, firstUrl);

  if (page.url() === firstUrl || page.url().includes('/docx/')) {
    log('检测到已有登录态，直接开始批量抓取。');
    return;
  }

  log('未检测到可用登录态，请先在打开的浏览器中完成登录。');
  await prompt('登录完成后按 Enter 开始批量抓取: ');
}

async function runFileMode(options: CliOptions): Promise<void> {
  const urls = await readUrlList(options.file!);
  if (urls.length === 0) {
    throw new Error('URL 列表为空。');
  }

  const { context, page } = await launchPersistentBrowser(options.profileDir);

  try {
    log(`共 ${urls.length} 篇文档。首次运行若需要，会自动检查并提示登录。`);
    await ensureLoggedInForBatch(page, urls[0]);

    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i];
      log(`[${i + 1}/${urls.length}] 打开: ${url}`);

      try {
        await gotoIfNeeded(page, url);
        const savedPath = await captureCurrentPage(page, options.outDir);
        log(`[${i + 1}/${urls.length}] 已保存: ${savedPath}`);
      } catch (error) {
        log(`[${i + 1}/${urls.length}] 失败: ${(error as Error).message}`);
      }
    }
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  validateOptions(options);

  await ensureDir(options.outDir);
  await ensureDir(options.profileDir);

  if (options.interactive) {
    await runInteractive(options);
    return;
  }

  if (options.url) {
    await runSingleUrl(options);
    return;
  }

  await runFileMode(options);
}

main().catch((error) => {
  log(`执行失败: ${(error as Error).message}`);
  process.exitCode = 1;
});
