当前项目的 `node_modules` 目录固定外置到项目外，采用与 `../UniCalendar` 相同的 PowerShell Profile 环境命令 `setenv` 设置环境变量。所有 Node.js 编译、测试、运行、安装依赖命令都需要先在项目根目录执行 `setenv`；如果当前机器没有全局 `setenv` 函数，才使用 fallback：`. ./setenv.ps1`。

当前目录不要产生 `node_modules` 目录。安装依赖使用 `npm run deps:install`，它会同步 npm manifest 并把依赖安装到 `C:/local_data/<project-name>`。

不要依赖 `NODE_PATH` 解决 ESM/TypeScript 运行时依赖解析；Node ESM 和 `tsx` 不会可靠使用它解析 `playwright`、`exceljs` 这类裸包导入。需要执行 `.ts` 入口时必须通过项目 wrapper（例如 `npm run grab*`、`npm run test:*`，内部使用 `scripts/run-with-external-modules.mjs`）显式注册外置依赖 loader；需要构建时使用 `npm run build`，内部通过 `scripts/run-tool.mjs` 显式解析外置 TypeScript 和类型入口。
