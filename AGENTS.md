本项目的依赖统一安装在项目根目录的 `node_modules`，不需要额外的环境初始化命令。

安装依赖使用 `npm run deps:install`。所有 Node.js 编译、测试和运行命令都在项目根目录执行，构建使用 `npm run build`，运行和测试使用项目现有的 `npm run grab*`、`npm run test:*` 脚本。

不要依赖 `NODE_PATH` 解决 ESM/TypeScript 运行时依赖解析；npm scripts 会从项目内 `node_modules` 解析依赖。
