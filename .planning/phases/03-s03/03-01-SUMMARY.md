---
phase: "03"
plan: "01"
---

# T01: CLI 集成 Bitable 分支：isBitableUrl() 识别 + captureBitablePage() 分发

**CLI 集成 Bitable 分支：isBitableUrl() 识别 + captureBitablePage() 分发**

## What Happened

在 cli.ts 中添加了 isBitableUrl() 和 captureBitablePage() 函数，并在 runSingleUrl 和 runFileMode 的 URL 处理循环中加入 Bitable 分支。Bitable URL 直接调用 extractBitable + saveBitableMarkdown + saveBitableExcel，不走文档抓取流程。npm run build 无错误。

## Verification

npm run build 无错误

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run build 2>&1` | 0 | ✅ pass | 2700ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/cli.ts`
