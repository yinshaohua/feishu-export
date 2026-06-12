import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createToolEnv, resolvePackageFile } from './with-external-node-modules.mjs';

function fail(message) {
  console.error(`[external-modules] ${message}`);
  process.exit(1);
}

const target = process.argv[2];
const passthroughArgs = process.argv.slice(3);

if (!target) {
  fail('缺少目标入口。用法：node scripts/run-with-external-modules.mjs <entry.ts> [...args]');
}

let tsxPath;
try {
  tsxPath = resolvePackageFile('tsx', 'dist/loader.mjs');
} catch (error) {
  fail(error.message);
}

if (!fs.existsSync(tsxPath)) {
  fail(`未找到 tsx ESM loader：${tsxPath}`);
}

const targetPath = path.resolve(target);
if (!fs.existsSync(targetPath)) {
  fail(`未找到目标入口：${targetPath}`);
}

const externalLoaderUrl = pathToFileURL(path.resolve('scripts/external-modules-loader.mjs')).href;
const externalLoaderRegister = `data:text/javascript,${encodeURIComponent(`import { register } from 'node:module'; import { pathToFileURL } from 'node:url'; register(${JSON.stringify(externalLoaderUrl)}, pathToFileURL('./'));`)}`;
const result = spawnSync(process.execPath, [
  '--import', pathToFileURL(tsxPath).href,
  '--import', externalLoaderRegister,
  targetPath,
  ...passthroughArgs,
], {
  stdio: 'inherit',
  env: createToolEnv(),
});

if (result.error) {
  fail(result.error.message);
}

process.exit(result.status ?? 1);
