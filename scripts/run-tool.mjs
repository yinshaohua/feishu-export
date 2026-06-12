import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  EXTERNAL_MODE,
  EXTERNAL_NODE_MODULES,
  EXTERNAL_ROOT,
  createToolEnv,
  resolveTool,
} from './with-external-node-modules.mjs';

const command = process.argv[2];
const rawArgs = process.argv.slice(3);

const tools = {
  tsc: () => resolveTool('typescript/bin/tsc'),
};

if (!command || !(command in tools)) {
  console.error(`Usage: node scripts/run-tool.mjs ${Object.keys(tools).join('|')} [args...]`);
  process.exit(1);
}

function syncManifestFiles() {
  mkdirSync(EXTERNAL_ROOT, { recursive: true });

  for (const manifestPath of ['package.json', 'package-lock.json', '.npmrc']) {
    if (existsSync(manifestPath)) {
      copyFileSync(manifestPath, join(EXTERNAL_ROOT, basename(manifestPath)));
    }
  }
}

function readPackageJson(packageName) {
  return JSON.parse(readFileSync(join(EXTERNAL_NODE_MODULES, packageName, 'package.json'), 'utf8'));
}

function resolveTypeEntry(packageName) {
  const packageJson = readPackageJson(packageName);
  const exportTypes = typeof packageJson.exports?.['.'] === 'object'
    ? packageJson.exports['.'].types
    : undefined;
  const typeEntry = packageJson.types ?? packageJson.typings ?? exportTypes;

  if (!typeEntry) {
    return join(EXTERNAL_NODE_MODULES, packageName).replaceAll('\\', '/');
  }

  return join(EXTERNAL_NODE_MODULES, packageName, typeEntry).replaceAll('\\', '/');
}

function createExternalTsConfig() {
  syncManifestFiles();

  const baseConfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  const compilerOptions = baseConfig.compilerOptions ?? {};
  const dependencyTypePaths = Object.fromEntries(
    ['exceljs', 'playwright'].map((packageName) => [packageName, [resolveTypeEntry(packageName)]]),
  );

  baseConfig.compilerOptions = {
    ...compilerOptions,
    baseUrl: compilerOptions.baseUrl ?? '.',
    paths: {
      ...(compilerOptions.paths ?? {}),
      ...dependencyTypePaths,
    },
    typeRoots: [
      'node_modules/@types',
      `${EXTERNAL_NODE_MODULES.replaceAll('\\', '/')}/@types`,
    ],
  };

  const externalTsConfigPath = '.tsconfig.external-node-modules.json';
  writeFileSync(externalTsConfigPath, `${JSON.stringify(baseConfig, null, 2)}\n`);
  return externalTsConfigPath;
}

function argsForCommand() {
  if (!EXTERNAL_MODE || command !== 'tsc') {
    return rawArgs;
  }

  const externalTsConfig = createExternalTsConfig();
  const projectFlagIndex = rawArgs.findIndex((arg) => arg === '--project' || arg === '-p');

  if (projectFlagIndex >= 0) {
    const nextArgs = [...rawArgs];
    nextArgs[projectFlagIndex + 1] = externalTsConfig;
    return nextArgs;
  }

  return ['--project', externalTsConfig, ...rawArgs];
}

let toolPath;
try {
  toolPath = tools[command]();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const result = spawnSync(process.execPath, [toolPath, ...argsForCommand()], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: createToolEnv(),
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
