# Phase 06 Context

## Goal

通过 `--wiki <url> --export-all` 按知识库层级批量导出所有文档和附件。

## Locked Scope

- 输出目录结构保留知识库层级。
- 每篇文档生成独立 Markdown，附件保存在对应 `assets/`。
- `--url`、`--file`、`--interactive` 与现有文件夹模式必须通过回归验证。

## Dependencies

Depends on Phase 4 and Phase 5.

## Migration Note

Migrated from gsd-pi M002/S03: 批量 Wiki 导出集成.
