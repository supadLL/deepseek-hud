/**
 * Read the daily usage file written by intercept.js.
 *
 * The file is populated by the https.request monkey-patch — it captures
 * REAL DeepSeek API usage (including cache-hit tokens) that Claude Code
 * does not expose via stdin.
 *
 * Usage file:  os.tmpdir()/claude-ds-usage-YYYY-MM-DD.json
 *
 * Returns `null` if no file exists (interceptor not loaded or no data yet),
 * so callers can fall back to Claude Code stdin estimates.
 *
 * @module usage
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function usagePath(date) {
  return path.join(os.tmpdir(), `claude-ds-usage-${date}.json`);
}

/**
 * Read the real daily usage accumulated by the intercept module.
 *
 * @param {string} [date] - YYYY-MM-DD, defaults to today
 * @returns {object|null}
 *   { date, prompt_tokens, completion_tokens, prompt_cache_hit_tokens,
 *     prompt_cache_miss_tokens, total_tokens, request_count }
 *   or null if no data
 */
function readUsage(date) {
  date = date || today();
  try {
    const file = usagePath(date);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = { readUsage, usagePath, today };
