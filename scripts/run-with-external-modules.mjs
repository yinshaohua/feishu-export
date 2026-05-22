import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function fail(message) {
  console.error(`[external-modules] ${message}`);
  process.exit(1);
}

function readExternalNodeModulesDir() {
  const value = process.env.FEISHU_EXPORT_NODE_MODULES?.trim();
  if (!value) {
    fail('缺少 FEISHU_EXPORT_NODE_MODULES。请把它设置为外部 node_modules 目录，例如 C:\\local_data\\feishu-export\\node_modules');
  }
  return path.resolve(value);
}

const externalNodeModulesDir = readExternalNodeModulesDir();
const target = process.argv[2];
const passthroughArgs = process.argv.slice(3);

if (!target) {
  fail('缺少目标入口。用法：node scripts/run-with-external-modules.mjs <entry.ts> [...args]');
}

const tsxCliPath = path.join(externalNodeModulesDir, 'tsx', 'dist', 'cli.mjs');
const loaderPath = path.join(process.cwd(), 'scripts', 'external-modules-loader.mjs');

if (!fs.existsSync(tsxCliPath)) {
  fail(`未找到 tsx CLI: ${tsxCliPath}`);
}

process.env.NODE_OPTIONS = [
  process.env.NODE_OPTIONS,
  `--loader=${pathToFileURL(loaderPath).href}`,
].filter(Boolean).join(' ');
process.env.FEISHU_EXPORT_EXTERNAL_NODE_MODULES = externalNodeModulesDir;
process.argv = [
  process.execPath,
  tsxCliPath,
  target,
  ...passthroughArgs,
];

await import(pathToFileURL(tsxCliPath).href);
