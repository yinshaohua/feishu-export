import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

export const EXTERNAL_NODE_MODULES_ENV = 'EXTERNAL_NODE_MODULES';
export const EXTERNAL_NODE_MODULES = process.env[EXTERNAL_NODE_MODULES_ENV]?.trim() || '';
export const EXTERNAL_MODE = EXTERNAL_NODE_MODULES.length > 0;
export const EXTERNAL_ROOT = EXTERNAL_MODE ? dirname(EXTERNAL_NODE_MODULES) : process.cwd();
export const EXTERNAL_BIN = EXTERNAL_MODE ? join(EXTERNAL_NODE_MODULES, '.bin') : join(process.cwd(), 'node_modules/.bin');

const localRequire = createRequire(import.meta.url);
const externalRequire = EXTERNAL_MODE ? createRequire(join(EXTERNAL_ROOT, 'package.json')) : localRequire;

export function requireFromDependencies(specifier) {
  return externalRequire(specifier);
}

export function resolveFromDependencies(specifier) {
  try {
    return externalRequire.resolve(specifier);
  } catch (error) {
    const mode = EXTERNAL_MODE ? `external node_modules at ${EXTERNAL_NODE_MODULES}` : 'local node_modules';
    throw new Error(`Cannot resolve ${specifier} from ${mode}. Run setenv and npm run deps:install first.`, { cause: error });
  }
}

export function resolveTool(relativePath) {
  const externalPath = join(EXTERNAL_NODE_MODULES, relativePath);
  if (EXTERNAL_MODE && existsSync(externalPath)) {
    return externalPath;
  }

  return localRequire.resolve(relativePath);
}

export function resolvePackageFile(packageName, relativePath) {
  const baseDir = EXTERNAL_MODE
    ? join(EXTERNAL_NODE_MODULES, packageName)
    : dirname(localRequire.resolve(`${packageName}/package.json`));
  const targetPath = join(baseDir, relativePath);

  if (!existsSync(targetPath)) {
    throw new Error(`Cannot resolve ${packageName}/${relativePath} from ${baseDir}`);
  }

  return targetPath;
}

export function createToolEnv(extra = {}) {
  const pathEntries = [EXTERNAL_BIN, process.env.PATH || ''].filter(Boolean);

  return {
    ...process.env,
    ...extra,
    PATH: pathEntries.join(delimiter),
    NODE_PATH: EXTERNAL_MODE ? EXTERNAL_NODE_MODULES : process.env.NODE_PATH,
  };
}
