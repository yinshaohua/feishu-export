import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const externalNodeModulesDir = process.env.EXTERNAL_NODE_MODULES;

function isBareSpecifier(specifier) {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:') && !specifier.startsWith('file:');
}

function tryResolvePackageTarget(specifier) {
  if (!externalNodeModulesDir || !isBareSpecifier(specifier)) return null;

  const packageName = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
  const subpath = specifier.slice(packageName.length);
  const packageDir = path.join(externalNodeModulesDir, packageName);

  if (!fs.existsSync(packageDir)) return null;

  if (subpath) {
    const targetPath = path.join(packageDir, subpath);
    if (fs.existsSync(targetPath)) return pathToFileURL(targetPath).href;
    const withJs = `${targetPath}.js`;
    if (fs.existsSync(withJs)) return pathToFileURL(withJs).href;
    const indexJs = path.join(targetPath, 'index.js');
    if (fs.existsSync(indexJs)) return pathToFileURL(indexJs).href;
  }

  const packageJsonPath = path.join(packageDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const exportsField = pkg.exports;
      if (typeof exportsField === 'string') {
        return pathToFileURL(path.join(packageDir, exportsField)).href;
      }
      if (exportsField && typeof exportsField === 'object') {
        const rootExport = exportsField['.'];
        if (typeof rootExport === 'string') {
          return pathToFileURL(path.join(packageDir, rootExport)).href;
        }
        if (rootExport && typeof rootExport === 'object') {
          for (const key of ['import', 'default', 'node']) {
            if (typeof rootExport[key] === 'string') {
              return pathToFileURL(path.join(packageDir, rootExport[key])).href;
            }
          }
        }
      }
      if (typeof pkg.module === 'string') {
        return pathToFileURL(path.join(packageDir, pkg.module)).href;
      }
      if (typeof pkg.main === 'string') {
        return pathToFileURL(path.join(packageDir, pkg.main)).href;
      }
    } catch {
      // ignore and fall through
    }
  }

  const fallbackIndex = path.join(packageDir, 'index.js');
  if (fs.existsSync(fallbackIndex)) return pathToFileURL(fallbackIndex).href;
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const fallbackUrl = tryResolvePackageTarget(specifier);
    if (!fallbackUrl) throw error;
    return {
      shortCircuit: true,
      url: fallbackUrl,
    };
  }
}
