/**
 * ANSI HUD line renderers for the DeepSeek status line.
 *
 * Renders three lines:
 *   1. Identity   — model, directory, git branch, effort, duration
 *   2. Resources  — context window bar, token breakdown, RMB session cost
 *   3. Balance    — DeepSeek account balance, per-model token stats, availability
 *
 * @module render
 */

'use strict';

const path          = require('path');
const { execSync }  = require('child_process');
const fmt           = require('./format');

// ---------------------------------------------------------------------------
// Git helpers (lightweight, cached availability check)
// ---------------------------------------------------------------------------

let _gitAvailable = null;

function hasGit() {
  if (_gitAvailable !== null) return _gitAvailable;
  try {
    execSync('git --version', { stdio: 'ignore', timeout: 1500 });
    _gitAvailable = true;
  } catch (_) {
    _gitAvailable = false;
  }
  return _gitAvailable;
}

/**
 * Return the current git branch name, or an empty string.
 * @returns {string}
 */
function gitBranch() {
  if (!hasGit()) return '';
  try {
    return execSync('git branch --show-current', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 2000,
    }).trim();
  } catch (_) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Line 1 — Identity
// ---------------------------------------------------------------------------

/**
 * Render the identity line.
 *
 * Format: `[model] 📁 dir | 🌿 branch | 🔥 effort | ⏱️ duration`
 *
 * @param {object} data - Claude Code session JSON
 * @returns {string}
 */
function renderLine1(data) {
  const model    = data.model?.id || data.model?.display_name || '...';
  const dir      = path.basename(data.workspace?.current_dir || data.cwd || '');
  const duration = fmt.formatDuration(data.cost?.total_duration_ms || 0);
  const effort   = data.effort?.level || '';

  let line = `${fmt.C.cyan}${fmt.C.bold}[${model}]${fmt.C.reset} 📁 ${dir}`;

  const branch = gitBranch();
  if (branch) line += ` | 🌿 ${branch}`;

  if (effort) {
    line += ` | ${fmt.effortIcon(effort)} ${effort}`;
  }

  line += ` | ⏱️ ${duration}`;

  return line;
}

// ---------------------------------------------------------------------------
// Line 2 — Resources (with RMB cost)
// ---------------------------------------------------------------------------

/**
 * Render the resources line.
 *
 * Format: `████░░░░░░ 42% ctx | ↑15.5K ↓1.2K ⟳2.0K | 💰 本次¥0.12 200K`
 *
 * The cost is computed from the balance delta (initial - current), which
 * reflects DeepSeek's real billing in CNY — far more accurate than the
 * Anthropic-pricing-based USD estimate from Claude Code.
 *
 * @param {object} data        - Claude Code session JSON
 * @param {number} sessionCost - actual RMB cost from balance delta
 * @returns {string}
 */
function renderLine2(data, sessionCost, usdCost) {
  const ctx   = data.context_window || {};
  const pct   = Math.round(ctx.used_percentage || 0);
  const usage = ctx.current_usage || {};

  // Bar + percentage
  let line = `${fmt.progressBar(pct)} ${pct}% ctx`;

  // Token breakdown
  const input  = ctx.total_input_tokens || 0;
  const output = ctx.total_output_tokens || 0;
  const cache  = usage.cache_read_input_tokens || 0;

  if (input > 0 || output > 0) {
    line += ` | ${fmt.C.white}↑${fmt.formatTokens(input)}${fmt.C.reset}`;
    line += ` ${fmt.C.dim}↓${fmt.formatTokens(output)}${fmt.C.reset}`;
    if (cache > 0) {
      line += ` ${fmt.C.green}⟳${fmt.formatTokens(cache)}${fmt.C.reset}`;
    }
  }

  // Cost: real RMB (balance delta) + USD estimate (Claude Code)
  const usd = usdCost || 0;
  const cny = sessionCost || 0;
  // RMB first — the real cost from DeepSeek billing
  if (cny > 0) {
    line += ` | ${fmt.C.yellow}💰 本次¥${cny.toFixed(4)}${fmt.C.reset}`;
  } else {
    line += ` | ${fmt.C.dim}💰 本次¥0.0000${fmt.C.reset}`;
  }
  // USD second — Claude Code's Anthropic-pricing estimate (reference only)
  line += ` ${fmt.C.dim}$${usd.toFixed(4)}${fmt.C.reset}`;

  // Context window max size
  const maxK = Math.round((ctx.context_window_size || 200000) / 1000);
  line += ` ${fmt.C.dim}${maxK}K${fmt.C.reset}`;

  return line;
}

// ---------------------------------------------------------------------------
// Line 3 — DeepSeek Balance + available models
// ---------------------------------------------------------------------------

/**
 * Render a compact model-name label.
 * "deepseek-v4-pro" → "v4-pro", "deepseek-v4-flash" → "v4-flash"
 */
function shortModelName(full) {
  return (full || '').replace(/^deepseek-/, '');
}

/**
 * Render models with their session token counts.
 *
 * Format: `v4-pro↑150K↓25K v4-flash↑5K`
 *
 * Active model is highlighted.  Models with 0 tokens show just the name.
 * Note: Claude Code only reports the primary model ID, so flash counts
 * are typically 0 even when flash is used internally (subagents etc.).
 * The real total cost across all models is on Line 2 (balance delta).
 *
 * @param {object} modelStats   - per-model token counters from session state
 * @param {string} activeModel  - currently-active model ID
 * @returns {string}
 */
function renderModelStats(modelStats, activeModel) {
  const models = ['deepseek-v4-pro', 'deepseek-v4-flash'];

  const parts = models.map(id => {
    const v = (modelStats && modelStats[id]) || { input: 0, output: 0, cache: 0 };
    const short    = shortModelName(id);
    const isActive = id === activeModel || shortModelName(activeModel) === short;
    const total    = v.input + v.output + v.cache;

    const color = isActive ? fmt.C.white : fmt.C.dim;

    if (total > 0) {
      const items = [];
      if (v.input  > 0) items.push(`↑${fmt.formatTokens(v.input)}`);
      if (v.output > 0) items.push(`↓${fmt.formatTokens(v.output)}`);
      if (v.cache  > 0) items.push(`⟳${fmt.formatTokens(v.cache)}`);
      return `${color}${short}${items.join('')}${fmt.C.reset}`;
    }
    // Zero tokens — show name only, very dim
    return `\x1b[90m${short}\x1b[0m`;
  });

  return parts.join(' ');
}

/**
 * Render the DeepSeek balance + model usage line.
 *
 * Format: `💎 ¥5.06(充) | v4-pro↑150K↓25K v4-flash | ✅`
 *
 * @param {object|null} balance     - balance API response, or null
 * @param {boolean}     [stale]     - whether the data came from stale cache
 * @param {object}      modelStats  - per-model token counters
 * @param {string}      activeModel - currently-active model ID
 * @returns {string}
 */
function renderLine3(balance, stale, modelStats, activeModel) {
  const out = [];

  // --- Balance section ---
  if (!balance || !balance.balance_infos || balance.balance_infos.length === 0) {
    out.push(`${fmt.C.dim}💎 暂无数据${fmt.C.reset}`);
  } else {
    for (const info of balance.balance_infos) {
      const sym = fmt.currencySymbol(info.currency);
      const granted = parseFloat(info.granted_balance || '0');
      const topped  = parseFloat(info.topped_up_balance || '0');

      let text = `💎 ${sym}${info.total_balance}`;
      if (topped > 0) {
        text += `${fmt.C.dim}(充)${fmt.C.reset}`;
      }
      if (granted > 0) {
        text += `${fmt.C.dim}(赠)${fmt.C.reset}`;
      }
      out.push(text);
    }
  }

  // --- Model usage (session token counts) ---
  out.push(renderModelStats(modelStats, activeModel));

  // --- Availability badge ---
  if (balance && balance.balance_infos && balance.balance_infos.length > 0) {
    const avail = balance.is_available
      ? `${fmt.C.green}✅${fmt.C.reset}`
      : `${fmt.C.red}❌${fmt.C.reset}`;
    out.push(avail);
  }

  let line = out.join(' | ');

  if (stale) line += ` ${fmt.C.dim}(缓存)${fmt.C.reset}`;

  return line;
}

// ---------------------------------------------------------------------------

module.exports = { renderLine1, renderLine2, renderLine3 };
