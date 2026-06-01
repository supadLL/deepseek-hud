/**
 * Session state management for the DeepSeek status line.
 *
 * Maintains a persistent, session-scoped state file that tracks:
 *   - Initial DeepSeek balance (to compute actual RMB cost via delta)
 *   - Per-model cumulative token counters
 *   - Context token baselines (to detect deltas between invocations)
 *
 * State file location:  os.tmpdir()/claude-ds-session-<sessionId>.json
 *
 * @module session
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statePath(sessionId) {
  const safe = (sessionId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(os.tmpdir(), `claude-ds-session-${safe}.json`);
}

/** Create a fresh (empty) state object. */
function freshState() {
  return {
    initialBalance: null,       // balance at session start (number)
    maxSessionCost: 0,          // monotonic max cost observed (handles API jitter)
    models: {},                 // { "model-id": { input, output, cache } }
    lastInputTokens: 0,         // previous context input tokens (for delta calc)
    lastOutputTokens: 0,        // previous context output tokens
    lastCacheTokens: 0,         // previous context cache tokens
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the session state from disk, or return a fresh state.
 * @param {string} sessionId
 * @returns {object} state
 */
function loadState(sessionId) {
  try {
    const file = statePath(sessionId);
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Merge with fresh to pick up any new fields added across versions
      return { ...freshState(), ...raw };
    }
  } catch (_) { /* corrupt — start fresh */ }
  return freshState();
}

/**
 * Persist the session state to disk.  Best-effort — never throws.
 * @param {string} sessionId
 * @param {object} state
 */
function saveState(sessionId, state) {
  try {
    fs.writeFileSync(statePath(sessionId), JSON.stringify(state, null, 2), 'utf8');
  } catch (_) { /* best-effort */ }
}

/**
 * Record the current balance and update the session cost.
 *
 * On the very first call (initialBalance is null) the current balance is
 * snapshotted as the baseline.  Subsequent calls compute cost as the
 * monotonic maximum of (initialBalance - currentBalance).
 *
 * If the balance rises (e.g. after a top-up), initialBalance is reset to
 * the new higher value so cost never goes negative.
 *
 * @param {object} state           - session state (mutated in place)
 * @param {number} currentBalance  - total_balance from the API (parsed as float)
 * @returns {{ sessionCost: number, justInitialized: boolean }}
 */
function updateBalance(state, currentBalance) {
  const justInitialized = state.initialBalance === null;

  if (justInitialized) {
    state.initialBalance = currentBalance;
    state.maxSessionCost = 0;
    return { sessionCost: 0, justInitialized: true };
  }

  // Balance went up — likely a top-up; reset the baseline
  if (currentBalance > state.initialBalance) {
    state.initialBalance = currentBalance;
    state.maxSessionCost = 0;
    return { sessionCost: 0, justInitialized: true };
  }

  const rawCost = state.initialBalance - currentBalance;
  // Monotonic: cost only grows (handles minor API jitter / caching delays)
  if (rawCost > state.maxSessionCost) {
    state.maxSessionCost = rawCost;
  }

  return { sessionCost: state.maxSessionCost, justInitialized: false };
}

/**
 * Accumulate token deltas for the current model.
 *
 * Strategy: compare the current context tokens against the last-seen
 * baseline.  A positive delta is attributed to `modelId`.  If tokens
 * dropped (e.g. after /compact) the baseline simply resets — previously
 * accumulated counts are preserved.
 *
 * @param {object} state            - session state (mutated in place)
 * @param {string} modelId          - e.g. "deepseek-v4-pro"
 * @param {object} context          - data.context_window from Claude Code
 */
function updateTokens(state, modelId, context) {
  if (!modelId || !context) return;

  const currInput  = context.total_input_tokens || 0;
  const currOutput = context.total_output_tokens || 0;
  const usage      = context.current_usage || {};
  const currCache  = usage.cache_read_input_tokens || 0;

  // Compute deltas
  const dInput  = Math.max(0, currInput  - state.lastInputTokens);
  const dOutput = Math.max(0, currOutput - state.lastOutputTokens);
  const dCache  = Math.max(0, currCache  - state.lastCacheTokens);

  // Ensure model entry exists
  if (!state.models[modelId]) {
    state.models[modelId] = { input: 0, output: 0, cache: 0 };
  }

  const m = state.models[modelId];
  m.input  += dInput;
  m.output += dOutput;
  m.cache  += dCache;

  // Update baselines
  state.lastInputTokens  = currInput;
  state.lastOutputTokens = currOutput;
  state.lastCacheTokens  = currCache;
}

// ---------------------------------------------------------------------------

module.exports = { loadState, saveState, updateBalance, updateTokens, freshState };
