# 🚀 DeepSeek HUD — Claude Code 实时用量监控插件

> 💎 专为 DeepSeek API 用户打造的终端 HUD — Token 消耗 · 上下文窗口 · 会话花费 · 账户余额，尽收眼底

一款精美的 Claude Code 实时状态栏插件，将 DeepSeek API 用量信息直接嵌入终端底部。**Token 消耗** 📊、**输入/输出/缓存命中** 🔄、**上下文窗口占比** 🪟、**会话人民币花费** 💰、**账户实时余额** 🏦 — 全部以 3 行彩色 HUD 优雅呈现。

### ✨ 监控指标一览

| 指标 | 说明 |
|---|---|
| 📊 **Token 消耗** | 实时展示当前上下文 token 用量（输入 ↑ / 输出 ↓ / 缓存命中 ⟳） |
| 🪟 **上下文窗口** | 彩色进度条（🟢<70% 🟡70-89% 🔴≥90%），一眼掌握窗口压力 |
| 💰 **会话花费** | 基于 DeepSeek 余额差值的**真实人民币成本**，比 Claude Code 的 USD 估算精准 50 倍 |
| 🏦 **账户余额** | 直连 DeepSeek API 查询实时余额，充值/赠送金额分明 |
| 🔥 **Effort 等级** | 当前推理强度（💤low ⚡medium 🔥high 🚀xhigh 💥max） |
| 🌿 **Git 分支** | 自动检测当前项目 Git 分支 |
| ⏱️ **会话时长** | 本次会话已持续时间 |
| 🎯 **多模型追踪** | 分别追踪 `deepseek-v4-pro` 和 `deepseek-v4-flash` 的 token 用量 |

## 效果预览

终端底部 3 行 HUD：

```
[deepseek-v4-pro] 📁 my-project | 🌿 main | 🔥 high | ⏱️ 15m 0s
████░░░░░░ 42% ctx | 本会话 ↑14.0K ↓2.8K ⟳4.5K(24%) | 💰 ¥0.50(估¥0.025) $0.035 1.0M
💎 ¥110.00(充) | 今日 ↑44.3M(⟳43.2M命中97%)↓226.8K | ✅
```

| 行 | 内容 | 说明 |
|---|---|---|
| 1 | **会话标识** | 模型名、项目目录、Git 分支、effort 等级、会话时长 |
| 2 | **会话资源** | 上下文窗口进度条（绿/黄/红）、`本会话` 标签 + **本次对话** token（↑输入 ↓输出）、缓存命中率（⟳X(X%)）、余额差值成本 + token 估算 + USD 参考、模型真实窗口大小（v4=1.0M，其余取报告值） |
| 3 | **余额与今日** | DeepSeek 余额、`今日` 标签 + **真实** 每日用量（来自平台 API）：总输入（缓存 + 未缓存）、缓存拆分 `(⟳X命中Y%)`、每日输出、可用状态 |

## 功能特性

- **真实人民币成本** — 通过 DeepSeek 余额差值（`初始余额 − 当前余额`）追踪实际消费，辅以基于 session token 量的费用估算（`估¥X.XXXX`）
- **真实每日用量** — 直接从 `platform.deepseek.com/api/v0/usage/amount` 拉取实际 token 消耗（与 DeepSeek 后台网页数据一致），包含缓存命中/未命中拆分
- **缓存命中率** — 上下文级展示 `⟳4.5K(24%)`；Line 3 展示每日缓存拆分 `⟳43.2M命中97%`
- **会话 / 今日分离** — Line 2 展示**本次对话** token 消耗，Line 3 展示**今日累计**（来自平台 API 的真实数据）
- **多模型追踪** — 分别显示 `deepseek-v4-pro` 和 `deepseek-v4-flash` 的累计 token 用量，活跃模型高亮
- **双币种展示** — 同时显示 Claude Code 的 USD 估算值和余额差值计算的真实 CNY 消费
- **30 秒余额缓存** — 避免频繁请求 DeepSeek API
- **会话持久化** — token 计数器在 `/compact` 和模型切换后保持不变
- **充值检测** — 余额增加时自动重置消费基线
- **优雅降级** — 余额 API 不可用时仍正常显示会话数据
- **压缩检测** — 上下文窗口压缩时显示 `🗜️` 图标

## 项目结构

```
deepseek-statusline/
├── bin/
│   └── cli.js              # CLI 入口（settings.json 中 statusLine.command 指向此文件）
├── src/
│   ├── index.js            # 主编排器：读 stdin → 拉余额 → 渲染输出
│   ├── render.js           # 3 行 ANSI HUD 渲染器（颜色 + 进度条）
│   ├── balance.js          # DeepSeek 余额 API 客户端（30s 文件缓存）
│   ├── session.js          # 会话状态管理：余额差值 + 多模型 token 累计
│   ├── usage.js            # 每日用量：平台 API + intercept.js 回退方案
│   ├── format.js           # 格式化工具：时长、token、货币、ANSI 颜色常量
│   └── intercept.js        # HTTPS/fetch 拦截器（通过 NODE_OPTIONS 加载）
├── install.sh              # 一键安装脚本（macOS / Linux / Git Bash）
├── install.ps1             # 一键安装脚本（Windows PowerShell）
├── setup-token.sh          # 平台 Token 配置助手（macOS / Linux）
├── setup-token.ps1         # 平台 Token 配置助手（Windows PowerShell）
├── setup-token-auto.js     # 自动 Token 提取（Playwright — Windows 一键完成）
├── package.json
├── .gitignore
├── README.md
└── README_zh.md
```

## 工作原理

### 余额差值（真实人民币成本）

不使用 Claude Code 基于 Anthropic 定价的 USD 估算，而是通过 DeepSeek 余额 API 计算实际 CNY 消费：

1. 首次调用时，将当前 DeepSeek 余额记录为 `initialBalance`（初始余额）
2. 后续每次调用计算 `sessionCost = initialBalance − currentBalance`（消费金额）
3. 消费金额单调递增，避免 API 缓存波动导致数字回退
4. 余额上升（充值）时自动重置基线
5. 同时基于 session token 量 × DeepSeek 官价计算估算值（`估¥X.XXXX`），作为即时参考

### 会话 vs 今日 — Token 追踪

Claude Code 传入的 `total_input_tokens` / `total_output_tokens` 是 **今日 API Key 级别累计值**，对第三方模型可能在长会话中重置：

- **Line 2 会话 token** 按**每次调用的增量**累计到模型统计中——每次计算 `max(0, 当前值 − 上次值)` 累加到模型计数器。即使 Claude Code 重置了日累计值也不会丢失。
- **Line 3 今日 token** = 平台 API 真实用量（所有会话总和，含缓存命中/未命中拆分）
- **上下文占比** = `current_usage` 的 token 数（输入 + 输出 + 缓存）/ 模型真实窗口大小（v4=1M），保留两位小数
- **缓存命中率** = `cache_read_input_tokens / (input_tokens + cache_read_input_tokens)`（当前上下文快照）
- **会话花费** = 余额差值（实际消费）+ token 估算（即时参考）

### 多模型 Token 追踪

每次 API 调用的 token 增量归入当前活跃模型：

- 比较当前上下文 token 数与上次基线，差值计入对应模型
- `/compact` 后 token 数下降时，保留累计值不变，仅重置增量基线
- 当前活跃模型 → **白色**；非活跃模型 → 暗色

### 数据来源

| 数据 | 来源 |
|---|---|
| 会话 token 增量 | Claude Code stdin JSON，按模型累计到会话状态文件 |
| DeepSeek 账户余额 | `GET https://api.deepseek.com/user/balance`（每 30 秒刷新） |
| **真实每日用量**（Line 3） | `GET https://platform.deepseek.com/api/v0/usage/amount` — 与 DeepSeek 后台网页数据完全一致 |
| 各模型 token 累计 | 会话状态文件（存储于系统临时目录 `os.tmpdir()`，会话重置后仍保留） |
| 上下文窗口占用 | `current_usage`（输入 + 输出 + 缓存）/ 模型窗口（v4=1M） |
| 缓存命中率（上下文） | `current_usage.cache_read_input_tokens` / `current_usage.input_tokens` |

### 平台 Token 配置（真实每日用量必配）

Line 3 展示**真实**每日 token 用量，需要从浏览器提取 Bearer Token。有两种方式：

####  自动模式（Windows / macOS / Linux — 无需手动操作）

安装 Playwright 后（`npm install -g playwright`），脚本可**全自动**完成提取：

```bash
# 所有平台
bash ~/.claude/deepseek-hud/setup-token.sh

# Windows PowerShell（加 -Force 跳过确认）
powershell -File ~/.claude/deepseek-hud/setup-token.ps1 -Force
```

**自动化流程：**

1. 检测你的浏览器（Chrome / Edge / Brave / Chromium）
2. 关闭所有浏览器窗口（需要访问你的登录 Profile）
3. 用你的 Profile 重新启动浏览器（保留已登录状态）
4. 打开 `platform.deepseek.com/usage`，等待用量 API 请求
5. 自动捕获请求头中的 Bearer Token
6. 保存 Token 并关闭浏览器

**运行时的实际表现：**

| 步骤 | 现象 |
|---|---|
| 浏览器窗口关闭 | 所有 Chrome/Edge/Brave 窗口消失 — **请先保存工作** |
| 浏览器短暂打开 | 一个新窗口出现，自动跳转 DeepSeek，然后关闭 |
| 终端输出 | 显示进度：检测浏览器 → 启动 → 等待 API → 完成 |

> **⚠️ 注意：** 自动模式会**关闭你所有浏览器窗口**。未保存的内容（表单、草稿）会丢失。脚本会先提示确认，用 `-Force` 可跳过提示（如果你已做好准备）。

**常见问题及解决：**

| 问题 | 原因 | 解决 |
|---|---|---|
| 提示 `Profile locked` | 浏览器仍在运行 | 手动关闭所有浏览器窗口后重试 |
| 提示 `Playwright not found` | 未安装 Playwright | `npm install -g playwright` |
| 提示 `No supported browser found` | 未装 Chrome/Edge/Brave/Chromium | 安装任一浏览器，或使用手动模式 |
| Token 拿到了但 Line 3 还是估算 | 浏览器中未登录 DeepSeek | 先在浏览器登录 `platform.deepseek.com`，再重试 |
| 用了一段时间后显示 `⚠️ 用量凭证过期` | Token 过期（正常的，几周后） | 重新运行 setup 脚本 |

####  手动模式（无需安装依赖，全平台通用）

没有 Playwright，或自动模式失败时，用手动提取：

```bash
# macOS / Linux
bash ~/.claude/deepseek-hud/setup-token.sh
# （缺少 Playwright 时自动回退到手动模式）

# Windows PowerShell
powershell -File ~/.claude/deepseek-hud/setup-token.ps1 -Manual
```

**操作步骤：**

1. 浏览器打开 https://platform.deepseek.com/usage 并登录
2. 按 F12 → **Network**（网络）标签
3. 点击页面 **每月用量**，切换一下月份或直接刷新页面（触发 API 请求）
4. 在 Network 列表中找到 `/api/v0/usage/amount?month=...` 请求并点击
5. 右侧 **Request Headers**（请求标头）往下翻，找到 `Authorization: Bearer ...`
6. 复制 `Bearer ` **后面**的值（不含 "Bearer " 前缀）
7. 粘贴到脚本提示中

####  Token 存储

读取优先级：
1. `DEEPSEEK_PLATFORM_TOKEN` 环境变量
2. `~/.claude/deepseek-hud/.platform_token` 文件

> ⚠️ 平台 Token 有效期**几天到几周**。过期时 Line 3 会显示 `⚠️ 用量凭证过期 运行 setup-token 刷新`，重新运行 setup 脚本即可。

### 语言设置

HUD 默认显示**中文**。如需切换为英文，设置环境变量：

```bash
export DEEPSEEK_HUD_LANG=en
```

Windows PowerShell：

```powershell
$env:DEEPSEEK_HUD_LANG = "en"
```

中文（默认） | 英文
---|---
`本会话` | `sess`
`估` / `缓存估` | `~` / `cache~`
`今日` | `today`
`命中` | `hit`
`(充)` / `(赠)` | `+topup` / `+grant`
`总` | `total`
`暂无数据` | `no data`
`(缓存)` | `(stale)`
`⚠️ 用量凭证过期` / `运行 setup-token 刷新` | `⚠️ platform login expired` / `run setup-token to refresh`

## 安装配置

### 一键安装

```bash
# macOS / Linux / Git Bash (Windows)
curl -fsSL https://raw.githubusercontent.com/supadLL/deepseek-hud/main/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://raw.githubusercontent.com/supadLL/deepseek-hud/main/install.ps1 | iex
```

或从 [Releases](https://github.com/supadLL/deepseek-hud/releases) 页面下载指定版本，解压到 `~/.claude/deepseek-hud/`。

安装脚本会自动完成：
1. 检查 Node.js 和 Git 是否可用
2. 克隆仓库到 `~/.claude/deepseek-hud/`
3. 自动配置 `~/.claude/settings.json`
4. 运行冒烟测试验证
5. 配置真实用量追踪（NODE_OPTIONS wrapper 写入 shell profile）

**安装后**，配置平台 Token 以启用真实每日用量显示：

```bash
# macOS / Linux / Git Bash
bash ~/.claude/deepseek-hud/setup-token.sh

# Windows PowerShell
powershell -File ~/.claude/deepseek-hud/setup-token.ps1
```

**升级**：再次运行同一命令（自动执行 `git pull`）。

**卸载**：

```bash
rm -rf ~/.claude/deepseek-hud
# 然后从 ~/.claude/settings.json 中删除 "statusLine" 字段
```

### 前置条件

- **Claude Code** ≥ 2.1
- **Node.js** ≥ 14
- **Git**（用于克隆/更新）
- DeepSeek API Key，已配置为 Claude Code 的 `ANTHROPIC_AUTH_TOKEN` 环境变量

### 手动配置

在 `~/.claude/settings.json` 中添加 `statusLine` 字段：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /你的路径/deepseek-statusline/bin/cli.js",
    "padding": 0
  }
}
```

> **Windows 用户**：路径中使用正斜杠（如 `C:/Users/...`），推荐使用 Git Bash。

### 发布新版本

推送版本标签即可触发自动打包：

```bash
git tag v1.2.0
git push origin v1.2.0
```

GitHub Actions 会自动构建 `deepseek-hud-v1.2.0.zip` 和 `deepseek-hud-v1.2.0.tar.gz`，并附带自动生成的更新日志。

### 验证安装

用模拟数据测试：

```bash
echo '{"model":{"id":"deepseek-v4-pro"},"workspace":{"current_dir":"/path/to/project"},"cost":{"total_cost_usd":0.0123,"total_duration_ms":330000},"context_window":{"total_input_tokens":15500,"total_output_tokens":1200,"context_window_size":200000,"used_percentage":42,"current_usage":{"input_tokens":8500,"output_tokens":1200,"cache_read_input_tokens":2000}},"effort":{"level":"high"},"session_id":"test"}' | node bin/cli.js
```

输出 3 行 HUD 即表示安装成功。

## 颜色与图标

### 颜色

| 颜色 | 含义 |
|---|---|
| 🟢 绿色 | 上下文使用 < 70% |
| 🟡 黄色 | 上下文使用 70%–89% |
| 🔴 红色 | 上下文使用 ≥ 90% |
| 🟢 绿色（`⟳`） | 缓存命中 token + 命中率 (24%) |
| 🟡 黄色（`💰`） | 会话消费 / 余额差值 RMB |
| 🔵 青色 | 模型名称 |
| ⚪ 白色 | 会话输入 token / 活跃模型统计 |
| 🌫️ 暗色 | 输出 / 非活跃 / 零值 / 标签（`今日`,`总`,`估`）

### 图标

| 图标 | 含义 |
|---|---|
| ↑ | 输入 token |
| ↓ | 输出 token |
| ⟳ | 缓存命中 token（prompt cache hit） |
| 💰 | 费用（USD 估算 + 实际人民币） |
| 💎 | DeepSeek 账户余额 |
| 📊 | 多模型 token 统计 |
| ⏱️ | 会话时长 |
| 📁 | 项目目录 |
| 🌿 | Git 分支 |
| 💤⚡🔥🚀💥 | Effort 等级：low / medium / high / xhigh / max |

## 常见问题

**Q: Emoji 图标（📁🌿💰💎）在 Windows 上显示为方框或乱码 — 怎么解决？**

A: **这不是插件的问题**——是 Windows 旧版控制台（conhost.exe）不支持 Emoji 渲染。解决方案：

1. 从 Microsoft Store 安装 **Windows Terminal**（免费）
2. 打开 Windows Terminal → 设置 → 设为**默认终端应用程序**
3. VS Code 中：`Ctrl+Shift+P` → `Terminal: Select Default Profile` → 选择 Windows Terminal

Windows Terminal、macOS 终端、iTerm2 及大多数 Linux 终端均原生支持 Emoji——仅旧版 Windows 控制台有此问题。

**Q: Line 3 显示的是"缓存估XX%"而不是真实数据，为什么？**

A: 你还没配置平台 Token。运行 `bash ~/.claude/deepseek-hud/setup-token.sh`（或 PowerShell 版本）完成配置。配置成功后 Line 3 会显示真实用量 `↑44.3M(⟳43.2M命中97%)↓226.8K`。

**Q: Line 3 显示 `⚠️ 用量凭证过期 运行 setup-token 刷新` — 怎么办？**

A: 平台 Token 过期了。运行 setup 脚本重新获取，30 秒搞定：
```bash
bash ~/.claude/deepseek-hud/setup-token.sh
```

**Q: 为什么每日输入量 40M+ 这么大，而 Line 2 显示的数很小？**

A: Line 3 显示的是**含缓存命中**的 token 总量。缓存命中率通常 ~97%，所以绝大多数 token 走缓存。Line 2 显示的是**本次会话**的非缓存 token。两者都没错，只是统计口径不同。

**Q: `↑44.3M(⟳43.2M命中97%)` 是什么意思？**

A: 今日总输入 44.3M token。其中 43.2M 是缓存命中（97% 命中率），约 1M 是非缓存输入（实际发送给模型）。数据来源是 DeepSeek 后台用量 API，与网页端显示完全一致。

**Q: `本次¥0.0000` 一直显示为 0？**

A: 余额差值是扣除所有会话（包括其他终端）的总消费。刚启动或消费很少时会显示 0。等几次 API 调用后余额下降，数字就会更新。

**Q: 余额显示"暂无数据"怎么办？**

A: 检查 `ANTHROPIC_AUTH_TOKEN` 环境变量是否正确设置，以及网络是否能访问 `api.deepseek.com`。脚本会在 30 秒后自动重试。

**Q: 是否支持其他模型（OpenAI、Anthropic）？**

A: 不支持。本插件专为 DeepSeek API 用户打造。余额 API、定价表、用量 API 均为 DeepSeek 专属。如需适配其他平台，欢迎 Fork 项目。

## License

MIT
