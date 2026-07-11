# Roadmap: feishu-export

## Milestones

- ✅ **v0.1 M001: 飞书多维表格导出** - Phases 1-3 (shipped 2026-05-15)
- 🚧 **v0.2 M002: 目录结构导出与附件下载** - Phases 4-6 (in progress)

<details>
<summary>✅ v0.1 M001: 飞书多维表格导出 (Phases 1-3) - SHIPPED 2026-05-15</summary>

### Phase 1: Bitable 数据提取核心
**Goal**: 拦截 `/clientvars` API，解压表格数据并转换为 `BitableTable`。
**Depends on**: Nothing
**Requirements**: BIT-01
**Success Criteria**:
  1. 提取结果包含正确字段顺序和 23 条 fixture 记录。
  2. 文本、数字、选项、URL 和空单元格均转换为可读值。
  3. 构建与多维表格回归测试通过。
**Plans**: 3 plans

Plans:
- [x] 01-01: 添加 exceljs 依赖并扩展类型
- [x] 01-02: 实现 `src/bitable.ts` 核心提取逻辑
- [x] 01-03: 编写单元测试并验证

### Phase 2: Markdown 和 Excel 输出
**Goal**: 将 `BitableTable` 序列化为 Markdown 表格和 Excel 工作簿。
**Depends on**: Phase 1
**Requirements**: BIT-02
**Success Criteria**:
  1. Markdown 包含字段表头和完整记录。
  2. Excel 可正常打开，链接字段为超链接。
  3. 输出验证与全量回归通过。
**Plans**: 2 plans

Plans:
- [x] 02-01: 实现 `src/bitable-output.ts`
- [x] 02-02: 验证 Markdown 与 Excel 输出

### Phase 3: CLI 集成和端到端验证
**Goal**: 在现有 CLI 中识别 `/base/` URL，并接入多维表格导出流程。
**Depends on**: Phase 2
**Requirements**: BIT-03
**Success Criteria**:
  1. CLI 能区分文档和多维表格 URL。
  2. `--file` 模式支持混合 URL。
  3. README、构建和全量回归验证完成。
**Plans**: 2 plans

Plans:
- [x] 03-01: 在 CLI 中集成 Bitable 处理
- [x] 03-02: 更新 README 并运行全量测试

</details>

### 🚧 v0.2 M002: 目录结构导出与附件下载 (In Progress)

**Milestone Goal:** 一键导出飞书知识库完整目录树、文档和附件，形成可离线使用的层级化归档。

#### Phase 4: 知识库目录树提取
**Goal**: 从真实飞书知识库提取层级、标题和 URL，生成 `wiki-toc.md` 与 `wiki-toc.json`。
**Depends on**: Phase 3
**Requirements**: WIKI-01
**Success Criteria**:
  1. `--wiki <url>` 可读取真实知识库目录树。
  2. Markdown 目录保留层级、标题和链接。
  3. JSON 输出提供完整结构化树。
**Plans**: TBD

#### Phase 5: 文档附件下载
**Goal**: 下载文档内嵌的 PDF、Office 等附件，并将 Markdown 引用改为本地路径。
**Depends on**: Phase 4
**Requirements**: ATT-01
**Success Criteria**:
  1. 附件写入输出目录的 `assets/`。
  2. Markdown 中对应位置使用可用的本地相对链接。
  3. 现有图片与文档导出行为不回归。
**Plans**: TBD

#### Phase 6: 批量 Wiki 导出集成
**Goal**: 使用 `--wiki <url> --export-all` 按知识库层级批量导出全部文档和附件。
**Depends on**: Phase 4, Phase 5
**Requirements**: WIKI-02, REG-01
**Success Criteria**:
  1. 输出目录结构与知识库层级一致。
  2. 每篇文档生成独立 Markdown，附件位于对应 `assets/`。
  3. 现有 `--url`、`--file`、`--interactive` 流程通过回归测试。
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Bitable 数据提取核心 | v0.1 | 3/3 | Complete | 2026-05-15 |
| 2. Markdown 和 Excel 输出 | v0.1 | 2/2 | Complete | 2026-05-15 |
| 3. CLI 集成和端到端验证 | v0.1 | 2/2 | Complete | 2026-05-15 |
| 4. 知识库目录树提取 | v0.2 | 0/TBD | Not started | - |
| 5. 文档附件下载 | v0.2 | 0/TBD | Not started | - |
| 6. 批量 Wiki 导出集成 | v0.2 | 0/TBD | Not started | - |
