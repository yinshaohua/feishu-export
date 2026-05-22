# Node.js 依赖外置方案说明

目标：**源码在项目目录内，`node_modules`、构建产物、运行缓存放到项目目录外**。适合项目位于 OneDrive / Dropbox / iCloud Drive 等同步盘，避免同步海量依赖文件。

## 原则

- 项目目录内不要保留 `node_modules`。
- 不用 symlink / junction / mklink。
- 不依赖 `NODE_PATH`：现代 ESM、`type: module`、tsx、ts-node、打包器通常不会可靠使用它。
- 让 npm 脚本主动指定外置依赖位置。
- 输出目录、缓存目录、浏览器 profile 也尽量外置。

## 推荐目录

```text
项目：C:\OneDrive\src\my-project
外置：C:\local_data\my-project
依赖：C:\local_data\my-project\node_modules
输出：C:\local_data\my-project\output
缓存：C:\local_data\my-project\.cache
```

## 环境初始化脚本

本项目提供 `setenv.ps1` 和 `setenv.cmd`。在新的终端会话里，先在项目根目录执行初始化脚本。

PowerShell：

```powershell
. ./setenv.ps1
```

cmd：

```cmd
setenv.cmd
```

脚本会：

- 按当前项目目录名推导外置根目录，例如 `C:/local_data/my-project`
- 创建外置根目录
- 同步 `package.json`、`package-lock.json`、`.npmrc` 到外置根目录
- 设置 `EXTERNAL_NODE_MODULES` 和 `NODE_PATH`
- 把 `C:/local_data/my-project/node_modules/.bin` 放到当前会话的 `PATH` 最前面

脚本是幂等的：同一个会话里重复执行不会反复追加相同的 `.bin` 路径；如果项目依赖声明发生变化，重复执行会重新同步 manifest。

## package.json 要点

把 npm 的安装位置指向外部目录：

```json
{
  "scripts": {
    "deps:install": "npm install --prefix C:/local_data/my-project",
    "deps:clean": "rimraf C:/local_data/my-project/node_modules",
    "build": "node --import C:/local_data/my-project/node_modules/tsx/dist/loader.mjs src/cli.ts",
    "start": "node --import C:/local_data/my-project/node_modules/tsx/dist/loader.mjs src/cli.ts",
    "test": "node --import C:/local_data/my-project/node_modules/tsx/dist/loader.mjs --test test/*.ts"
  },
  "devDependencies": {
    "tsx": "..."
  }
}
```

关键点：

- `npm install --prefix <外置目录>` 会把依赖装到外置目录。
- 外置目录必须有 `package.json`；先执行本项目的 `setenv` 脚本会自动同步 npm manifest。
- 运行 TypeScript 时，不要写 `tsx src/cli.ts`，而是显式引用外置 `tsx` loader。
- 如果运行纯 JS，可以直接 `node src/index.js`；但它依赖的包仍需能从入口处被解析到，复杂项目建议用 wrapper。

## 更稳的 wrapper 方式

创建 `scripts/run.mjs`，从外置目录启动真实入口：

```js
import { spawnSync } from 'node:child_process';

const root = 'C:/local_data/my-project';
const loader = `${root}/node_modules/tsx/dist/loader.mjs`;

const result = spawnSync(process.execPath, ['--import', loader, 'src/cli.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    npm_config_prefix: root,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${loader}`.trim()
  }
});

process.exit(result.status ?? 1);
```

然后：

```json
{
  "scripts": {
    "start": "node scripts/run.mjs",
    "test": "node scripts/run.mjs --test"
  }
}
```

## TypeScript / 测试 / 工具

- `tsc`、`eslint`、`vitest`、`playwright` 等 CLI 不要假设本地 `./node_modules/.bin` 存在。
- 调用方式优先用：`node <外置node_modules中的工具入口>`。
- 如果工具必须通过 bin 启动，脚本中显式设置 `PATH=C:/local_data/my-project/node_modules/.bin;%PATH%`。
- `tsconfig.json` 通常不用改；模块解析问题主要发生在运行时和 CLI 启动时。

## 输出和缓存

所有会产生大量文件的路径都改成外置：

```text
outputDir: C:/local_data/my-project/output
cacheDir:  C:/local_data/my-project/.cache
profile:   C:/local_data/my-project/browser-profile
```

`.gitignore` 仍保留：

```gitignore
node_modules/
dist/
output/
.cache/
```

## 迁移步骤

1. 删除项目内 `node_modules`。
2. 在项目根目录执行 `setenv` 脚本，创建外置目录并同步 npm manifest。
3. 执行 `npm install --prefix <外置目录>`。
4. 修改 npm scripts，禁止依赖 `./node_modules/.bin`。
5. 把输出、缓存、profile 路径改到外置目录。
6. 运行 `npm run start`、`npm test`、`npm run build` 验证。
7. 在 README 写清外置目录约定。

## 验收标准

- 项目根目录没有 `node_modules`。
- `npm run start` 可运行。
- `npm test` 可运行。
- 构建或导出产物写入外置目录。
- 新 AI 只读 README/package.json 就能理解依赖位置。

## 常见坑

- `NODE_PATH` 对 ESM 不可靠，不作为主方案。
- symlink/junction 会重新触发同步盘扫描，不推荐。
- `npx xxx` 通常会找项目内依赖，不推荐。
- 直接写 `tsx`、`vitest`、`playwright` 这类命令，通常隐含依赖 `./node_modules/.bin`。
- 外置路径建议用正斜杠 `C:/...`，减少 Windows 转义问题。
