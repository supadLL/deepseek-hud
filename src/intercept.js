/**
 * DeepSeek API usage interceptor.
 *
 * Monkey-patches `https.request` to capture `usage` fields from DeepSeek
 * API responses.  Accumulated daily totals are written to a JSON file so
 * the status-line renderer can display REAL token counts (including cache
 * hits) instead of estimates.
 *
 * ## Setup (handled by installer)
 *
 * This module is loaded via Node.js `--require`:
 *
 *   NODE_OPTIONS="--require /path/to/src/intercept.js" claude
 *
 * It runs INSIDE Claude Code's process and intercepts all HTTPS traffic
 * transparently — no proxy, no certificates, no port conflicts.
 *
 * ## Usage file
 *
 *   os.tmpdir()/claude-ds-usage-YYYY-MM-DD.json
 *
 * Format:
 *   {
 *     "date": "2026-06-02",
 *     "prompt_tokens": 115238,
 *     "completion_tokens": 79542,
 *     "prompt_cache_hit_tokens": 11161344,
 *     "prompt_cache_miss_tokens": 115238,
 *     "total_tokens": 11356124,
 *     "request_count": 156
 *   }
 *
 * @module intercept
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEEPSEEK_HOST = 'api.deepseek.com';
const WRITE_DEBOUNCE_MS = 5000;  // batch writes — not every request

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}

function usagePath(date) {
  return path.join(os.tmpdir(), `claude-ds-usage-${date}.json`);
}

function loadUsage(date) {
  try {
    const file = usagePath(date);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (_) { /* ignore */ }
  return {
    date,
    prompt_tokens: 0,
    completion_tokens: 0,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 0,
    total_tokens: 0,
    request_count: 0,
  };
}

function saveUsage(usage) {
  try {
    const tmp = usagePath(usage.date) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(usage), 'utf8');
    fs.renameSync(tmp, usagePath(usage.date));
  } catch (_) { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Debounced writer
// ---------------------------------------------------------------------------

let pending = null;
let writeTimer = null;

function scheduleWrite(usage) {
  pending = usage;
  if (writeTimer) return;  // already scheduled
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (pending) saveUsage(pending);
    pending = null;
  }, WRITE_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Accumulate usage from a response body
// ---------------------------------------------------------------------------

/**
 * Try to extract a `usage` object from a parsed JSON chunk.
 * Returns the usage object, or null if this chunk doesn't contain one.
 */
function extractUsage(chunk) {
  if (!chunk || typeof chunk !== 'object') return null;
  const u = chunk.usage;
  if (!u || typeof u.total_tokens !== 'number') return null;
  return u;
}

/**
 * Accumulate a single usage object into the daily totals.
 */
function addUsage(date, u) {
  // Resolve cache-hit tokens from whichever field the API uses.
  // DeepSeek may use prompt_cache_hit_tokens, or cached_tokens inside
  // prompt_tokens_details, or may not report cache hits at all.
  const details = u.prompt_tokens_details || {};
  const cacheHit  = u.prompt_cache_hit_tokens
    || details.cached_tokens
    || details.cache_read_input_tokens
    || 0;
  const cacheMiss = u.prompt_cache_miss_tokens
    || details.prompt_tokens  // non-cached portion
    || 0;

  // If the API doesn't report cache-miss separately, estimate it:
  //   cache-miss = total prompt − cache-hit
  const promptTotal = u.prompt_tokens || 0;
  const effectiveCacheMiss = cacheMiss > 0
    ? cacheMiss
    : Math.max(0, promptTotal - cacheHit);

  const usage = loadUsage(date);

  usage.prompt_tokens            += promptTotal;
  usage.completion_tokens        += u.completion_tokens || 0;
  usage.prompt_cache_hit_tokens  += cacheHit;
  usage.prompt_cache_miss_tokens += effectiveCacheMiss;
  usage.total_tokens             += u.total_tokens      || 0;
  usage.request_count            += 1;

  scheduleWrite(usage);
}

/**
 * Accumulate usage from a response body.
 *
 * Handles two formats:
 *   1. Plain JSON (non-streaming) — parse the whole body as one JSON object.
 *   2. SSE stream (streaming)      — body contains `data: {...}` lines;
 *      `usage` is only present on the LAST chunk before `[DONE]`.
 *      We parse each SSE data line and use the last one that carries usage.
 */
function accumulate(date, body) {
  // Debug: log what we received
  const preview = (body || '').substring(0, 200).replace(/\n/g, '\\n');
  try {
    fs.appendFileSync(
      path.join(os.tmpdir(), 'claude-ds-debug-accumulate.txt'),
      `${new Date().toISOString()} len=${body.length} preview=${preview}\n`,
      'utf8'
    );
  } catch (_) {}

  // --- Try plain JSON first (non-streaming responses) ---
  try {
    const data = JSON.parse(body);
    const u = extractUsage(data);
    if (u) {
      addUsage(date, u);
      return;
    }
    // Valid JSON but no usage — might still have SSE-style data embedded;
    // fall through to SSE parser below.
  } catch (_) {
    // Not valid JSON — probably an SSE stream; parse it as SSE below.
  }

  // --- SSE stream parser ---
  // SSE format:
  //   data: {"id":"...","usage":{...}}\n\n
  //   data: [DONE]\n\n
  //
  // `usage` only appears on the last content chunk (before [DONE]).
  // We scan ALL data lines and accumulate the LAST usage-bearing chunk.
  // (There should only be one per stream, but we're defensive.)
  const lines = body.split(/\r?\n/);
  let lastUsage = null;

  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();  // strip 'data:' prefix
    if (!payload || payload === '[DONE]') continue;

    try {
      const chunk = JSON.parse(payload);
      const u = extractUsage(chunk);
      if (u) lastUsage = u;
    } catch (_) {
      // Malformed SSE line — skip
    }
  }

  if (lastUsage) {
    addUsage(date, lastUsage);
  }
}

// ---------------------------------------------------------------------------
// Monkey-patch https.request
// ---------------------------------------------------------------------------

const _originalRequest = https.request;

function patchedRequest(opts, ...args) {
  // Normalize: opts can be a string URL or an options object
  const hostname = (typeof opts === 'string')
    ? (() => { try { return new URL(opts).hostname; } catch (_) { return ''; } })()
    : (opts.hostname || opts.host || '');

  // Debug: log ALL hosts seen by https.request
  debugHost('https', hostname, typeof opts === 'string' ? opts : '');

  const isDeepSeek = hostname === DEEPSEEK_HOST;

  // Always call through to the original — we intercept via the response
  // event on the returned ClientRequest.  This catches BOTH the callback
  // pattern AND the req.on('response', ...) pattern that Claude Code uses
  // for streaming SSE responses.
  const req = _originalRequest.call(https, opts, ...args);

  if (isDeepSeek) {
    const date = today();

    // Attach a response listener.  Node.js supports multiple listeners
    // for the same event — Claude Code's listener(s) AND ours all fire.
    // Each listener receives the SAME IncomingMessage, and each can
    // independently attach data/end listeners to collect chunks.
    req.on('response', function (res) {
      const chunks = [];

      res.on('data', function (chunk) {
        chunks.push(chunk);
      });

      res.on('end', function () {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          accumulate(date, body);
        } catch (_) { /* never throw from interceptor */ }
      });
    });
  }

  return req;
}

// Copy prototype
patchedRequest.__proto__ = _originalRequest.__proto__;

// Apply the patch
https.request = patchedRequest;

// ---------------------------------------------------------------------------
// Guard: don't double-patch if --require is loaded multiple times
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Diagnostic marker: write a tiny file when this module loads.
// ---------------------------------------------------------------------------
try {
  fs.writeFileSync(
    path.join(os.tmpdir(), 'claude-ds-intercept-loaded.txt'),
    `intercept.js loaded at ${new Date().toISOString()}\npid=${process.pid}\n` +
    `node=${process.version}\n`,
    'utf8'
  );
} catch (_) { /* best-effort */ }

// ---------------------------------------------------------------------------
// Debug: log ALL intercepted hostnames to a file so we can see what
// Claude Code is actually connecting to.
// ---------------------------------------------------------------------------
const DEBUG_LOG = path.join(os.tmpdir(), 'claude-ds-debug-hosts.txt');
function debugHost(tag, hostname, url) {
  try {
    const line = `${new Date().toISOString()} [${tag}] host=${hostname || '-'} url=${url || '-'}\n`;
    fs.appendFileSync(DEBUG_LOG, line, 'utf8');
  } catch (_) { /* best-effort */ }
}

// ---------------------------------------------------------------------------

// Monkey-patch global fetch (Node.js 18+ built-in, uses undici — bypasses
// https.request entirely).  This is the primary HTTP client for modern
// Node.js apps including Claude Code and the Anthropic SDK.
const _originalFetch = globalThis.fetch;

async function patchedFetch(input, init) {
  // Resolve URL
  let url;
  try {
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof Request) {
      url = input.url;
    } else if (input && input.url) {
      url = input.url;
    } else if (input && input.href) {
      url = input.href;
    } else {
      url = String(input);
    }
  } catch (_) {
    url = '';
  }

  const isDeepSeek = url.includes(DEEPSEEK_HOST);

  // Debug: log ALL hosts seen by fetch
  debugHost('fetch', '', url);

  if (!isDeepSeek) {
    return _originalFetch.call(globalThis, input, init);
  }

  const date = today();

  let response;
  try {
    response = await _originalFetch.call(globalThis, input, init);
  } catch (err) {
    throw err;  // don't swallow fetch errors
  }

  // Clone the response so we can read the body without consuming the
  // original stream.  The clone is read for usage accumulation; the
  // original is returned to the caller untouched.
  try {
    const cloned = response.clone();
    const body = await cloned.text();
    accumulate(date, body);
  } catch (_) {
    // Never throw from the interceptor — silently skip
  }

  return response;
}

globalThis.fetch = patchedFetch;

// ---------------------------------------------------------------------------

// Export for testing
module.exports = { loadUsage, saveUsage, usagePath };
