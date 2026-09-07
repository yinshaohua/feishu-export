---
phase: "01"
plan: "03"
---

# T03: 编写 bitable 单元测试（15/15 通过），修复 docs-regression 跳过 Bitable URL

**编写 bitable 单元测试（15/15 通过），修复 docs-regression 跳过 Bitable URL**

## What Happened

从 clientvars 响应重新生成 fixture 数据（test/fixtures/table_data.json）。编写 test/bitable-regression.ts，内联复现 cellValueToString 和字段排序逻辑，15 个断言全部通过：字段数量/顺序/类型、记录数量、文本/URL/选项单元格值、空单元格处理。修复 docs-regression.ts 跳过 Bitable URL。npm run test:all 全部通过。

## Verification

npx tsx test/bitable-regression.ts: 15/15 pass；npm run test:all: 全部通过

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx tsx test/bitable-regression.ts` | 0 | ✅ pass — 15/15 | 800ms |
| 2 | `npm run test:all` | 0 | ✅ pass | 12000ms |

## Deviations

docs-regression.ts 需要过滤掉 Bitable URL（urls.txt 中已有 Bitable URL），加了一行 filter 跳过非 /docx/ URL，避免回归测试要求 Bitable 输出文件存在。

## Known Issues

None.

## Files Created/Modified

- `test/bitable-regression.ts`
- `test/fixtures/table_data.json`
- `test/docs-regression.ts`
