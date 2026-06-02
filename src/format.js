/**
 * Formatting utilities for the DeepSeek status line HUD.
 *
 * @module format
 */

'use strict';

// ---------------------------------------------------------------------------
// ANSI style constants
// ---------------------------------------------------------------------------

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
};

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/**
 * Format milliseconds to a compact human-readable duration string.
 * @param {number} ms
 * @returns {string} e.g. "5m 30s", "2h 3m 15s", "45s"
 */
function formatDuration(ms) {
  if (!ms || ms <= 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Token counts
// ---------------------------------------------------------------------------

/**
 * Format a token count to a compact human-readable string.
 * @param {number|null|undefined} n
 * @returns {string} e.g. "15.5K", "1.2M", "0"
 */
function formatTokens(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

/**
 * Build a colored progress bar.
 *
 * Color thresholds:
 *   < 70%  → green
 *   70-89% → yellow
 *   ≥ 90%  → red
 *
 * @param {number} pct   - percentage 0–100
 * @param {number} width - bar width in characters (default 10)
 * @returns {string} ANSI-colored bar string
 */
function progressBar(pct, width) {
  width = width || 10;
  const p = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round(p / 100 * width);
  const empty = width - filled;

  let color = C.green;
  if (p >= 90)      color = C.red;
  else if (p >= 70) color = C.yellow;

  return `${color}${'█'.repeat(filled)}${C.dim}${'░'.repeat(empty)}${C.reset}`;
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/**
 * Map a currency code to its symbol.
 * @param {string} code - e.g. "CNY", "USD", "EUR"
 * @returns {string}
 */
function currencySymbol(code) {
  const map = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
  return map[code] || code;
}

// ---------------------------------------------------------------------------
// Token cost estimation (DeepSeek v4 pricing, approximate RMB)
// ---------------------------------------------------------------------------

/**
 * Pricing table (CNY per 1M tokens).  Approximate — not official.
 * Source: https://api-docs.deepseek.com/quick_start/pricing
 */
const PRICING = {
  'deepseek-v4-pro':   { input: 1.0, output: 4.0, cache: 0.1  },
  'deepseek-v4-flash': { input: 0.5, output: 2.0, cache: 0.05 },
  // fallback for unknown / future models
  '_default':          { input: 1.0, output: 4.0, cache: 0.1  },
};

/**
 * Estimate session cost in CNY from token counts and model pricing.
 *
 * `totalInput` includes BOTH cached and non-cached input tokens.
 * We split them using `cacheTokens` (estimated from current cache ratio)
 * so each portion is priced at the correct rate.
 *
 * Cache-hit input is ~90% cheaper than regular input, but NOT free.
 *
 * @param {string} modelId     - e.g. "deepseek-v4-pro"
 * @param {number} totalInput  - total session input tokens (cached + non-cached)
 * @param {number} outputTokens
 * @param {number} cacheTokens - estimated cache-hit tokens (subset of totalInput)
 * @returns {number} estimated RMB
 */
function estimateCost(modelId, totalInput, outputTokens, cacheTokens) {
  const price = PRICING[modelId] || PRICING._default;
  const cached     = Math.min(cacheTokens || 0, totalInput);
  const nonCached  = totalInput - cached;
  const inputCost  = (nonCached   / 1_000_000) * price.input;
  const outputCost = (outputTokens / 1_000_000) * price.output;
  const cacheCost  = (cached       / 1_000_000) * price.cache;
  return inputCost + outputCost + cacheCost;
}

// ---------------------------------------------------------------------------
// Effort level
// ---------------------------------------------------------------------------

/**
 * Map a Claude Code effort level to an emoji icon.
 * @param {string} level - "low" | "medium" | "high" | "xhigh" | "max"
 * @returns {string}
 */
function effortIcon(level) {
  const map = { low: '💤', medium: '⚡', high: '🔥', xhigh: '🚀', max: '💥' };
  return map[level] || '';
}

// ---------------------------------------------------------------------------
// i18n — switch language via DEEPSEEK_HUD_LANG env var
//   DEEPSEEK_HUD_LANG=en  → English
//   DEEPSEEK_HUD_LANG=zh  → Chinese (default)
//   unset / empty         → Chinese (default)
// ---------------------------------------------------------------------------

const LOCALE = (process.env.DEEPSEEK_HUD_LANG || 'zh').toLowerCase();

/**
 * Translation table.  Key names describe where the string appears.
 */
const MSGS = {
  // --- Line 2 ---
  sessionLabel:   { zh: '本会话',       en: 'sess' },
  estimatedLabel: { zh: '估',           en: '~'    },

  // --- Line 3 ---
  todayLabel:     { zh: '今日',         en: 'today' },
  topUpLabel:     { zh: '(充)',         en: '+topup' },
  grantLabel:     { zh: '(赠)',         en: '+grant' },
  cacheHitLabel:  { zh: '命中',         en: 'hit'  },
  cacheEstLabel:  { zh: '缓存估',       en: 'cache~' },
  totalLabel:     { zh: '总',           en: 'total' },
  staleCacheLabel:{ zh: '(缓存)',       en: '(stale)' },
  noDataLabel:    { zh: '暂无数据',     en: 'no data' },

  // --- Platform session expired (NOT the API key) ---
  tokenExpired:   { zh: '⚠️ 用量凭证过期',  en: '⚠️ platform login expired' },
  tokenHint:      { zh: '运行 setup-token 刷新', en: 'run setup-token to refresh' },
};

/**
 * Translate a message key to the current locale.
 * Falls back to Chinese if the key or locale is missing.
 *
 * @param {string} key
 * @returns {string}
 */
function t(key) {
  const entry = MSGS[key];
  if (!entry) return key;            // unknown key — return as-is
  return entry[LOCALE] || entry.zh;  // fallback to zh
}

// ---------------------------------------------------------------------------

module.exports = {
  C,
  formatDuration,
  formatTokens,
  progressBar,
  currencySymbol,
  estimateCost,
  effortIcon,
  t,
};
