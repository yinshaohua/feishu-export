# feishu-export

把可查看的飞书文档、飞书云盘文件夹、多维表格导出为本地文件：

- 文档 → Markdown
- 多维表格 → Markdown + Excel (`.xlsx`)
- 文件夹 → 按目录层级导出文档并下载附件

## 安装

本项目以 WSL2 作为主要开发和运行环境。在 WSL2 shell 中进入项目根目录并安装依赖，依赖会写入当前项目的 `node_modules`：

```bash
npm install
npx playwright install chromium
```

不要使用 Windows 的 `node.exe`、`npm.cmd` 或 PowerShell 安装依赖。Windows 和 WSL2 的原生包不能混用；如果曾经用 Windows npm 安装过依赖，请在 WSL2 中执行 `npm ci` 完整重建。

本项目不需要执行 `setenv` 或配置外置依赖环境变量。

## 常用命令

> 以下命令均在 WSL2 shell 中执行。npm 会从项目内的 `node_modules` 解析 `tsx`、`playwright` 和 `exceljs` 等依赖。

### 抓取单个文档

```bash
npm run grab -- --profile-dir="$HOME/.local/share/feishu-export/browser-profile" --url="https://xxx.feishu.cn/docx/AAA" --out=./output
```

### 抓取多维表格

```bash
npm run grab -- --profile-dir="$HOME/.local/share/feishu-export/browser-profile" --url="https://xxx.feishu.cn/base/TOKEN?table=tblXxx&view=vewXxx" --out=./output
```

> URL 含 `&` 时必须加引号。

### 交互式连续抓取

```bash
npm run grab:interactive -- --profile-dir="$HOME/.local/share/feishu-export/browser-profile" --out=./output
```

### 批量抓取

把 URL 逐行写入 `urls.txt`，然后执行：

```bash
npm run grab:file -- --profile-dir="$HOME/.local/share/feishu-export/browser-profile" --out=./output
```

### 抓取飞书云盘文件夹

```bash
npm run grab -- --profile-dir="$HOME/.local/share/feishu-export/browser-profile" --folder="https://xxx.feishu.cn/drive/folder/TOKEN" --out=./output
```

文件夹模式会：

- 按层级创建目录
- 导出文档 / 多维表格
- 下载附件
- 下载文档中的图片到 `assets/`

## 回归验证

### 一键回归

```bash
npm run test:all
```

### 结构归一化规则回归

```bash
npm run test:normalize
```

### 真实文档结果检查

```bash
npm run test:docs:check
```

如需详细调试日志：

```bash
FEISHU_EXPORT_DEBUG=1 npm run test:docs -- --profile-dir="$HOME/.local/share/feishu-export/browser-profile" --out=./output
```

## 浏览器登录态

浏览器登录态保存在你传入的 `--profile-dir` 中。

建议固定使用同一个目录，例如：

```text
~/.local/share/feishu-export/browser-profile
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
