# feishu-export

把可查看的飞书文档、飞书云盘文件夹、多维表格导出为本地文件：

- 文档 → Markdown
- 多维表格 → Markdown + Excel (`.xlsx`)
- 文件夹 → 按目录层级导出文档并下载附件

## 当前使用方式

本项目的依赖和输出都在当前项目目录管理，依赖目录为 `./node_modules`，默认输出目录为 `./output`。

首次准备依赖时，在项目根目录执行：

```powershell
npm run deps:install
npx playwright install chromium
```

## 常用命令

> PowerShell 下统一使用 `npm run <script> -- -- <args>`，依赖由项目内 `node_modules` 提供。

### 抓取单个文档

```powershell
npm run grab -- -- --profile-dir="C:\tmp\feishu-profile" --url="https://xxx.feishu.cn/docx/AAA" --out=".\output"
```

### 抓取多维表格

```powershell
npm run grab -- -- --profile-dir="C:\tmp\feishu-profile" --url="https://xxx.feishu.cn/base/TOKEN?table=tblXxx&view=vewXxx" --out=".\output"
```

> URL 含 `&` 时必须加引号。

### 交互式连续抓取

```powershell
npm run grab:interactive -- -- --profile-dir="C:\tmp\feishu-profile" --out=".\output"
```

### 批量抓取

把 URL 逐行写入 `urls.txt`，然后执行：

```powershell
npm run grab:file -- -- --profile-dir="C:\tmp\feishu-profile" --out=".\output"
```

### 抓取飞书云盘文件夹

```powershell
npm run grab -- -- --profile-dir="C:\tmp\feishu-profile" --folder="https://xxx.feishu.cn/drive/folder/TOKEN" --out=".\output"
```

文件夹模式会：

- 按层级创建目录
- 导出文档 / 多维表格
- 下载附件
- 下载文档中的图片到 `assets/`

## 回归验证

### 一键回归

```powershell
npm run test:all
```

### 结构归一化规则回归

```powershell
npm run test:normalize
```

### 真实文档结果检查

```powershell
npm run test:docs:check
```

如需详细调试日志：

```powershell
$env:FEISHU_EXPORT_DEBUG = '1'
npm run test:docs -- -- --profile-dir="C:\tmp\feishu-profile" --out=".\output"
```

## 浏览器登录态

浏览器登录态保存在你传入的 `--profile-dir` 中。

建议固定使用同一个目录，例如：

```text
C:\tmp\feishu-profile
```

第一次运行通常需要手动登录飞书，后续会复用登录态。

## 输出说明

### 文档

输出为 Markdown，包含 frontmatter，例如：

- `source_url`
- `captured_at`
- `title`

### 多维表格

输出两个文件：

- `TOKEN_YYYY-MM-DD.md`
- `TOKEN_YYYY-MM-DD.xlsx`

当前单次最多导出 200 条记录（飞书接口限制）。

## 已知限制

- 单文档模式暂不单独下载普通附件；附件下载主要走 `--folder` 模式
- `iframe / embed` 暂未实现
- `todo list` 暂未专项提取
