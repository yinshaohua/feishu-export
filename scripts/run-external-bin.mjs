import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function fail(message) {
  console.error(`[external-modules] ${message}`);
  process.exit(1);
}

const externalNodeModulesDir = process.env.EXTERNAL_NODE_MODULES?.trim();
if (!externalNodeModulesDir) {
  fail('缺少 EXTERNAL_NODE_MODULES。请把它设置为外部 node_modules 目录，例如 C:\\local_data\\<project-name>\\node_modules，或先运行 setenv 脚本');
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

function findArgValue(args, names) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    for (const name of names) {
      if (arg === name) return args[i + 1];
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    }
  }
  return undefined;
}

function withoutProjectArg(args) {
  const result = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-p' || arg === '--project') {
      i += 1;
      continue;
    }
    if (arg.startsWith('--project=')) continue;
    result.push(arg);
  }
  return result;
}

function resolvePackageTypeEntry(packageName) {
  const packageDir = path.join(externalNodeModulesDir, packageName);
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return null;

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const explicitTypes = pkg.types ?? pkg.typings;
    if (typeof explicitTypes === 'string') {
      return path.join(packageDir, explicitTypes);
    }

    const rootExport = pkg.exports?.['.'];
    if (rootExport && typeof rootExport === 'object' && typeof rootExport.types === 'string') {
      return path.join(packageDir, rootExport.types);
    }

    const indexTypes = path.join(packageDir, 'index.d.ts');
    if (fs.existsSync(indexTypes)) return indexTypes;
  } catch {
    return null;
  }

  return null;
}

function readProjectPackageNames() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) return [];

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return Object.keys({
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  });
}

function toTypeScriptPath(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll('\\', '/');
}

function withExternalTypeScriptResolution(args) {
  if (!relativeModulePath.replaceAll('\\', '/').endsWith('typescript/bin/tsc')) {
    return args;
  }

  const projectArg = findArgValue(args, ['-p', '--project', '--project']);
  if (!projectArg) return args;

  const projectPath = path.resolve(projectArg);
  const externalProjectRoot = path.dirname(externalNodeModulesDir);
  const cacheDir = path.join(externalProjectRoot, '.cache');
  const externalTsConfigPath = path.join(cacheDir, 'tsconfig.external.json');
  const externalTypesRoot = path.join(externalNodeModulesDir, '@types');
  const paths = Object.fromEntries(
    readProjectPackageNames()
      .map((packageName) => [packageName, resolvePackageTypeEntry(packageName)])
      .filter((entry) => entry[1])
      .map(([packageName, typeEntry]) => [packageName, [toTypeScriptPath(typeEntry)]])
  );

  const tempConfig = {
    extends: projectPath,
    compilerOptions: {
      typeRoots: [externalTypesRoot],
      baseUrl: process.cwd(),
      paths,
    },
  };

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(externalTsConfigPath, JSON.stringify(tempConfig, null, 2));
  return [...withoutProjectArg(args), '-p', externalTsConfigPath];
}

process.env.EXTERNAL_NODE_MODULES = path.resolve(externalNodeModulesDir);
process.env.NODE_PATH = [path.resolve(externalNodeModulesDir), process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);

process.argv = [
  process.execPath,
  modulePath,
  ...withExternalTypeScriptResolution(passthroughArgs),
];
await import(pathToFileURL(modulePath).href);
