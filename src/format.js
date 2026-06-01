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

module.exports = {
  C,
  formatDuration,
  formatTokens,
  progressBar,
  currencySymbol,
  effortIcon,
};
