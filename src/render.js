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
// Line 2 — Resources (session-scoped, with RMB cost)
// ---------------------------------------------------------------------------

/**
 * Render the resources line.
 *
 * Format: `████░░░░░░ 42% ctx | 本会话 ↑14.0K ↓2.8K ⟳4.5K | 💰 ¥0.30(估¥0.025) $0.01 200K`
 *
 * Token breakdown shows SESSION-LEVEL cumulative tokens (daily delta from
 * session start).  Cache tokens (⟳) are from current_usage — a point-in-time
 * context snapshot, not a cumulative value.
 *
 * The daily cache-hit RATE lives on Line 3 (per-model stats), because the
 * rate is computed from daily-cumulative model counters, not from the
 * context snapshot.
 *
 * @param {object} data          - Claude Code session JSON
 * @param {number} sessionCost   - actual RMB cost from balance delta (account-wide)
 * @param {number} usdCost       - USD estimate from Claude Code
 * @param {number} estimatedCost - RMB estimate from session tokens × DeepSeek pricing
 * @param {object} sessionTokens - {input, output} session-level cumulative tokens
 * @returns {string}
 */
function renderLine2(data, sessionCost, usdCost, estimatedCost, sessionTokens) {
  const ctx   = data.context_window || {};
  const pct   = Math.round(ctx.used_percentage || 0);

  // Bar + percentage
  let line = `${fmt.progressBar(pct)} ${pct}% ctx`;

  // Token breakdown — session-level cumulative (daily delta from session start)
  const input  = (sessionTokens && sessionTokens.input)  || 0;
  const output = (sessionTokens && sessionTokens.output) || 0;

  // Cache value comes from current_usage (point-in-time context snapshot),
  // NOT from sessionTokens, because cache_read_input_tokens is not a daily
  // cumulative field — it only reflects the current context window.
  const usage = ctx.current_usage || {};
  const cache = usage.cache_read_input_tokens || 0;

  if (input > 0 || output > 0 || cache > 0) {
    line += ` | ${fmt.C.dim}本会话${fmt.C.reset} ${fmt.C.white}↑${fmt.formatTokens(input)}${fmt.C.reset}`;
    line += ` ${fmt.C.dim}↓${fmt.formatTokens(output)}${fmt.C.reset}`;
    if (cache > 0) {
      line += ` ${fmt.C.green}⟳${fmt.formatTokens(cache)}${fmt.C.reset}`;
    }
  } else {
    line += ` | ${fmt.C.dim}本会话 —${fmt.C.reset}`;
  }

  // Cost: balance-delta RMB (real) + token estimate + USD reference
  const usd = usdCost || 0;
  const cny = sessionCost || 0;
  const est = estimatedCost || 0;

  if (cny > 0 || est > 0) {
    line += ` | ${fmt.C.yellow}💰`;
    line += ` ¥${cny.toFixed(4)}`;
    if (est > 0) {
      line += `${fmt.C.dim}(估¥${est.toFixed(4)})${fmt.C.reset}`;
    }
    line += ` ${fmt.C.dim}$${usd.toFixed(4)}${fmt.C.reset}`;
  } else {
    line += ` | ${fmt.C.dim}💰 ¥0.0000 $0.0000${fmt.C.reset}`;
  }

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
 * Render models with their daily-cumulative token counts.
 *
 * Format: `v4-pro↑150K↓25K v4-flash↑5K`
 *
 * Active model is highlighted.  Models with 0 tokens show just the name
 * in dim grey.  Cache tokens are intentionally omitted — the data source
 * (current_usage.cache_read_input_tokens) is a context snapshot, not a
 * daily-cumulative field, so the daily cache rate would be misleading.
 *
 * These are DAILY-CUMULATIVE totals (per the session state), not
 * session-level numbers.  The caller should prefix with "今日" for clarity.
 *
 * @param {object} modelStats   - per-model token counters from session state
 * @param {string} activeModel  - currently-active model ID
 * @returns {string}
 */
function renderModelStats(modelStats, activeModel) {
  const modelIds = Object.keys(modelStats).length > 0
    ? Object.keys(modelStats).sort()
    : ['deepseek-v4-pro', 'deepseek-v4-flash'];

  const parts = modelIds.map(id => {
    const v = (modelStats && modelStats[id]) || { input: 0, output: 0, cache: 0 };
    const short    = shortModelName(id);
    const isActive = id === activeModel || shortModelName(activeModel) === short;
    const total    = v.input + v.output + v.cache;

    const color = isActive ? fmt.C.white : fmt.C.dim;

    if (total > 0) {
      const items = [];
      if (v.input  > 0) items.push(`↑${fmt.formatTokens(v.input)}`);
      if (v.output > 0) items.push(`↓${fmt.formatTokens(v.output)}`);
      // Note: we intentionally do NOT show a daily cache-hit rate here.
      // cache_read_input_tokens is a context-snapshot (not cumulative),
      // so model.cache undercounts daily cache by orders of magnitude.
      // The accurate daily cache rate is only available on DeepSeek's backend.
      return `${color}${short}${items.join('')}${fmt.C.reset}`;
    }
    // Zero tokens — show name only, very dim
    return `${fmt.C.dim}${short}${fmt.C.reset}`;
  });

  return parts.join(' ');
}

/**
 * Render the DeepSeek balance + daily model usage line.
 *
 * Format: `💎 ¥5.06(充) | 今日 v4-pro↑150K↓25K v4-flash↑5K | ✅`
 *
 * The model stats are DAILY-CUMULATIVE totals (accumulated across all
 * sessions today).  Session-level cost is on Line 2.
 *
 * @param {object|null} balance     - balance API response, or null
 * @param {boolean}     [stale]     - whether the data came from stale cache
 * @param {object}      modelStats  - per-model token counters (daily cumulative)
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

  // --- Model usage (daily cumulative token counts) ---
  const stats = renderModelStats(modelStats, activeModel);
  if (stats) {
    out.push(`${fmt.C.dim}今日${fmt.C.reset} ${stats}`);
  }

  // --- Daily total across all models ---
  if (modelStats && Object.keys(modelStats).length > 0) {
    let totalIn = 0, totalOut = 0;
    for (const v of Object.values(modelStats)) {
      totalIn  += v.input  || 0;
      totalOut += v.output || 0;
      // cache is included in input (cache-hit means input was free), so we
      // don't add it separately — total real cost = input + output
    }
    if (totalIn > 0 || totalOut > 0) {
      out.push(`${fmt.C.dim}总↑${fmt.formatTokens(totalIn)}↓${fmt.formatTokens(totalOut)}${fmt.C.reset}`);
    }
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
