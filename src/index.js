/**
 * DeepSeek Status Line — main orchestrator.
 *
 * Reads Claude Code session JSON from stdin, fetches DeepSeek account balance
 * (file-cached, 30 s TTL), tracks per-model token usage and real RMB cost via
 * balance delta, and writes a 3-line ANSI HUD to stdout.
 *
 * @module index
 */

'use strict';

const { renderLine1, renderLine2, renderLine3 } = require('./render');
const { fetchBalance, readStaleCache } = require('./balance');
const { loadState, saveState, updateBalance, updateTokens } = require('./session');
const { C, estimateCost } = require('./format');

// ---------------------------------------------------------------------------
// stdin reader
// ---------------------------------------------------------------------------

/**
 * Read and parse JSON from stdin.
 * Resolves `null` if stdin is a TTY or empty, so callers can short-circuit.
 *
 * @returns {Promise<object|null>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) return resolve(null);

    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; });
    process.stdin.on('end', () => {
      if (!input.trim()) return resolve(null);
      try {
        resolve(JSON.parse(input));
      } catch (e) {
        reject(new Error('Invalid JSON on stdin: ' + e.message));
      }
    });
    process.stdin.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Parse session data ---------------------------------------------------
  const data = await readStdin();
  if (!data) {
    console.log(`${C.dim}等待会话数据…${C.reset}`);
    return;
  }

  const sessionId = data.session_id || 'default';

  // 2. Load persistent session state ----------------------------------------
  const state = loadState(sessionId);

  // 3. Fetch DeepSeek balance -----------------------------------------------
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || '';
  let balance   = null;
  let stale     = false;
  let sessionCost = 0;

  if (apiKey) {
    try {
      balance = await fetchBalance(apiKey, sessionId);
    } catch (_) { /* guarded */ }

    // Fallback: stale cache
    if (balance === null) {
      const staleEntry = readStaleCache(sessionId);
      if (staleEntry) {
        balance = staleEntry.data;
        stale   = staleEntry.stale;
      }
    }

    // Compute real RMB cost from balance delta
    if (balance && balance.balance_infos && balance.balance_infos.length > 0) {
      const currentBalance = parseFloat(balance.balance_infos[0].total_balance || '0');
      const result = updateBalance(state, currentBalance);
      sessionCost = result.sessionCost;
    }
  }

  // 4. Track per-model token usage -----------------------------------------
  const modelId = data.model?.id || data.model?.display_name || '';
  let sessionTokens = { input: 0, output: 0, cache: 0 };
  let estimatedCost = 0;
  let cacheRatio = 0;

  if (modelId && data.context_window) {
    const result = updateTokens(state, modelId, data.context_window);
    if (result) {
      sessionTokens = result.sessionTokens;

      // Estimate how many of the session input tokens were cache hits.
      // We use the CURRENT context's cache ratio (cache / total-context-input)
      // as a proxy for the session-wide ratio, because cache_read_input_tokens
      // is a point-in-time snapshot, not a daily-cumulative field.
      const usage = data.context_window.current_usage || {};
      const ctxInput = usage.input_tokens || 0;
      const ctxCache = usage.cache_read_input_tokens || 0;
      const ctxTotal  = ctxInput + ctxCache;
      cacheRatio = ctxTotal > 0 ? ctxCache / ctxTotal : 0;
      const estimatedCache = Math.round(sessionTokens.input * cacheRatio);

      estimatedCost = estimateCost(
        modelId,
        sessionTokens.input,
        sessionTokens.output,
        estimatedCache,
      );
    }
  }

  // 5. Persist state -------------------------------------------------------
  saveState(sessionId, state);

  // 6. Render HUD ----------------------------------------------------------
  const modelStats = state.models || {};

  console.log(renderLine1(data));
  console.log(renderLine2(data, sessionCost, data.cost?.total_cost_usd || 0, estimatedCost, sessionTokens));
  console.log(renderLine3(balance, stale, modelStats, modelId, cacheRatio));
}

// ---------------------------------------------------------------------------

module.exports = { main };

// Allow `node src/index.js` for testing
if (require.main === module) {
  main().catch(() => {
    console.log(`${C.dim}⚠️ 状态栏脚本异常${C.reset}`);
  });
}
