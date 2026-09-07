当前项目以 WSL2 作为主要开发和运行环境。所有 Node.js 安装、编译、测试和运行命令都必须在 WSL2 shell 中、从项目根目录执行；不要使用 Windows 的 `node.exe`、`npm.cmd` 或 PowerShell 执行项目命令。

Node.js 依赖安装在项目根目录的 `node_modules` 中。首次安装使用 `npm install`；需要严格按 lockfile 重建依赖，或曾经使用 Windows npm 安装过依赖时，使用 WSL2 中的 `npm ci`，避免混用 Windows 和 Linux 平台的原生包及启动脚本。

使用 `npm run build`、`npm run grab*` 和 `npm run test:*` 等项目脚本，让 npm 从本地 `node_modules/.bin` 解析 TypeScript、`tsx` 以及其他依赖。新增 npm script 时使用 WSL2/Linux 可执行的命令和 `/` 路径分隔符，不要引入 `.cmd`、PowerShell 语法或 Windows 绝对路径。

本项目不需要 `setenv`，也不需要设置 `EXTERNAL_NODE_MODULES` 或 `NODE_PATH`。

项目规划统一使用当前 `gsd-core`，规范文件位于 `.planning/` 并纳入 Git 管理。修改项目范围、需求、路线图、阶段状态或关键技术决策时，应同步更新 `.planning/PROJECT.md`、`.planning/REQUIREMENTS.md`、`.planning/ROADMAP.md`、`.planning/STATE.md` 及对应阶段文件。

`.gsd/` 和 `.gsd.migrating/` 是旧 `gsd-pi` 的本地运行时/迁移备份，继续保持忽略，不得作为当前规划来源或提交到仓库。不要在本项目中运行 `gsd-pi` 写入项目状态。
