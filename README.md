# DeepSeek Status Line for Claude Code

A real-time HUD status line plugin for Claude Code that displays **DeepSeek API usage**, **account balance**, and **per-model token tracking** — all in RMB (CNY) with actual billing accuracy.

## Preview

Three lines rendered at the bottom of your terminal:

```
[deepseek-v4-pro] 📁 my-project | 🌿 main | 🔥 high | ⏱️ 5m 30s
████░░░░░░ 42% ctx | ↑15.5K ↓1.2K ⟳2.0K | 💰 本次¥0.30 $0.0123 200K
💎 ¥110.00(充) | v4-pro↑150K↓25K v4-flash↑5K | ✅
```

| Line | Content | Description |
|---|---|---|
| 1 | **Session Identity** | Model name, project directory, Git branch, effort level, duration |
| 2 | **Resource Usage** | Context window bar (green/yellow/red), token breakdown (↑in ↓out ⟳cache), RMB cost from balance delta + USD estimate |
| 3 | **Balance & Models** | DeepSeek balance, per-model token counts (active highlighted, unused dimmed), availability |

## Features

- **Real RMB Cost** — tracks actual spending via DeepSeek balance delta (`initial − current`), not Claude Code's Anthropic-pricing estimate
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

### Data Sources

| Data | Source |
|---|---|
| Session tokens, cost, duration | Claude Code session JSON via stdin |
| DeepSeek account balance | `GET https://api.deepseek.com/user/balance` (cached 30s) |
| Per-model token counters | Session state file in `os.tmpdir()` |

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
| 🟢 Green (`⟳`) | Cache-hit tokens (cheap!) |
| 🟡 Yellow (`💰`) | Session cost |
| 🔵 Cyan | Model name |
| ⚪ White | Active model stats |
| 🌫️ Dim | Inactive model stats / zero values |

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
