import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function fail(message) {
  console.error(`[external-modules] ${message}`);
  process.exit(1);
}

function readExternalNodeModulesDir() {
  const value = process.env.EXTERNAL_NODE_MODULES?.trim();
  if (!value) {
    fail('缺少 EXTERNAL_NODE_MODULES。请把它设置为外部 node_modules 目录，例如 C:\\local_data\\<project-name>\\node_modules，或先运行 setenv 脚本');
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

const registerLoaderImport = `data:text/javascript,${encodeURIComponent(`
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register(${JSON.stringify(pathToFileURL(loaderPath).href)}, pathToFileURL('./'));
`)}`;

process.env.NODE_OPTIONS = [
  process.env.NODE_OPTIONS,
  `--import=${registerLoaderImport}`,
].filter(Boolean).join(' ');
process.env.EXTERNAL_NODE_MODULES = externalNodeModulesDir;
process.argv = [
  process.execPath,
  tsxCliPath,
  target,
  ...passthroughArgs,
];

await import(pathToFileURL(tsxCliPath).href);
