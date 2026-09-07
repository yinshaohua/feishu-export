# 依赖管理说明

本项目的源码、依赖和构建配置统一在当前目录管理，依赖目录为：

```text
C:\src\feishu-export\node_modules
```

首次准备环境时，在项目根目录执行：

```powershell
npm run deps:install
npx playwright install chromium
```

运行和构建命令：

```powershell
npm run build
npm run test:all
```

项目不需要额外的环境初始化命令。npm scripts 会自动使用项目内的 `node_modules/.bin`，不依赖 `NODE_PATH` 或外部依赖目录。
