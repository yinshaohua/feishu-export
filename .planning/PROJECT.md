# feishu-export

## What This Is

一个在 WSL2 中运行的飞书内容导出工具，复用 Playwright 浏览器登录态，将可查看的飞书文档、云盘文件夹和多维表格保存为本地 Markdown、Excel 与附件文件。它面向需要离线归档飞书内容、又不希望配置开放平台 API token 的用户。

## Core Value

使用现有飞书登录态，一条命令生成结构完整、可离线使用的本地副本。

## Requirements

### Validated

- [x] 飞书文档可导出为带元数据的 Markdown。
- [x] 飞书多维表格可导出为 Markdown 和 Excel，并保留字段顺序与链接。
- [x] CLI 可在 `--url`、`--file`、`--interactive` 模式中区分文档和多维表格。

### Active

- [ ] 从真实飞书知识库提取完整目录树并输出 `wiki-toc.md` 与 `wiki-toc.json`。
- [ ] 下载文档内嵌附件到本地 `assets/`，并将 Markdown 链接改为本地路径。
- [ ] 使用 `--wiki <url> --export-all` 按知识库层级批量导出全部文档和附件。
- [ ] 保持现有 `--url`、`--file`、`--interactive` 与文件夹导出流程不回归。

### Out of Scope

- 超过 200 条记录的多维表格分页导出 - 当前飞书接口单次返回限制，留待后续里程碑。
- `iframe` / `embed` 专项提取 - 不是当前目录与附件里程碑的交付范围。
- `todo list` 专项提取 - 当前按普通文档内容处理。

## Context

- 项目为 TypeScript ESM CLI，使用 Playwright 复用浏览器登录态。
- M001 已完成多维表格导出：拦截 `/clientvars` 响应，解压 gzip+base64 的 `table` 数据，再序列化为 Markdown 与 Excel。
- 当前里程碑 M002 聚焦知识库目录树、文档附件和批量 Wiki 导出。
- 原 GSD-2 (`gsd-pi`) 的 M001/M002 规划已迁移到当前 `.planning/` 结构。

## Constraints

- **运行环境**: 所有 Node.js 安装、构建、测试和运行命令必须从项目根目录在 WSL2 shell 中执行。
- **依赖布局**: 依赖位于项目根目录 `node_modules/`；不得混用 Windows 与 Linux 原生包。
- **命令入口**: 使用 `npm run build`、`npm run grab*`、`npm run test:*`，由 npm 解析本地工具。
- **认证方式**: 复用 Playwright 浏览器配置目录中的飞书登录态，不依赖开放平台 API token。
- **兼容性**: 不使用 `setenv`、`EXTERNAL_NODE_MODULES` 或 `NODE_PATH`。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 拦截 `/clientvars` API 响应提取多维表格 | 表格通过 canvas 虚拟渲染，DOM 中没有完整行数据 | ✓ Good |
| 优先使用 `viewMap` 的列顺序 | 保持导出字段顺序与用户界面一致 | ✓ Good |
| 使用 `exceljs` 生成工作簿 | 满足格式与超链接需求，避免 SheetJS 社区版限制 | ✓ Good |
| 文件名使用 `sanitizeFileName(baseToken)` 加日期后缀 | 与现有文档导出保持一致 | ✓ Good |
| WSL2 + 项目内 `node_modules` 作为唯一 Node 环境 | 避免 Windows/Linux 原生包和启动脚本混用 | ✓ Good |

---
*Last updated: 2026-07-12 after migration from gsd-pi to gsd-core*
