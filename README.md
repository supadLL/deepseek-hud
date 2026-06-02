# 🚀 DeepSeek HUD — Real-Time Usage Monitor for Claude Code

> 💎 A real-time HUD plugin for Claude Code + DeepSeek API — monitor token usage, context window, session cost, and account balance

A beautiful real-time heads-up display (HUD) for Claude Code that puts your DeepSeek API usage right at your fingertips. Track **token consumption** 📊, **input/output/cache tokens** 🔄, **context window pressure** 🪟, **session spending in RMB** 💰, and **live account balance** 🏦 — all in a sleek 3-line terminal status bar.

### ✨ What You Can Monitor

| Metric | Description |
|---|---|
| 📊 **Token Usage** | Real-time token counts (↑ input / ↓ output / ⟳ cache hits) |
| 🪟 **Context Window** | Color-coded progress bar (🟢<70% 🟡70-89% 🔴>=90%) |
| 💰 **Session Cost** | Real RMB cost via DeepSeek balance delta, plus token-based estimate |
| 🏦 **Account Balance** | Live balance from DeepSeek API (top-up vs. grant shown separately) |
| 🔥 **Effort Level** | Current reasoning intensity (💤low ⚡medium 🔥high 🚀xhigh 💥max) |
| 🌿 **Git Branch** | Current project branch name |
| ⏱️ **Session Duration** | Elapsed time for the current session |
| 🎯 **Multi-Model Stats** | Separate tracking for `deepseek-v4-pro` and `deepseek-v4-flash` |

## Preview

Three lines rendered at the bottom of your terminal:

```
[deepseek-v4-pro] 📁 my-project | 🌿 main | 🔥 high | ⏱️ 15m 0s
███████░░░ 72% ctx | 本会话 ↑14.0K ↓2.8K ⟳4.5K(24%) | 💰 ¥0.50(估¥0.025) $0.035 200K
💎 ¥110.00(充) | 今日 ↑44.3M(⟳43.2M命中97%)↓226.8K | ✅
```

> **Legend:** `本会话` = this session | `今日` = today | `估` = estimate | `命中` = cache hit | `充` = topped up | `赠` = granted

| Line | Content | Description |
|---|---|---|
| 1 | **Session Identity** | Model name, project directory, Git branch, effort level, compaction icon, duration |
| 2 | **Session Resources** | Context window bar (green/yellow/red), session-level tokens (↑in ↓out), cache hit snapshot (⟳X(X%)), cost (balance-delta RMB + token estimate + USD), max context size |
| 3 | **Balance & Daily Totals** | DeepSeek account balance, real daily usage from platform API: total input with cache breakdown (⟳cacheHits hitRate%), daily output, availability badge |

## Features

- **Real RMB Cost** — tracks actual spending via DeepSeek balance delta (`initial − current`), plus session-level token-based cost estimate
- **Real Daily Usage** — fetches actual token consumption from `platform.deepseek.com/api/v0/usage/amount` (the same data shown in the DeepSeek web dashboard), including cache-hit/miss breakdown
- **Cache Hit Rate** — shows context-level snapshot on Line 2 (`⟳X(X%)`); shows daily cache breakdown on Line 3 (`⟳X命中Y%`)
- **Session vs Daily** — Line 2 shows **session-level** tokens (this conversation), Line 3 shows **daily-cumulative** totals from the real platform API
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
├── setup-token-auto.js     # Auto token extractor (Playwright — zero-click on Windows)
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
- **Line 3 daily totals** = real usage from the DeepSeek platform API (all sessions today, including cache hits)
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

Line 3 shows **real** daily token usage from the DeepSeek platform API. This requires a Bearer token from your browser session. There are two ways to get it:

####  Auto Mode (Windows / macOS / Linux — zero clicks)

If Playwright is installed (`npm install -g playwright`), the setup script can **fully automate** the extraction:

```bash
# All platforms
bash ~/.claude/deepseek-hud/setup-token.sh

# Windows PowerShell (add -Force to skip confirmation)
powershell -File ~/.claude/deepseek-hud/setup-token.ps1 -Force
```

**How it works — step by step:**

1. Detects your browser (Chrome / Edge / Brave / Chromium)
2. Closes all browser windows (needs access to your login profile)
3. Launches the browser with your existing profile (your saved login is preserved)
4. Opens `platform.deepseek.com/usage` and waits for the usage API request
5. Captures the Bearer token from the `Authorization` header
6. Saves it and closes the browser

**What you'll experience:**

| Step | What happens |
|---|---|
| Browser windows close | All Chrome/Edge/Brave windows disappear — **save your work first** |
| Browser opens briefly | A new browser window appears, navigates to DeepSeek, then closes |
| Terminal output | Shows progress: detecting browser → launching → waiting for API → done |

> **⚠️ Important:** The auto mode will **close all your browser windows**. Any unsaved work (form inputs, drafts) will be lost. The script warns you before doing this — use `-Force` to skip the warning if you're prepared.

**What can go wrong:**

| Problem | Cause | Solution |
|---|---|---|
| `Profile locked` error | Browser is still running | Close all browser windows manually, then re-run |
| `Playwright not found` | Playwright not installed | `npm install -g playwright` |
| `No supported browser found` | Chrome/Edge/Brave/Chromium not installed | Install one, or use manual mode |
| Token captured but Line 3 shows estimates | Not logged into DeepSeek in that browser | Log into `platform.deepseek.com` in your browser first, then re-run |
| Token works for a while then shows expiration warning | Token expired (normal, weeks later) | Re-run the setup script |

####  Manual Mode (no dependencies, all platforms)

If you don't have Playwright, or auto mode fails, use manual extraction:

```bash
# macOS / Linux
bash ~/.claude/deepseek-hud/setup-token.sh
# (automatically falls back to manual if Playwright is missing)

# Windows PowerShell
powershell -File ~/.claude/deepseek-hud/setup-token.ps1 -Manual
```

**Steps:**

1. Open https://platform.deepseek.com/usage in your browser and log in
2. Press F12 → **Network** tab
3. Click **Monthly Usage** tab on the page, then switch months or refresh (triggers the API request)
4. Find `/api/v0/usage/amount?month=...` in the Network list, click it
5. On the right, under **Request Headers**, scroll to `Authorization: Bearer ...`
6. Copy the value **after** `Bearer ` (do not include the "Bearer " prefix)
7. Paste it when the script prompts you

####  Token Storage

The token is read from (in priority order):
1. `DEEPSEEK_PLATFORM_TOKEN` environment variable
2. `~/.claude/deepseek-hud/.platform_token` file

> ⚠️ The platform token expires after **days to weeks**. When it does, Line 3 shows a warning — just re-run the setup script.

### Language

The HUD displays in **Chinese by default**. To switch to English, set the environment variable:

```bash
export DEEPSEEK_HUD_LANG=en
```

Or on Windows PowerShell:

```powershell
$env:DEEPSEEK_HUD_LANG = "en"
```

Chinese (default) | English
---|---
`本会话` | `sess`
`估` / `缓存估` | `~` / `cache~`
`今日` | `today`
`命中` | `hit`
`(充)` / `(赠)` | `+topup` / `+grant`
`总` | `total`
`暂无数据` | `no data`
`(缓存)` | `(stale)`
`⚠️ 登录过期` / `运行 setup-token 刷新` | `⚠️ token expired` / `run setup-token`

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
| 🌫️ Dim | Output / inactive / zero values / UI labels / hints

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

**Q: Why does Line 3 show per-model estimates instead of real usage?**

A: You haven't configured the platform token yet. Run `bash ~/.claude/deepseek-hud/setup-token.sh` (or the PowerShell version) to set it up. Once configured, Line 3 shows real daily usage with cache breakdown.

**Q: Line 3 shows a token expiration warning — what do I do?**

A: The platform token has expired. Run the setup script:
```bash
bash ~/.claude/deepseek-hud/setup-token.sh
```
It'll guide you through extracting a fresh token. Takes about 30 seconds.

**Q: Why is the daily input number so large (40M+) while Line 2 shows much smaller numbers?**

A: Line 3 shows **total** tokens including cache hits. With a ~97% cache hit rate, most input tokens are served from cache. Line 2 shows **session-level** non-cached tokens only. Both are correct — they measure different things.

**Q: What does the daily usage display `↑44.3M(⟳43.2M hit 97%)` mean?**

A: Total daily input is 44.3M tokens. Of those, 43.2M were cache hits (97% cache hit rate). The remaining ~1M were non-cached (sent to the model). This data comes directly from the DeepSeek platform usage API — the same source as their web dashboard.

**Q: The balance shows `¥0.0000` — is it broken?**

A: No. Balance cost is calculated from the actual DeepSeek balance delta (initial − current). It may show 0 if the balance hasn't dropped yet, if there's API latency, or if you've been within the free tier. Wait a few API calls.

**Q: Does this work with other model providers (OpenAI, Anthropic)?**

A: No. This plugin is specifically designed for DeepSeek API users. The balance API, pricing tables, and usage API are all DeepSeek-specific. Fork the repo if you'd like to adapt it for another provider.

## License

MIT
