# Node.js 依赖外置方案说明

目标：**源码在项目目录内，`node_modules`、构建产物、运行缓存放到项目目录外**。适合项目位于 OneDrive / Dropbox / iCloud Drive 等同步盘，避免同步海量依赖文件。

## 原则

- 项目目录内不要保留 `node_modules`。
- 不用 symlink / junction / mklink。
- 优先使用 PowerShell Profile 函数 `setenv` 激活外置依赖环境，仓库内 `setenv.ps1` 只作为 fallback。
- 不依赖 `NODE_PATH` 来解析 ESM 依赖：现代 ESM、`type: module`、tsx、ts-node、打包器通常不会可靠使用它。
- 需要直接执行 TypeScript 入口的脚本必须通过项目 wrapper 显式定位外置 `tsx`，并注册外置依赖 loader 解析裸包导入。
- 输出目录、缓存目录、浏览器 profile 也尽量外置。

## 推荐目录

```text
项目：C:\OneDrive\src\my-project
外置：C:\local_data\my-project
依赖：C:\local_data\my-project\node_modules
输出：C:\local_data\my-project\output
缓存：C:\local_data\my-project\.cache
```

## 环境初始化命令

本项目与 `../UniCalendar` 一样，优先使用 PowerShell Profile 里的 `setenv` 函数。在新的 PowerShell 会话里，先在项目根目录执行：

```powershell
setenv
```

如果当前机器还没有配置全局 `setenv` 函数，可以临时使用仓库内 fallback 脚本：

```powershell
. ./setenv.ps1
```

脚本会：

- 按当前项目目录名推导外置根目录，例如 `C:/local_data/my-project`
- 创建外置根目录
- 同步 `package.json`、`package-lock.json`、`.npmrc` 到外置根目录
- 设置 `EXTERNAL_NODE_MODULES` 和 `NODE_PATH`
- 把外置 `node_modules/.bin` 放到当前会话的 `PATH` 最前面

> `NODE_PATH` 只用于兼容少量 CommonJS 工具；本项目的 ESM/TypeScript 运行入口不依赖它。

## TypeScript 和 ESM 运行规则

本项目和普通 CommonJS 项目不同，源码直接通过 `tsx` 运行 `.ts` 入口，并且源码里有 `import ... from 'playwright'`、`import ... from 'exceljs'` 这类裸包导入。Node ESM/`tsx` 不会可靠使用 `NODE_PATH`，所以仅把外置 `.bin` 放到 `PATH` 还不够。

必须遵守：

- 运行 CLI 或测试时使用 `npm run grab*`、`npm run test:*`，不要直接执行 `tsx src/cli.ts` 或 `node src/cli.ts`。
- 运行 wrapper 使用 `scripts/run-with-external-modules.mjs`，它会注册外置 `tsx` loader 和 `scripts/external-modules-loader.mjs`，把裸包导入解析到 `EXTERNAL_NODE_MODULES`。
- 构建使用 `npm run build`，它通过 `scripts/run-tool.mjs` 显式解析外置 TypeScript，并生成临时 `.tsconfig.external-node-modules.json` 注入外置类型入口。
- 如果新增新的运行时依赖裸包导入，需要确认 `scripts/external-modules-loader.mjs` 能从外置包的 `exports` / `main` / `index.js` 解析它；如果新增新的构建期类型依赖，需要同步检查 `scripts/run-tool.mjs` 的类型入口映射。

## 如果需要编写新的 `setenv` 命令

把下面函数放到 PowerShell Profile（查看路径：`$PROFILE`）中，重开 PowerShell 后即可在任意项目根目录执行 `setenv`：

```powershell
function setenv {
  $ProjectRoot = Get-Location
  $ProjectName = Split-Path -Leaf $ProjectRoot
  $ExternalRoot = "C:/local_data/$ProjectName"
  $ExternalNodeModules = "$ExternalRoot/node_modules"
  $ExternalNodeBin = "$ExternalNodeModules/.bin"

  New-Item -ItemType Directory -Force -Path $ExternalRoot | Out-Null

  $ManifestFiles = @('package.json', 'package-lock.json', '.npmrc')
  foreach ($FileName in $ManifestFiles) {
    $Source = Join-Path $ProjectRoot $FileName
    if (Test-Path $Source) {
      Copy-Item -Path $Source -Destination (Join-Path $ExternalRoot $FileName) -Force
    }
  }

  $env:EXTERNAL_NODE_MODULES = $ExternalNodeModules
  $env:NODE_PATH = $ExternalNodeModules

  $ExistingPathEntries = $env:PATH -split ';' | Where-Object {
    $_ -and ($_.TrimEnd('\/') -ine $ExternalNodeBin.TrimEnd('\/'))
  }
  $env:PATH = (@($ExternalNodeBin) + $ExistingPathEntries) -join ';'

  Write-Host "Project root: $ProjectRoot"
  Write-Host "External root: $ExternalRoot"
  Write-Host "External node_modules: $ExternalNodeModules"
}
```

## 安装依赖

首次安装或同步依赖：

```powershell
setenv
npm run deps:install
```

Playwright 浏览器二进制仍安装到外置 npm prefix：

```powershell
npx --prefix C:\local_data\feishu-export playwright install chromium
```

如果项目目录改名，`setenv` 会自动按新目录名推导外置根目录。

## 常用命令

每次新终端先运行：

```powershell
setenv
```

然后使用普通 npm scripts：

```powershell
npm run build
npm run grab -- -- --profile-dir="C:\tmp\feishu-profile" --url="https://xxx.feishu.cn/docx/AAA" --out="C:\local_data\feishu-export\output"
npm run test:all
```

## 与 UniCalendar 的差异

- `build` 已改成和 UniCalendar 一样依赖 `setenv` 注入的 `PATH`，直接执行 `tsc`。
- `deps:install` 已改成同款 `external-npm.mjs` 流程，会把依赖安装到外置根目录。
- 本项目的 CLI 和回归测试直接运行 `.ts` 文件，Node ESM 不会自动从外置目录解析 `tsx`，因此仍保留 `scripts/run-with-external-modules.mjs` wrapper 来显式启动外置 `tsx`。
- 这不是新的环境命令需求；继续使用与 UniCalendar 相同的 `setenv` 即可。
