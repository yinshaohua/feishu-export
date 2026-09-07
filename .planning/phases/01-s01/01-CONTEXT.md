# Phase 01 Context

## Goal

拦截 `/clientvars` API，解压 `table` 数据，并将 `fieldMap`、`recordMap` 与 `viewMap` 转换为 `BitableTable`。

## Decisions

- 不从 canvas DOM 提取数据；完整行数据来自 `/clientvars` 响应。
- 字段顺序优先使用 `viewMap`，与用户界面保持一致。
- 单元格值覆盖文本、数字、选项、URL、checkbox 等主要类型。

## Verification

- `test/bitable-regression.ts` 通过 15 项断言。
- fixture 包含 23 条记录。

## Migration Note

Migrated from gsd-pi M001/S01: Bitable 数据提取核心.
