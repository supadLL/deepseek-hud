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
[deepseek-v4-pro] 📁 my-project | 🌿 main | 🔥 high | ⏱️ 10m 0s
███████░░░ 72% ctx | 本会话 ↑14.0K ↓2.8K ⟳6.2K(25%) | 💰 ¥0.50(估¥0.025) $0.035 200K
💎 ¥110.00(充) | 今日 v4-pro↑150K↓25K v4-flash↑5K | 总↑180K↓30K | ✅
```

| 行 | 内容 | 说明 |
|---|---|---|
| 1 | **会话标识** | 模型名、项目目录、Git 分支、effort 等级、会话时长 |
| 2 | **会话资源** | 上下文窗口进度条（绿/黄/红）、`本会话` 标签 + **本次对话** token（↑输入 ↓输出）、缓存命中率（⟳X(X%)）、余额差值成本 + token 估算 + USD 参考 |
| 3 | **余额与今日** | DeepSeek 余额、`今日` 标签 + **今日累计** 各模型 token、`总` 今日总消耗、可用状态 |

## 功能特性

- **真实人民币成本** — 通过 DeepSeek 余额差值（`初始余额 − 当前余额`）追踪实际消费，辅以基于 session token 量的费用估算（`估¥X.XXXX`）
- **缓存命中率** — 展示 `⟳4.5K(24%)`，直观反映 prompt cache 的命中效率
- **会话 / 今日分离** — Line 2 展示**本次对话** token 消耗，Line 3 展示**今日累计**（`今日` 标签）和今日总消耗（`总`）
- **多模型追踪** — 分别显示 `deepseek-v4-pro` 和 `deepseek-v4-flash` 的累计 token 用量，活跃模型高亮
- **双币种展示** — 同时显示 Claude Code 的 USD 估算值和余额差值计算的真实 CNY 消费
- **30 秒余额缓存** — 避免频繁请求 DeepSeek API
- **会话持久化** — token 计数器在 `/compact` 和模型切换后保持不变
- **充值检测** — 余额增加时自动重置消费基线
- **优雅降级** — 余额 API 不可用时仍正常显示会话数据

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
│   └── format.js           # 格式化工具：时长、token、货币、ANSI 颜色常量
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

Claude Code 传入的 `total_input_tokens` / `total_output_tokens` 是 **今日 API Key 级别累计值**，不是会话级别的：

- **会话开始**时快照当日累计为 `dailyBaseline`
- **Line 2 会话 token** = 当日累计 − 会话起始基线（本次对话消耗）
- **Line 3 今日 token** = 当日累计值 + `今日` 标签（所有会话总和）
- **缓存命中率** = `cache_read_input_tokens / (input_tokens + cache_read_input_tokens)`（当前上下文快照）

### 多模型 Token 追踪

每次 API 调用的 token 增量归入当前活跃模型：

- 比较当前上下文 token 数与上次基线，差值计入对应模型
- `/compact` 后 token 数下降时，保留累计值不变，仅重置增量基线
- 当前活跃模型 → **白色**；非活跃模型 → 暗色

### 数据来源

| 数据 | 来源 |
|---|---|
| 会话 token、成本、时长 | Claude Code 通过 stdin 传入的 JSON |
| DeepSeek 账户余额 | `GET https://api.deepseek.com/user/balance`（每 30 秒刷新） |
| 各模型 token 累计 | 会话状态文件（存储于系统临时目录 `os.tmpdir()`） |
| 缓存命中率 | `current_usage.cache_read_input_tokens` / `current_usage.input_tokens` |

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

安装脚本会自动完成：
1. 检查 Node.js 和 Git 是否可用
2. 克隆仓库到 `~/.claude/deepseek-hud/`
3. 自动配置 `~/.claude/settings.json`
4. 运行冒烟测试验证

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

**Q: 为什么 `本次¥0.0000` 一直显示为 0？**

A: 余额差值是扣除所有会话（包括其他终端）的总消费。如果刚启动或消费很少，可能显示 0。等待几次 API 调用后余额下降，数字就会更新。

**Q: 模型切换后 token 统计准吗？**

A: token 增量按当时活跃的模型归因。由于上下文在模型间共享，切换模型后的增量可能包含之前模型的缓存 token。这只是一个近似统计，精确数据需查阅 DeepSeek 后台。

**Q: 余额显示"暂无数据"怎么办？**

A: 检查 `ANTHROPIC_AUTH_TOKEN` 环境变量是否正确设置，以及网络是否能访问 `api.deepseek.com`。脚本会在 30 秒后自动重试。

## License

MIT
