# 🚀 DeepSeek HUD — Real-Time Usage Monitor for Claude Code

> 💎 专为 DeepSeek  API 用户打造的 Claude Code 终端 HUD 插件 — 实时监控 Token 消耗、上下文窗口、会话花费与账户余额

A beautiful real-time heads-up display (HUD) for Claude Code that puts your DeepSeek API usage right at your fingertips. Track **token consumption** 📊, **input/output/cache tokens** 🔄, **context window pressure** 🪟, **session spending in RMB** 💰, and **live account balance** 🏦 — all in a sleek 3-line terminal status bar.

### ✨ What You Can Monitor

| 指标 | 说明 |
|---|---|
| 📊 **Token 消耗** | 实时展示当前上下文 token 用量（输入 ↑ / 输出 ↓ / 缓存命中 ⟳） |
| 🪟 **上下文窗口** | 彩色进度条（🟢<70% 🟡70-89% 🔴≥90%），一目了然 |
| 💰 **会话花费** | 基于 DeepSeek 余额差值的**真实人民币成本**，秒杀 Claude Code 的 USD 估算 |
| 🏦 **账户余额** | 直连 DeepSeek API 查询实时余额（充值/赠送分明） |
| 🔥 **Effort 等级** | 当前推理强度（💤low ⚡medium 🔥high 🚀xhigh 💥max） |
| 🌿 **Git 分支** | 当前项目分支名 |
| ⏱️ **会话时长** | 本次会话已持续时间 |
| 🎯 **多模型追踪** | 分别追踪 `deepseek-v4-pro` 和 `deepseek-v4-flash` 的 token 用量 |

## Preview

Three lines rendered at the bottom of your terminal:

```
[deepseek-v4-pro] 📁 my-project | 🌿 main | 🔥 high | ⏱️ 15m 0s
███████░░░ 72% ctx | 本会话 ↑14.0K ↓2.8K ⟳4.5K(24%) | 💰 ¥0.50(估¥0.025) $0.035 200K
💎 ¥110.00(充) | 今日 ↑44.3M(⟳43.2M命中97%)↓226.8K | ✅
```

| Line | Content | Description |
|---|---|---|
| 1 | **Session Identity** | Model name, project directory, Git branch, effort level, duration |
| 2 | **Session Resources** | Context window bar (green/yellow/red), `本会话` label + **session-level** tokens (↑in ↓out), cache hit rate (⟳X(X%)), cost (balance-delta RMB + token estimate + USD) |
| 3 | **Balance & Daily Totals** | DeepSeek balance, `今日` label + **real** daily usage from platform API: total input (cached + non-cached), cache breakdown `(⟳X命中Y%)`, daily output, availability |

## Features

- **Real RMB Cost** — tracks actual spending via DeepSeek balance delta (`initial − current`), plus session-level token-based cost estimate (`估¥X.XXXX`)
- **Real Daily Usage** — fetches actual token consumption from `platform.deepseek.com/api/v0/usage/amount` (the same data shown in the DeepSeek dashboard), including cache-hit/miss breakdown
- **Cache Hit Rate** — shows `⟳4.5K(24%)` for context-level cache rate; shows `⟳43.2M命中97%` for daily cache breakdown on Line 3
- **Session vs Daily** — Line 2 shows **session-level** tokens (this conversation), Line 3 shows **daily-cumulative** totals with `今日` label from the real platform API
- **Multi-Model Tracking** — displays cumulative token counts for each model (`deepseek-v4-pro` / `deepseek-v4-flash`), highlighting the active one
- **Dual Currency** — shows both Claude Code's USD estimate and the real CNY balance-delta cost
- **30s Balance Cache** — avoids rate-limiting the DeepSeek API
- **Session Persistence** — token counters survive `/compact` and model switches
- **Top-Up Detection** — resets cost baseline if balance increases (e.g. after topping up)
- **Graceful Degradation** — renders session lines even when the balance API is unreachable
- **Compaction Detection** — shows `🗜️` icon when context window was compacted

## Project Structure

```
deepseek-statusline/
├── bin/
│   └── cli.js              # CLI entry point (referenced by statusLine.command)
├── src/
│   ├── index.js            # Orchestrator: stdin → balance fetch → render
│   ├── render.js           # 3-line ANSI HUD renderer (colors + progress bar)
│   ├── balance.js          # DeepSeek balance API client (30s file cache)
│   ├── session.js          # Session state: balance delta + per-model tokens
│   ├── usage.js            # Daily usage: platform API + intercept.js fallback
│   ├── format.js           # Formatters: duration, tokens, currency, ANSI codes
│   └── intercept.js        # HTTPS/fetch monkey-patch (loaded via NODE_OPTIONS)
├── install.sh              # One-command installer (macOS / Linux / Git Bash)
├── install.ps1             # One-command installer (Windows PowerShell)
├── setup-token.sh          # Platform token setup helper (macOS / Linux)
├── setup-token.ps1         # Platform token setup helper (Windows PowerShell)
├── package.json
├── .gitignore
├── README.md
└── README_zh.md
```

## How It Works

### Balance Delta (Real RMB Cost)

Instead of relying on Claude Code's USD cost estimate (based on Anthropic pricing), this plugin computes actual CNY spending:

1. On the first invocation, the current DeepSeek balance is snapshotted as `initialBalance`
2. Each subsequent invocation computes `sessionCost = initialBalance − currentBalance`
3. The cost is monotonic (never decreases) to handle minor API jitter
4. If the balance rises (top-up), `initialBalance` resets automatically

### Per-Model Token Tracking

Tokens are attributed to the model that was active when they appeared:

- Context token deltas are accumulated per model ID
- After `/compact`, accumulated totals are preserved — only the delta baseline resets
- The currently-active model is highlighted in **white**; inactive models appear dimmed

### Session vs Daily — Token Tracking

Claude Code sends **daily-cumulative** `total_input_tokens` / `total_output_tokens` (API-key-wide, not per-session):

- **Session start** snapshots the daily totals as `dailyBaseline`
- **Line 2 session tokens** = daily cumulative − session baseline (this conversation)
- **Line 3 daily totals** = daily cumulative with `今日` label + `总` sum (all sessions today)
- **Cache hit rate** = `cache_read_input_tokens / (input_tokens + cache_read_input_tokens)` (current context snapshot)

### Data Sources

| Data | Source |
|---|---|
| Session tokens, cost, duration | Claude Code session JSON via stdin |
| DeepSeek account balance | `GET https://api.deepseek.com/user/balance` (cached 30s) |
| **Real daily usage** (Line 3) | `GET https://platform.deepseek.com/api/v0/usage/amount` — the same data as the DeepSeek web dashboard |
| Per-model token counters | Session state file in `os.tmpdir()` |
| Cache hit rate (context) | `current_usage.cache_read_input_tokens` / `current_usage.input_tokens` |

### Platform Token Setup (Required for Real Daily Usage)

Line 3 shows **real** daily token usage from the DeepSeek platform API. This requires a Bearer token from your browser session.

**Quick setup** (recommended):

```bash
# macOS / Linux / Git Bash
bash ~/.claude/deepseek-hud/setup-token.sh
```

```powershell
# Windows PowerShell
powershell -File ~/.claude/deepseek-hud/setup-token.ps1
```

This opens the DeepSeek platform in your browser and guides you through extracting the token.

**Manual setup**:

1. 浏览器打开 https://platform.deepseek.com/usage 并登录
2. 按 F12 → **Network**（网络）标签
3. 点击页面上的 **每月用量** 或切换一下月份（触发 API 请求）
4. 在 Network 列表中找到 `/api/v0/usage/amount?month=...` 请求并点击
5. 右侧 **Request Headers**（请求标头）往下翻，找到 `Authorization: Bearer ...`
6. 复制 `Bearer ` **后面**的那一串值（不含 "Bearer " 前缀）
7. 保存到 `~/.claude/deepseek-hud/.platform_token`：

```bash
echo -n "你的token值" > ~/.claude/deepseek-hud/.platform_token
```

Or set it as an environment variable:

```bash
export DEEPSEEK_PLATFORM_TOKEN="你的token值"
```

The token is read from (in priority order):
1. `DEEPSEEK_PLATFORM_TOKEN` environment variable
2. `~/.claude/deepseek-hud/.platform_token` file

> ⚠️ The platform token expires after days/weeks. When Line 3 stops showing real data, run the setup script again.

## Setup

### One-Command Install

```bash
# macOS / Linux / Git Bash (Windows)
curl -fsSL https://raw.githubusercontent.com/supadLL/deepseek-hud/main/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://raw.githubusercontent.com/supadLL/deepseek-hud/main/install.ps1 | iex
```

The installer:
1. Checks that Node.js and Git are available
2. Clones the repo to `~/.claude/deepseek-hud/`
3. Configures `~/.claude/settings.json` automatically
4. Runs a smoke test to verify
5. Configures real usage tracking (NODE_OPTIONS wrapper for shell profile)

**After installation**, set up your platform token for real daily usage display:

```bash
# macOS / Linux / Git Bash
bash ~/.claude/deepseek-hud/setup-token.sh

# Windows PowerShell
powershell -File ~/.claude/deepseek-hud/setup-token.ps1
```

To **upgrade**, re-run the same command (it does `git pull`).

To **uninstall**:

```bash
rm -rf ~/.claude/deepseek-hud
# Then remove the "statusLine" key from ~/.claude/settings.json
```

### Prerequisites

- **Claude Code** ≥ 2.1
- **Node.js** ≥ 14
- **Git** (for clone/update)
- DeepSeek API key configured as `ANTHROPIC_AUTH_TOKEN` in Claude Code settings

### Manual Configuration

If you prefer to set it up manually, add the `statusLine` field to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/deepseek-statusline/bin/cli.js",
    "padding": 0
  }
}
```

> **Windows users**: Use forward slashes in paths (e.g. `C:/Users/...`). Git Bash is recommended.

### Verify

Test with mock data:

```bash
echo '{"model":{"id":"deepseek-v4-pro"},"workspace":{"current_dir":"/path/to/project"},"cost":{"total_cost_usd":0.0123,"total_duration_ms":330000},"context_window":{"total_input_tokens":15500,"total_output_tokens":1200,"context_window_size":200000,"used_percentage":42,"current_usage":{"input_tokens":8500,"output_tokens":1200,"cache_read_input_tokens":2000}},"effort":{"level":"high"},"session_id":"test"}' | node bin/cli.js
```

Three lines of output = success.

## Color Reference

| Color | Meaning |
|---|---|
| 🟢 Green | Context usage < 70% |
| 🟡 Yellow | Context usage 70%–89% |
| 🔴 Red | Context usage ≥ 90% |
| 🟢 Green (`⟳`) | Cache-hit tokens + hit rate (24%) |
| 🟡 Yellow (`💰`) | Session cost / balance-delta RMB |
| 🔵 Cyan | Model name |
| ⚪ White | Session input tokens / active model stats |
| 🌫️ Dim | Output / inactive / zero / labels (`今日`,`总`,`估`)

## Icons

| Icon | Meaning |
|---|---|
| ↑ | Input tokens |
| ↓ | Output tokens |
| ⟳ | Cache-read tokens (prompt cache hits) |
| 🗜️ | Context window compaction detected |
| 💰 | Cost (USD estimate + real RMB) |
| 💎 | DeepSeek account balance |
| 📊 | Per-model token statistics |
| ⏱️ | Session duration |
| 📁 | Project directory |
| 🌿 | Git branch |
| 💤⚡🔥🚀💥 | Effort level: low / medium / high / xhigh / max |

## FAQ

**Q: Why does Line 3 show `今日` with per-model estimates instead of real usage?**

A: You haven't configured the platform token yet. Run `bash ~/.claude/deepseek-hud/setup-token.sh` (or the PowerShell version) to set it up. Once configured, Line 3 will show real daily usage like `↑44.3M(⟳43.2M命中97%)↓226.8K`.

**Q: Line 3 stopped showing real daily usage and shows `⚠️ 登录过期` — what do I do?**

A: The platform token has expired. Run the setup script:
```bash
bash ~/.claude/deepseek-hud/setup-token.sh
```
It'll guide you through extracting a fresh token. Takes about 30 seconds.

**Q: Why is the daily input number so large (40M+) while Line 2 shows much smaller numbers?**

A: Line 3 shows **total** tokens including cache hits. With a ~97% cache hit rate, most input tokens are served from cache. Line 2 shows **session-level** non-cached tokens only. Both are correct — they measure different things.

**Q: What does `↑44.3M(⟳43.2M命中97%)` mean?**

A: Total daily input is 44.3M tokens. Of those, 43.2M were cache hits (97% cache hit rate). The remaining ~1M were non-cached (sent to the model). This data comes directly from the DeepSeek platform usage API — the same source as their web dashboard.

**Q: The balance shows `¥0.0000` — is it broken?**

A: No. Balance cost is calculated from the actual DeepSeek balance delta (initial − current). It may show 0 if the balance hasn't dropped yet, if there's API latency, or if you've been within the free tier. Wait a few API calls.

**Q: Does this work with other model providers (OpenAI, Anthropic)?**

A: No. This plugin is specifically designed for DeepSeek API users. The balance API, pricing tables, and usage API are all DeepSeek-specific. Fork the repo if you'd like to adapt it for another provider.

## License

MIT
