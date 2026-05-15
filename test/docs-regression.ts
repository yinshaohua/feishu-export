import fs from 'node:fs/promises';
import path from 'node:path';

const outputDir = path.resolve(process.cwd(), 'output');
const urlsPath = path.resolve(process.cwd(), 'urls.txt');

const expectedChecks: Array<{ url: string; mustContain: string[]; mustNotContain?: string[] }> = [
  {
    url: 'https://ivtafhlzcve.feishu.cn/docx/CQPzduBDWobhLgxCbG2cDvsQnLb',
    mustContain: ['![', '查看图片', '### 2、网上找：'],
  },
  {
    url: 'https://ivtafhlzcve.feishu.cn/docx/ZFigduuO2oxwxPxPrRAcBSNgnJb',
    mustContain: ['查看内嵌表格（需在原文中展开）', '#### 1． 基础参数核查', '| 区间/分段 | 费用/规则 |', 'debug_notes: ['],
    mustNotContain: ['#### 1． 步骤一：确定专利类型：'],
  },
  {
    url: 'https://ivtafhlzcve.feishu.cn/docx/PcYGdOCiPoQpOUxJ8iWcBLGXnob',
    mustContain: ['![', '查看图片', '#### 1． 市场增长趋势：', '#### 4.1． 避免选择需要类目审核的产品；'],
    mustNotContain: ['#### 4．1. 避免选择需要类目审核的产品；'],
  },
];

function parseCapturedAt(markdown: string): number {
  const match = markdown.match(/^captured_at:\s*(.+)$/m);
  if (!match) return 0;
  const t = Date.parse(match[1].trim());
  return Number.isFinite(t) ? t : 0;
}

async function main(): Promise<void> {
  const urls = (await fs.readFile(urlsPath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const files = (await fs.readdir(outputDir))
    .filter((name) => name.endsWith('.md'));

  const docs = await Promise.all(files.map(async (name) => {
    const fullPath = path.join(outputDir, name);
    const markdown = await fs.readFile(fullPath, 'utf8');
    const sourceUrl = markdown.match(/^source_url:\s*(.+)$/m)?.[1]?.trim() || '';
    return {
      name,
      fullPath,
      markdown,
      sourceUrl,
      capturedAt: parseCapturedAt(markdown),
    };
  }));

  for (const url of urls) {
    const matches = docs
      .filter((doc) => doc.sourceUrl === url)
      .sort((a, b) => b.capturedAt - a.capturedAt);

    if (matches.length === 0) {
      throw new Error(`缺少导出文件: ${url}`);
    }

    const latest = matches[0];
    const expectation = expectedChecks.find((item) => item.url === url);
    if (expectation) {
      for (const needle of expectation.mustContain) {
        if (!latest.markdown.includes(needle)) {
          throw new Error(`回归检查失败: ${latest.name} 未包含 ${needle}`);
        }
      }
      for (const needle of expectation.mustNotContain ?? []) {
        if (latest.markdown.includes(needle)) {
          throw new Error(`回归检查失败: ${latest.name} 仍包含 ${needle}`);
        }
      }
    }

    console.log(`OK ${latest.name} <- ${url}`);
  }

  console.log('docs regression checks passed');
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
