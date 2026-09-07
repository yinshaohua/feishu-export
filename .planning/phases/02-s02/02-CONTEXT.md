# Phase 02 Context

## Goal

将 `BitableTable` 序列化为 Markdown 表格和 Excel 工作簿。

## Decisions

- 使用 `exceljs` 生成 `.xlsx`，支持格式、冻结首行和超链接。
- 输出文件名沿用 `sanitizeFileName(baseToken)` 加日期后缀的规则。
- Markdown 与 Excel 输出使用相同字段顺序和记录集。

## Verification

- `test/bitable-output-test.ts` 通过 10 项断言。
- 全量回归测试通过。

## Migration Note

Migrated from gsd-pi M001/S02: Markdown 和 Excel 输出.
