当前项目的 Node.js 依赖安装在项目根目录的 `node_modules` 中。安装依赖时在项目根目录执行 `npm install`；需要严格按 lockfile 重建依赖时执行 `npm ci`。

所有 Node.js 编译、测试和运行命令都直接在项目根目录执行，不需要运行 PowerShell Profile 中的 `setenv`，也不需要设置 `EXTERNAL_NODE_MODULES` 或 `NODE_PATH`。

使用 `npm run build`、`npm run grab*` 和 `npm run test:*` 等项目脚本，让 npm 从本地 `node_modules/.bin` 解析 TypeScript、`tsx` 以及其他依赖。
