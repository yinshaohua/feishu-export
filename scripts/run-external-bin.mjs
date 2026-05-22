import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function fail(message) {
  console.error(`[external-modules] ${message}`);
  process.exit(1);
}

const externalNodeModulesDir = process.env.FEISHU_EXPORT_NODE_MODULES?.trim();
if (!externalNodeModulesDir) {
  fail('缺少 FEISHU_EXPORT_NODE_MODULES。请把它设置为外部 node_modules 目录，例如 C:\\local_data\\feishu-export\\node_modules');
}

const relativeModulePath = process.argv[2];
const passthroughArgs = process.argv.slice(3);

if (!relativeModulePath) {
  fail('缺少模块相对路径。用法：node scripts/run-external-bin.mjs <relative-module-path> [...args]');
}

const modulePath = path.resolve(externalNodeModulesDir, relativeModulePath);
if (!fs.existsSync(modulePath)) {
  fail(`未找到外部模块入口: ${modulePath}`);
}

process.argv = [process.execPath, modulePath, ...passthroughArgs];
await import(pathToFileURL(modulePath).href);
