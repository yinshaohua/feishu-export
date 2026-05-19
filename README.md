# feishu-export

把可查看的飞书文档和多维表格抓取为 Markdown，便于导入 Obsidian；多维表格同时导出为 Excel (.xlsx)。

## 功能

- `--interactive`：手动打开文档，按 Enter 连续抓取
- `--url`：抓取单个飞书文档或多维表格 URL
- `--file`：从 URL 列表批量抓取（文档和多维表格 URL 可混合）
- `--folder`：遍历飞书云盘文件夹，按目录层级导出全部文档并下载附件
- `--profile-dir`：浏览器缓存目录，这里保存浏览器登录状态
- 持久化浏览器 profile，避免每次重复登录
- 自动滚动长文档
- 输出 Markdown frontmatter（含 `source_url` / `captured_at`）
- 对标题 / 正文 / 编号列表做结构语义归一化
- 自动过滤飞书注入的零宽追踪字符，文件名和正文均干净输出
- **多维表格**：同时输出 `.md`（Markdown 表格）和 `.xlsx`（Excel 工作簿）

## 安装

```bash
npm install
npx playwright install chromium
```

## 用法

> **npm 参数转发说明**：为兼容部分 Windows PowerShell + npm 版本，本文档统一使用 `npm run <script> -- -- <args>`。多出来的裸 `--` 会被当前 CLI 忽略，在只需要单个 `--` 的环境中也可以正常使用。

### 交互式连续抓取

```bash
npm run grab:interactive -- -- --out=./output
```

### 抓取飞书云盘文件夹

```bash
npm run grab -- -- --folder="https://xxx.feishu.cn/drive/folder/TOKEN" --out=./output
```

遍历整个文件夹目录树，在 `output/<文件夹名>/` 下按层级建目录，并：

- 文档 / 多维表格 → 导出为 `.md`（多维表格同时输出 `.xlsx`）
- 附件（非图片文件）→ 原名下载到对应目录
- 图片 → 随文档一起下载到 `assets/` 子目录

完成后输出统计：成功 / 失败 / 跳过数量。

### 抓取单个文档

```bash
npm run grab -- -- --profile-dir="C:\tmp\feishu-profile" --url="https://xxx.feishu.cn/docx/AAA" --out=./output
```

### 抓取多维表格

```powershell
# URL 含 & 时必须加引号
npm run grab -- -- --profile-dir="C:\tmp\feishu-profile" --url="https://xxx.feishu.cn/base/TOKEN?table=tblXxx&view=vewXxx" --out=./output
```

> **PowerShell 注意**：URL 含 `&` 时必须加引号，否则 `&` 会被 shell 当作命令分隔符截断。

输出两个文件：
- `output/TOKEN_YYYY-MM-DD.md` — Markdown 表格（含 YAML front-matter）
- `output/TOKEN_YYYY-MM-DD.xlsx` — Excel 工作簿（加粗列头、URL 超链接、冻结首行）

> **注意**：当前每次最多导出 200 条记录（飞书 API 限制），超过 200 条的表格会被截断。

### 批量抓取

把需要抓取的飞书文档 URL 逐行写入 `urls.txt`，然后执行：

```bash
npm run grab:file
```

等价命令：

```bash
npm run grab -- -- --profile-dir="C:\tmp\feishu-profile" --file=./urls.txt --out=./output
```

批量模式会先自动检查登录态：已登录则直接开始抓取，未登录则提示先在浏览器中完成登录。

## 回归验证

### 一键回归

```bash
npm run test:all
```

顺序执行：`build` → `test:normalize` → `test:docs:check`

### 结构归一化规则回归

```bash
npm run test:normalize
```

覆盖以下归一化行为：

- `分享者：...` 从标题降级为普通段落
- `一、...` / `2、...` 从普通文本升格为标题
- 连续 `（1）（2）（3）...` 折叠为有序列表
- 孤立短项如 `（7）参观仓库` 保留为标题

### 真实文档回归

把需要测试的飞书文档 URL 放入 `urls.txt`，然后执行：

```bash
npm run test:docs:check
```

如需详细调试日志：

```bash
FEISHU_EXPORT_DEBUG=1 npm run test:docs
```

## 浏览器登录态

脚本会把 Chromium profile 保存到 `.playwright-profile/`。

- 第一次运行通常需要手动登录飞书
- 后续运行会自动复用登录态

## 支持的块类型

### 已支持

| 块类型 | 说明 |
|--------|------|
| heading | heading1–6，外加正文启发式升格 |
| paragraph | 普通正文段落 |
| ordered / bullet list | 基础列表，以及连续编号段落折叠 |
| image | 下载到本地 assets/ 目录，Markdown 引用本地路径；表格内图片同样支持 |
| sheet | 导出为飞书 base 链接，附带文本摘要；费用区间类 sheet 尝试恢复为 Markdown table |
| divider | 保留为分隔线 |
| code block | 保留语言标注，原样输出为 fenced code block |
| table | 原生表格导出为 Markdown table；含图片的单元格以 `（图片）` 占位，图片附于表格后 |

### 暂未支持

| 块类型 | 说明 |
|--------|------|
| file / attachment | 通过 `--folder` 模式下载；单文档模式暂未支持 |
| iframe / embed | 缺少稳定样本，暂未实现 |
| todo list | 类型已预留，暂未专项提取 |
