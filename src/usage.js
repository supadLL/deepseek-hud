/**
 * Fetch real daily token usage from DeepSeek platform API.
 *
 * Primary source: platform.deepseek.com/api/v0/usage/amount
 *   Requires DEEPSEEK_PLATFORM_TOKEN env var (Bearer token from browser
 *   session — copy from DevTools → Network → Request Headers →
 *   Authorization).
 *
 * Fallback: intercept.js daily file (os.tmpdir()/claude-ds-usage-YYYY-MM-DD.json)
 *   Written by the https.request monkey-patch when NODE_OPTIONS is active.
 *
 * Returns the same shape regardless of source so callers don't care.
 *
 * @module usage
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let _cache      = null;
let _cacheTime  = 0;
const CACHE_TTL = 60_000;  // 1 minute — usage doesn't change that fast

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Platform API
// ---------------------------------------------------------------------------

/**
 * Fetch monthly usage from platform.deepseek.com and extract today's totals.
 *
 * The API returns per-model, per-day breakdowns.  We aggregate across all
 * models for today and return the same flat shape that the renderer expects.
 *
 * @param {string} token - Bearer token from browser session
 * @returns {Promise<object|null>}
 */
function platformUsage(token) {
  return new Promise((resolve) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();
    const todayStr = today();

    const req = https.request(
      {
        hostname: 'platform.deepseek.com',
        path: `/api/v0/usage/amount?month=${month}&year=${year}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.code !== 0) {
              resolve(null);
              return;
            }

            const biz = data.data && data.data.biz_data;
            if (!biz) {
              resolve(null);
              return;
            }

            const todayDay = (biz.days || []).find((d) => d.date === todayStr);
            if (!todayDay) {
              // Today might not be in the response yet (very early in the day
              // or timezone mismatch).  Use the latest available day as a
              // best-effort approximation.
              const latest = (biz.days || []).slice(-1)[0];
              if (!latest) { resolve(null); return; }

              let hit = 0, miss = 0, comp = 0;
              (latest.data || []).forEach((m) => {
                (m.usage || []).forEach((u) => {
                  if (u.type === 'PROMPT_CACHE_HIT_TOKEN')  hit  += parseInt(u.amount, 10) || 0;
                  if (u.type === 'PROMPT_CACHE_MISS_TOKEN') miss += parseInt(u.amount, 10) || 0;
                  if (u.type === 'RESPONSE_TOKEN')          comp += parseInt(u.amount, 10) || 0;
                });
              });

              resolve({
                date: latest.date,
                prompt_cache_hit_tokens: hit,
                prompt_cache_miss_tokens: miss,
                completion_tokens: comp,
                prompt_tokens: hit + miss,
                total_tokens: hit + miss + comp,
                source: 'platform',
              });
              return;
            }

            // Aggregate across all models for today
            let cacheHit  = 0;
            let cacheMiss = 0;
            let compTokens = 0;

            (todayDay.data || []).forEach((m) => {
              (m.usage || []).forEach((u) => {
                if (u.type === 'PROMPT_CACHE_HIT_TOKEN')  cacheHit  += parseInt(u.amount, 10) || 0;
                if (u.type === 'PROMPT_CACHE_MISS_TOKEN') cacheMiss += parseInt(u.amount, 10) || 0;
                if (u.type === 'RESPONSE_TOKEN')          compTokens += parseInt(u.amount, 10) || 0;
              });
            });

            resolve({
              date: todayStr,
              prompt_cache_hit_tokens: cacheHit,
              prompt_cache_miss_tokens: cacheMiss,
              completion_tokens: compTokens,
              prompt_tokens: cacheHit + cacheMiss,
              total_tokens: cacheHit + cacheMiss + compTokens,
              source: 'platform',
            });
          } catch (_) {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the platform Bearer token from multiple sources.
 * Priority: env var → token file → null
 *
 * @returns {string}
 */
function resolveToken() {
  // 1. Environment variable (user-set or system-wide)
  const envToken = process.env.DEEPSEEK_PLATFORM_TOKEN || '';
  if (envToken) return envToken;

  // 2. Token file (written by setup-token.ps1 / setup-token.sh)
  try {
    const tokenFile = path.join(os.homedir(), '.claude', 'deepseek-hud', '.platform_token');
    if (fs.existsSync(tokenFile)) {
      const fileToken = fs.readFileSync(tokenFile, 'utf8').trim();
      if (fileToken) return fileToken;
    }
  } catch (_) { /* ignore */ }

  return '';
}

/**
 * Fetch real daily usage.
 *
 * Tries the platform API first (Bearer token from env var or token file),
 * falls back to the intercept.js daily file.  Results are cached for 60 s.
 *
 * @returns {Promise<object|null>}
 *   { date, prompt_tokens, completion_tokens, prompt_cache_hit_tokens,
 *     prompt_cache_miss_tokens, total_tokens, source }
 *   or null if no data source is available
 */
async function fetchUsage() {
  const token = resolveToken();

  if (token) {
    const now = Date.now();
    if (_cache && (now - _cacheTime) < CACHE_TTL) {
      return _cache;
    }

    const result = await platformUsage(token);
    if (result) {
      _cache = result;
      _cacheTime = now;
      return result;
    }
  }

  // Fallback: read intercept.js daily file (synchronous, no token needed)
  return readInterceptFile();
}

// ---------------------------------------------------------------------------
// Fallback: intercept.js daily file
// ---------------------------------------------------------------------------

function usagePath(date) {
  return path.join(os.tmpdir(), `claude-ds-usage-${date}.json`);
}

function readInterceptFile(date) {
  date = date || today();
  try {
    const file = usagePath(date);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.source = 'intercept';
    return data;
  } catch (_) {
    return null;
  }
}

module.exports = { fetchUsage, today };
