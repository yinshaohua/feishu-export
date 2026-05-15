# feishu-export

把可查看的飞书文档抓取为 Markdown，便于导入 Obsidian。

## 当前能力

- `--interactive`：手动打开文档，按 Enter 连续抓取
- `--url`：抓取单个飞书文档 URL
- `--file`：从 URL 列表批量抓取
- 同标题文档默认覆盖同名 Markdown 文件，避免旧导出残留混淆
- 持久化浏览器 profile，避免每次重复登录
- 自动滚动长文档
- 输出 Markdown frontmatter（含 `source_url` / `captured_at` / `debug_notes`）
- 对标题 / 正文 / 编号列表做结构语义归一化
- 结构归一化回归脚本：`test/normalize-regression.ts`
- 真实文档导出回归脚本：`test/docs-regression.ts`

## 安装

```bash
npm install
npx playwright install chromium
```

## 推荐日常命令流

### 首次安装

```bash
npm install
npx playwright install chromium
```

### 日常抓取

单文档：

```bash
npm run grab -- --url=https://xxx.feishu.cn/docx/AAA --out=./output
```

批量抓取固定样本：

```bash
npm run grab:file
```

### 改规则后的最低验证

```bash
npm run test:all
```

如果只改了提取器里的非结构逻辑，至少也建议执行：

```bash
npm run build && npm run test:docs:check
```

## 用法

### 1) 交互式连续抓取

```bash
npm run grab:interactive -- --out=./output
```

### 2) 抓取单个文档

```bash
npm run grab -- --url=https://xxx.feishu.cn/docx/AAA --out=./output
```

### 3) 批量抓取

当前真实回归先固定只用这 3 篇文档，保存在 `urls.txt`：

```txt
https://ivtafhlzcve.feishu.cn/docx/CQPzduBDWobhLgxCbG2cDvsQnLb
https://ivtafhlzcve.feishu.cn/docx/ZFigduuO2oxwxPxPrRAcBSNgnJb
https://ivtafhlzcve.feishu.cn/docx/PcYGdOCiPoQpOUxJ8iWcBLGXnob
```

抓取：

```bash
npm run grab:file
```

批量模式会先自动打开第一篇文档检查登录态：

- 如果检测到已登录，会直接开始批量抓取
- 如果未登录，才会提示你先在浏览器中完成登录

轻量校验导出结果：

```bash
npm run test:docs:check
```

等价命令：

```bash
npm run grab -- --file=./urls.txt --out=./output
```

## 回归验证

### 一键回归

```bash
npm run test:all
```

会顺序执行：

- `npm run build`
- `npm run test:normalize`
- `npm run test:docs:check`

### 结构归一化规则回归

```bash
npm run test:normalize
```

当前会覆盖这些关键行为：

- `分享者：...` 从标题降级为普通段落
- `一、...` / `2、...` 从普通文本升格为标题
- 连续 `（1）（2）（3）...` 折叠为有序列表
- 孤立短项如 `（7）参观仓库` 保留为标题

### 构建检查

```bash
npm run build
```

建议在修改 `src/extract.ts` 或 `src/normalize.ts` 后至少跑一遍：

```bash
npm run build && npm run test:normalize
```

## 浏览器登录态

脚本会把 Chromium profile 保存到 `.playwright-profile/`。

- 第一次运行：通常需要你手动登录飞书
- 后续运行：大多数情况下会复用登录态

## 当前支持 / 未支持块类型

### 已支持

- heading：飞书运行时 heading1-6，外加正文启发式升格
- paragraph：普通正文段落
- ordered / bullet list：基础列表，以及连续编号段落折叠
- image：导出为远程图片 Markdown
- sheet：导出为“内嵌表格”链接，保留清洗后的文本摘要；对费用区间类 sheet 额外尝试恢复为 Markdown table，对参数核查类 sheet 输出更偏清单化的摘要
- divider：保留为分隔线语义块

### 暂未专项支持

- file / attachment：缺少稳定真实样本，暂未做专门提取
- iframe / embed：缺少稳定真实样本，暂未做专门提取
- todo list：类型定义已预留，当前未从飞书运行时专项抽取
- code block：当前没有稳定的专项结构提取，主要仍按普通文本回退
- table：普通原生表格仍缺少稳定专项提取；当前重点支持的是内嵌 sheet 的摘要/清单/费用表特化恢复

## 说明

当前版本已经可以用于真实飞书文档抓取，但提取策略仍偏启发式：

- 已有 CLI、浏览器持久化、滚动加载、Markdown 输出。
- 批量模式会先自动检查并尽量复用现有登录态；必要时才提示人工登录。
- `extract.ts` 当前优先尝试飞书运行时结构化 block 数据，其次回退到页面最长文本候选，再做统一结构归一化。
- 图片会以远程 URL 写入 Markdown，不下载到本地。
- 已支持把内嵌 sheet 导出为飞书 base 链接，并附带 `debug_notes` 记录本次抓取中的重试痕迹。
- 这更适合飞书这类“可见内容多，但正文 DOM 容器不稳定”的页面。
- 默认只打印抓取摘要；如需详细页面调试日志，可使用 `FEISHU_EXPORT_DEBUG=1 npm run test:docs`。

## 建议的下一步

1. 再找 2-3 篇不同结构的飞书文档做真实回归。
2. 针对标题、列表、todo、代码块、表格逐项增强提取逻辑。
3. 清理不再需要的临时探针脚本，只保留有用的回归工具。
