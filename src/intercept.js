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

  const isDeepSeek = hostname === DEEPSEEK_HOST;

  if (!isDeepSeek) {
    // Not DeepSeek — pass through
    return _originalRequest.call(https, opts, ...args);
  }

  // DeepSeek request — wrap the callback to capture the response body
  const date = today();
  let callback = null;

  // args may contain [callback] or [options, callback]
  // In Node's https.request signature: https.request(url|options, callback?)
  // args[0] could be the callback if it's a function
  if (args.length > 0 && typeof args[args.length - 1] === 'function') {
    callback = args[args.length - 1];
  }

  const wrappedCallback = function (res) {
    const chunks = [];

    // Intercept data
    res.on('data', chunk => { chunks.push(chunk); });

    // When response completes, try to extract usage
    res.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        accumulate(date, body);
      } catch (_) { /* never throw from interceptor */ }
    });

    // Pass through to original callback
    if (callback) {
      // Re-emit data events by calling the original callback with the
      // original response — but we've already consumed the data events.
      // Need to re-create them.
      //
      // Strategy: pause the original response, patch it with a PassThrough
      // that replays the chunks, and pass the patched stream to callback.

      // Use a simple approach: re-emit via a cloned stream
      const { PassThrough } = require('stream');
      const pt = new PassThrough();

      for (const chunk of chunks) {
        pt.push(chunk);
      }

      // Forward any new data
      res.on('data', chunk => { pt.push(chunk); });
      res.on('end',  ()     => { pt.push(null); });
      res.on('error', err   => { pt.destroy(err); });

      // Copy status properties
      pt.statusCode = res.statusCode;
      pt.statusMessage = res.statusMessage;
      pt.headers = res.headers;

      callback(pt);
    }
  };

  // Replace the callback in args
  const newArgs = [...args];
  if (callback) {
    newArgs[newArgs.length - 1] = wrappedCallback;
  } else {
    newArgs.push(wrappedCallback);
  }

  return _originalRequest.call(https, opts, ...newArgs);
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
// If this file exists, NODE_OPTIONS is working.
// If it doesn't, the interceptor was never loaded into the Claude Code process.
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
