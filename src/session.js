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
    dailyBaseline: null,        // { input, output, cache } — daily totals at session start
    lastInputTokens: 0,         // previous context input tokens (for delta calc)
    lastOutputTokens: 0,        // previous context output tokens
    lastCacheTokens: 0,         // previous context cache tokens
    lastCtxPct: 0,              // previous context used_percentage (for compaction detection)
    compactionCount: 0,         // number of compactions in this session
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
 * Claude Code sends DAILY-CUMULATIVE token counts (total_input_tokens /
 * total_output_tokens are today's API-key-wide totals, not per-session).
 * To get session-level numbers we snapshot the daily total at session start
 * ("dailyBaseline") and compute session tokens = current daily − baseline.
 *
 * Per-model breakdown is approximate: deltas from the last invocation are
 * attributed to `modelId`.  After /compact the baseline resets but
 * previously-accumulated counts are preserved.
 *
 * @param {object} state            - session state (mutated in place)
 * @param {string} modelId          - e.g. "deepseek-v4-pro"
 * @param {object} context          - data.context_window from Claude Code
 * @returns {{ sessionTokens: {input,output,cache}, dailyTotals: {input,output,cache} }}
 */
function updateTokens(state, modelId, context) {
  if (!modelId || !context) {
    return { sessionTokens: { input: 0, output: 0, cache: 0 },
             dailyTotals:   { input: 0, output: 0, cache: 0 } };
  }

  const currInput  = context.total_input_tokens || 0;
  const currOutput = context.total_output_tokens || 0;
  const usage      = context.current_usage || {};
  const currCache  = usage.cache_read_input_tokens || 0;

  // --- First call of this session: snapshot daily baseline ------------
  if (!state.dailyBaseline) {
    state.dailyBaseline = { input: currInput, output: currOutput, cache: currCache };
    state.lastInputTokens  = currInput;
    state.lastOutputTokens = currOutput;
    state.lastCacheTokens  = currCache;
    // Ensure model entry exists (increment by zero)
    if (!state.models[modelId]) {
      state.models[modelId] = { input: 0, output: 0, cache: 0 };
    }
    return {
      sessionTokens: { input: 0, output: 0, cache: 0 },
      dailyTotals:   { input: currInput, output: currOutput, cache: currCache },
    };
  }

  // --- Incremental deltas since last invocation -----------------------
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

  // Update incremental baselines
  state.lastInputTokens  = currInput;
  state.lastOutputTokens = currOutput;
  state.lastCacheTokens  = currCache;

  // --- Session-level tokens (delta from session start) ----------------
  const b = state.dailyBaseline;
  const sessionTokens = {
    input:  Math.max(0, currInput  - b.input),
    output: Math.max(0, currOutput - b.output),
    cache:  Math.max(0, currCache  - b.cache),
  };

  return {
    sessionTokens,
    dailyTotals: { input: currInput, output: currOutput, cache: currCache },
  };
}

/**
 * Detect context-window compaction.
 *
 * Compaction is inferred when `used_percentage` drops sharply between
 * invocations (e.g. 95% → 30%).  Returns `true` on the invocation where
 * the drop is detected, `false` otherwise.
 *
 * @param {object} state     - session state (mutated in place)
 * @param {number} currPct   - current context_window.used_percentage
 * @returns {boolean} true if a compaction just happened
 */
function checkCompaction(state, currPct) {
  const prev = state.lastCtxPct;

  // Update the stored value for next time
  state.lastCtxPct = currPct;

  // Detect: previous was high (> 70%) and dropped significantly (> 30 pts)
  if (prev > 70 && (prev - currPct) > 30) {
    state.compactionCount += 1;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------

module.exports = { loadState, saveState, updateBalance, updateTokens, checkCompaction, freshState };
