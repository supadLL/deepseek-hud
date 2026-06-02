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
 * Format: `[model] 📁 dir | 🌿 branch | 🔥 effort | 🗜️ | ⏱️ duration`
 *
 * @param {object} data     - Claude Code session JSON
 * @param {boolean} [compacted] - true if context was just compacted
 * @returns {string}
 */
function renderLine1(data, compacted) {
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

  // Compaction indicator (flashes once after a detected compaction)
  if (compacted) {
    line += ` | ${fmt.C.green}🗜️${fmt.C.reset}`;
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
 * Format: `████░░░░░░ 42% ctx | 本会话 ↑14.0K ↓2.8K ⟳4.5K(24%) | 💰 ¥0.30(估¥0.025) $0.01 200K`
 *
 * Token breakdown shows SESSION-LEVEL cumulative tokens (daily delta from
 * session start).  Cache tokens (⟳) and hit rate (24%) are from
 * current_usage — a point-in-time context snapshot.  The rate tells you
 * what share of the CURRENT context's input was served from cache;
 * it does NOT represent the daily cumulative cache rate (which requires
 * DeepSeek backend data).
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

  // Resolve real context window size — Claude Code often reports Anthropic
  // defaults for third-party models.  Used for both the bar percentage and
  // the max-size label.
  const modelId = (data.model && data.model.id) || '';
  const MODEL_CTX = {
    'deepseek-v4-pro':   1_000_000,
    'deepseek-v4-flash': 1_000_000,
  };
  const ctxSize = MODEL_CTX[modelId]
    || ctx.context_window_size
    || 200000;

  // Scale Claude Code's percentage to the real context window.
  // Claude Code computes used_percentage against its internal window
  // size (often 200K for third-party models).  We rescale it to the
  // actual model context size (1M for v4) while keeping CC's internal
  // token counting (system prompt, tools, cache, etc.).
  const claudePct    = ctx.used_percentage || 0;
  const claudeCtxSize = ctx.context_window_size || 200000;
  let pct = claudeCtxSize > 0
    ? Math.round(claudePct * claudeCtxSize / ctxSize)
    : claudePct;
  // Floor at 1% when there IS context usage so we never show 0%
  // after /compact (small summary < 5K tokens = sub-1% on 1M).
  if (pct === 0 && claudePct > 0) pct = 1;
  const usage   = ctx.current_usage || {};
  const ctxInput = usage.input_tokens || 0;

  // Bar + percentage
  let line = `${fmt.progressBar(pct)} ${pct}% ctx`;

  // Token breakdown — session-level cumulative (daily delta from session start)
  const input  = (sessionTokens && sessionTokens.input)  || 0;
  const output = (sessionTokens && sessionTokens.output) || 0;

  // Cache value comes from current_usage (point-in-time context snapshot),
  // NOT from sessionTokens, because cache_read_input_tokens is not a daily
  // cumulative field — it only reflects the current context window.
  const cache = usage.cache_read_input_tokens || 0;

  if (input > 0 || output > 0 || cache > 0) {
    line += ` | ${fmt.C.dim}${fmt.t('sessionLabel')}${fmt.C.reset} ${fmt.C.white}↑${fmt.formatTokens(input)}${fmt.C.reset}`;
    line += ` ${fmt.C.dim}↓${fmt.formatTokens(output)}${fmt.C.reset}`;
    if (cache > 0) {
      // Context-level cache-hit rate: what share of the CURRENT context's
      // input was served from cache?  This is a point-in-time snapshot —
      // it does NOT represent the daily cumulative cache rate.
      const denom = ctxInput + cache;
      const rate  = denom > 0 ? Math.round(cache / denom * 100) : 0;
      line += ` ${fmt.C.green}⟳${fmt.formatTokens(cache)}${fmt.C.dim}(${rate}%)${fmt.C.reset}`;
    } else if (ctxInput > 0) {
      line += ` ${fmt.C.dim}⟳0(0%)${fmt.C.reset}`;
    }
  } else {
    line += ` | ${fmt.C.dim}${fmt.t('sessionLabel')} —${fmt.C.reset}`;
  }

  // Cost: balance-delta RMB (real) + token estimate + USD reference
  const usd = usdCost || 0;
  const cny = sessionCost || 0;
  const est = estimatedCost || 0;

  if (cny > 0 || est > 0) {
    line += ` | ${fmt.C.yellow}💰`;
    line += ` ¥${cny.toFixed(4)}`;
    if (est > 0) {
      line += `${fmt.C.dim}${fmt.t('estimatedLabel')}¥${est.toFixed(4)}${fmt.C.reset}`;
    }
    line += ` ${fmt.C.dim}$${usd.toFixed(4)}${fmt.C.reset}`;
  } else {
    line += ` | ${fmt.C.dim}💰 ¥0.0000 $0.0000${fmt.C.reset}`;
  }

  // Context window max size (model-aware — see top of function)
  line += ` ${fmt.C.dim}${fmt.formatTokens(ctxSize)}${fmt.C.reset}`;

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
 * in dim grey.
 *
 * These are DAILY-CUMULATIVE totals (per the session state), not
 * session-level numbers.  The caller should prefix with "今日" for clarity.
 *
 * If `cacheRatio` is provided (> 0), an estimated daily cache-hit rate
 * is appended to the active model.  The estimate uses the current context
 * snapshot ratio because Claude Code does not expose daily-cumulative
 * cache data.
 *
 * @param {object} modelStats   - per-model token counters from session state
 * @param {string} activeModel  - currently-active model ID
 * @param {number} [cacheRatio] - estimated cache-hit ratio (0-1) from context
 * @returns {string}
 */
function renderModelStats(modelStats, activeModel, cacheRatio) {
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
      // Estimated daily cache rate (from current context snapshot)
      if (cacheRatio > 0 && isActive) {
        const pct = Math.round(cacheRatio * 100);
        items.push(`${fmt.C.dim}${fmt.t('cacheEstLabel')}${pct}%${fmt.C.reset}`);
      }
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
 * When `realUsage` is available (intercept.js loaded):
 *   `💎 ¥5.06(充) | 今日 ↑11.4M↓79.5K缓存98% | ✅`
 *
 * When only `modelStats` from Claude Code is available:
 *   `💎 ¥5.06(充) | 今日 v4-pro↑150K↓25K缓存估24% | 总↑150K↓25K | ✅`
 *
 * @param {object|null} balance     - balance API response, or null
 * @param {boolean}     [stale]     - whether the data came from stale cache
 * @param {object}      modelStats  - per-model token counters (Claude Code data)
 * @param {string}      activeModel - currently-active model ID
 * @param {number}      [cacheRatio] - estimated cache-hit ratio (0-1) from context
 * @param {object|null} [realUsage] - REAL daily usage from intercept.js, or null
 * @returns {string}
 */
function renderLine3(balance, stale, modelStats, activeModel, cacheRatio, realUsage) {
  const out = [];

  // --- Balance section ---
  if (!balance || !balance.balance_infos || balance.balance_infos.length === 0) {
    out.push(`${fmt.C.dim}💎 ${fmt.t('noDataLabel')}${fmt.C.reset}`);
  } else {
    for (const info of balance.balance_infos) {
      const sym = fmt.currencySymbol(info.currency);
      const granted = parseFloat(info.granted_balance || '0');
      const topped  = parseFloat(info.topped_up_balance || '0');

      let text = `💎 ${sym}${info.total_balance}`;
      if (topped > 0) {
        text += `${fmt.C.dim}${fmt.t('topUpLabel')}${fmt.C.reset}`;
      }
      if (granted > 0) {
        text += `${fmt.C.dim}${fmt.t('grantLabel')}${fmt.C.reset}`;
      }
      out.push(text);
    }
  }

  if (realUsage) {
    // --- Token expired warning ---
    // When a platform token IS configured but the API call failed,
    // the token has likely expired.  Show a prominent hint so the
    // user knows to run setup-token.ps1 / setup-token.sh.
    if (realUsage.tokenExpired) {
      out.push(
        `${fmt.C.yellow}${fmt.t('tokenExpired')}${fmt.C.reset} ` +
        `${fmt.C.dim}${fmt.t('tokenHint')}${fmt.C.reset}`
      );
    } else if (realUsage.prompt_tokens > 0 || realUsage.completion_tokens > 0) {
      // --- REAL daily usage (from platform API or intercept.js) ---
      const totalPrompt = realUsage.prompt_cache_hit_tokens + realUsage.prompt_cache_miss_tokens;
      const cacheHit  = realUsage.prompt_cache_hit_tokens || 0;
      const cacheMiss = realUsage.prompt_cache_miss_tokens || 0;
      const pct = totalPrompt > 0
        ? Math.round(cacheHit / totalPrompt * 100) : 0;
      const pctStr = totalPrompt > 0 ? `${pct}%` : '--';

      // Show cache-hit as a dim parenthetical so the user sees where the
      // big number comes from (98%+ cache rate → most input is cached).
      let inputPart;
      if (cacheHit > 0) {
        inputPart =
          `${fmt.C.white}↑${fmt.formatTokens(totalPrompt)}` +
          `${fmt.C.dim}(⟳${fmt.formatTokens(cacheHit)}${fmt.t('cacheHitLabel')}${pctStr})${fmt.C.reset}`;
      } else {
        inputPart = `${fmt.C.white}↑${fmt.formatTokens(totalPrompt)}${fmt.C.reset}`;
      }

      out.push(
        `${fmt.C.dim}${fmt.t('todayLabel')}${fmt.C.reset} ` +
        inputPart +
        `${fmt.C.dim}↓${fmt.formatTokens(realUsage.completion_tokens)}${fmt.C.reset}`
      );
    }
  } else {
    // --- Estimated daily usage (Claude Code stdin, no cache data) ---
    const stats = renderModelStats(modelStats, activeModel, cacheRatio);
    if (stats) {
      out.push(`${fmt.C.dim}${fmt.t('todayLabel')}${fmt.C.reset} ${stats}`);
    }

    // Daily total from model stats
    if (modelStats && Object.keys(modelStats).length > 0) {
      let totalIn = 0, totalOut = 0;
      for (const v of Object.values(modelStats)) {
        totalIn  += v.input  || 0;
        totalOut += v.output || 0;
      }
      if (totalIn > 0 || totalOut > 0) {
        out.push(`${fmt.C.dim}${fmt.t('totalLabel')}↑${fmt.formatTokens(totalIn)}↓${fmt.formatTokens(totalOut)}${fmt.C.reset}`);
      }
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

  if (stale) line += ` ${fmt.C.dim}${fmt.t('staleCacheLabel')}${fmt.C.reset}`;

  return line;
}

// ---------------------------------------------------------------------------

module.exports = { renderLine1, renderLine2, renderLine3 };
