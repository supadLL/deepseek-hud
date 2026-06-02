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
💎 ¥110.00(充) | 今日 v4-pro↑150K↓25K v4-flash↑5K | 总↑180K↓30K | ✅
```

| Line | Content | Description |
|---|---|---|
| 1 | **Session Identity** | Model name, project directory, Git branch, effort level, duration |
| 2 | **Session Resources** | Context window bar (green/yellow/red), `本会话` label + **session-level** tokens (↑in ↓out), cache hit rate (⟳X(X%)), cost (balance-delta RMB + token estimate + USD) |
| 3 | **Balance & Daily Totals** | DeepSeek balance, `今日` label + **daily-cumulative** per-model tokens, `总` daily sum, availability |

## Features

- **Real RMB Cost** — tracks actual spending via DeepSeek balance delta (`initial − current`), plus session-level token-based cost estimate (`估¥X.XXXX`)
- **Cache Hit Rate** — shows `⟳4.5K(24%)` — cache tokens and the percentage of context input served from cache
- **Session vs Daily** — Line 2 shows **session-level** tokens (this conversation), Line 3 shows **daily-cumulative** totals with `今日` label and `总` sum
- **Multi-Model Tracking** — displays cumulative token counts for each model (`deepseek-v4-pro` / `deepseek-v4-flash`), highlighting the active one
- **Dual Currency** — shows both Claude Code's USD estimate and the real CNY balance-delta cost
- **30s Balance Cache** — avoids rate-limiting the DeepSeek API
- **Session Persistence** — token counters survive `/compact` and model switches
- **Top-Up Detection** — resets cost baseline if balance increases (e.g. after topping up)
- **Graceful Degradation** — renders session lines even when the balance API is unreachable

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
│   └── format.js           # Formatters: duration, tokens, currency, ANSI codes
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
| Per-model token counters | Session state file in `os.tmpdir()` |
| Cache hit rate | `current_usage.cache_read_input_tokens` / `current_usage.input_tokens` |

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
| 💰 | Cost (USD estimate + real RMB) |
| 💎 | DeepSeek account balance |
| 📊 | Per-model token statistics |
| ⏱️ | Session duration |
| 📁 | Project directory |
| 🌿 | Git branch |
| 💤⚡🔥🚀💥 | Effort level: low / medium / high / xhigh / max |

## License

MIT
