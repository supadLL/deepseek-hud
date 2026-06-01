/**
 * DeepSeek account balance API client with file-system cache.
 *
 * Endpoint: GET https://api.deepseek.com/user/balance
 * Cache TTL: 30 seconds (status line fires frequently)
 *
 * @module balance
 */

'use strict';

const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BALANCE_URL  = 'https://api.deepseek.com/user/balance';
const CACHE_TTL_MS = 30_000;   // 30 seconds
const REQUEST_MS   = 5_000;    // HTTP timeout

// ---------------------------------------------------------------------------
// Low-level HTTP GET
// ---------------------------------------------------------------------------

/**
 * Perform an HTTPS GET request and return the parsed JSON body.
 *
 * @param {string} url       - full URL
 * @param {string} apiKey    - DeepSeek API key (Bearer token)
 * @param {number} timeoutMs - request timeout in milliseconds
 * @returns {Promise<{status: number, data: object}>}
 */
function httpGet(url, apiKey, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept':        'application/json',
        'User-Agent':     'deepseek-statusline/1.0',
      },
      timeout: timeoutMs,
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (_) {
          reject(new Error(
            `Balance API returned invalid JSON (HTTP ${res.statusCode}): ${body.slice(0, 200)}`
          ));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Balance API request timed out'));
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// File cache helpers
// ---------------------------------------------------------------------------

/**
 * Build a stable, session-scoped cache file path.
 * @param {string} sessionId
 * @returns {string}
 */
function cachePath(sessionId) {
  const safe = (sessionId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(os.tmpdir(), `claude-ds-balance-${safe}.json`);
}

/**
 * Read cached balance data if it is still fresh.
 * @param {string} sessionId
 * @returns {object|null} balance data, or null on miss / stale / error
 */
function readCache(sessionId) {
  try {
    const file = cachePath(sessionId);
    if (!fs.existsSync(file)) return null;
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - entry.ts < CACHE_TTL_MS) {
      return entry.data;
    }
  } catch (_) { /* corrupt / missing — treat as miss */ }
  return null;
}

/**
 * Write balance data to the cache file.  Best-effort — never throws.
 * @param {string} sessionId
 * @param {object} data
 */
function writeCache(sessionId, data) {
  try {
    fs.writeFileSync(
      cachePath(sessionId),
      JSON.stringify({ ts: Date.now(), data }),
      'utf8'
    );
  } catch (_) { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch DeepSeek account balance, served from cache when fresh.
 *
 * Returns the parsed balance JSON on success, or `null` on any failure
 * so callers can degrade gracefully.
 *
 * @param {string} apiKey    - DeepSeek API key
 * @param {string} sessionId - Claude Code session ID (for cache scoping)
 * @returns {Promise<object|null>}
 */
async function fetchBalance(apiKey, sessionId) {
  // 1. Serve from cache if fresh
  const cached = readCache(sessionId);
  if (cached !== null) return cached;

  // 2. Fetch from DeepSeek API
  try {
    const { status, data } = await httpGet(BALANCE_URL, apiKey, REQUEST_MS);
    if (status === 200 && data && data.balance_infos) {
      writeCache(sessionId, data);
      return data;
    }
    // Non-200 or unexpected shape — do not cache
    return null;
  } catch (_) {
    // Network error, timeout, DNS failure, etc.
    return null;
  }
}

/**
 * Read the cache file unconditionally, regardless of TTL.
 * Used as a fallback when a live fetch fails.
 *
 * @param {string} sessionId
 * @returns {{ data: object, stale: boolean } | null}
 */
function readStaleCache(sessionId) {
  try {
    const file = cachePath(sessionId);
    if (!fs.existsSync(file)) return null;
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { data: entry.data, stale: Date.now() - entry.ts >= CACHE_TTL_MS };
  } catch (_) {
    return null;
  }
}

module.exports = { fetchBalance, readStaleCache };
