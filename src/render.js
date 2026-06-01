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
// Line 3 — DeepSeek Balance + per-model token stats
// ---------------------------------------------------------------------------

/**
 * Render a compact model-name label.
 * "deepseek-v4-pro" → "v4-pro", "deepseek-v4-flash" → "v4-flash"
 */
function shortModelName(full) {
  return (full || '').replace(/^deepseek-/, '');
}

/**
 * Render per-model token summary.
 *
 * Format: `pro↑150K↓25K flash↑5K↓1K`
 *
 * The currently-active model is highlighted.
 *
 * @param {object} modelStats   - { "model-id": { input, output, cache } }
 * @param {string} activeModel  - ID of the currently-active model
 * @returns {string} empty string if no models have tokens
 */
function renderModelStats(modelStats, activeModel) {
  const entries = Object.entries(modelStats)
    .filter(([, v]) => (v.input + v.output + v.cache) > 0);

  if (entries.length === 0) return '';

  const parts = entries.map(([id, v]) => {
    const short  = shortModelName(id);
    const isActive = id === activeModel;
    const color  = isActive ? fmt.C.white : fmt.C.dim;
    const parts2 = [];
    if (v.input  > 0) parts2.push(`↑${fmt.formatTokens(v.input)}`);
    if (v.output > 0) parts2.push(`↓${fmt.formatTokens(v.output)}`);
    if (v.cache  > 0) parts2.push(`⟳${fmt.formatTokens(v.cache)}`);
    return `${color}${short}${parts2.join('')}${fmt.C.reset}`;
  });

  return `📊 ${parts.join(' ')}`;
}

/**
 * Render the DeepSeek balance + model stats line.
 *
 * Format: `💎 ¥5.06(充值) | 📊 pro↑150K↓25K flash↑5K↓1K | ✅`
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

  // --- Per-model token stats ---
  if (modelStats && Object.keys(modelStats).length > 0) {
    const stats = renderModelStats(modelStats, activeModel);
    if (stats) out.push(stats);
  }

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
