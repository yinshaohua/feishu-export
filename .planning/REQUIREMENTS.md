# Requirements: feishu-export

**Defined:** 2026-07-12
**Core Value:** 使用现有飞书登录态，一条命令生成结构完整、可离线使用的本地副本。

## Validated Requirements

### 多维表格导出

- [x] **BIT-01**: 用户可从飞书多维表格提取字段、视图顺序和记录数据，无需 API token。
- [x] **BIT-02**: 用户可将多维表格保存为 Markdown 表格和可在 Excel/WPS 打开的 `.xlsx` 文件。
- [x] **BIT-03**: 用户可通过 `--url`、`--file` 和 `--interactive` 模式导出多维表格，且文档导出不回归。

## Active Requirements

### 知识库目录与附件

- [ ] **WIKI-01**: 用户可从真实飞书知识库生成保留层级、标题和 URL 的 `wiki-toc.md` 与 `wiki-toc.json`。
- [ ] **ATT-01**: 用户导出文档时，内嵌附件会下载到 `assets/`，Markdown 中生成本地链接。
- [ ] **WIKI-02**: 用户可通过 `--wiki <url> --export-all` 按知识库层级批量导出文档和各自附件。
- [ ] **REG-01**: 现有 `--url`、`--file`、`--interactive` 与文件夹导出流程继续通过回归验证。

## Deferred

- **BIT-04**: 超过 200 条记录的多维表格支持分页导出。
- **DOC-01**: 对 `iframe`、`embed` 和 todo list 进行专项提取。

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BIT-01 | Phase 1 | Complete |
| BIT-02 | Phase 2 | Complete |
| BIT-03 | Phase 3 | Complete |
| WIKI-01 | Phase 4 | Pending |
| ATT-01 | Phase 5 | Pending |
| WIKI-02 | Phase 6 | Pending |
| REG-01 | Phase 6 | Pending |

**Coverage:**
- Tracked requirements: 7
- Mapped to phases: 7
- Unmapped: 0

---
*Last updated: 2026-07-12 after migration from gsd-pi to gsd-core*
