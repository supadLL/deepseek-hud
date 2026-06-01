#!/usr/bin/env node
/**
 * DeepSeek Status Line for Claude Code — CLI entry point.
 *
 * This is the script referenced by `statusLine.command` in settings.json:
 *
 *   "statusLine": {
 *     "type": "command",
 *     "command": "node /d/ll-work/ai-play/deepseek-statusline/bin/cli.js"
 *   }
 *
 * It simply delegates to the main orchestrator in `src/index.js`.
 */

'use strict';

require('../src/index.js').main().catch(() => {
  // Status line must never break the Claude Code UI — fail silently
  console.log('\x1b[2m⚠️ 状态栏脚本异常\x1b[0m');
});
