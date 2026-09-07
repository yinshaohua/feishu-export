# Phase 03 Context

## Goal

在 CLI 中识别 `/base/` URL，并在 `--url`、`--file` 和 `--interactive` 模式中调用多维表格导出流程。

## Decisions

- 文档与多维表格使用显式 URL 分支，避免 Bitable 进入文档抓取流程。
- `--file` 模式允许混合文档与多维表格 URL。
- README 记录输出格式与 200 条记录限制。

## Verification

- `npm run test:all` 通过。
- README 与 CLI 分发均已更新。

## Migration Note

Migrated from gsd-pi M001/S03: CLI 集成和端到端验证.
