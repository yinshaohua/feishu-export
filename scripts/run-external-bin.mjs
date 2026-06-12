import fs from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolveTool } from './with-external-node-modules.mjs';

function fail(message) {
  console.error(`[external-modules] ${message}`);
  process.exit(1);
}

const relativeModulePath = process.argv[2];
const passthroughArgs = process.argv.slice(3);

if (!relativeModulePath) {
  fail('缺少模块相对路径。用法：node scripts/run-external-bin.mjs <relative-module-path> [...args]');
}

let modulePath;
try {
  modulePath = resolveTool(relativeModulePath);
} catch (error) {
  fail(error.message);
}

if (!fs.existsSync(modulePath)) {
  fail(`未找到依赖模块：${modulePath}`);
}

process.argv = [process.argv[0], modulePath, ...passthroughArgs];
await import(pathToFileURL(modulePath).href);
