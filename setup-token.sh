#!/usr/bin/env bash
# =============================================================================
# DeepSeek HUD — Refresh platform token
#
# Platform tokens expire periodically.  This script opens the DeepSeek
# platform in your browser and provides a one-liner to copy a fresh token
# from the browser console.
#
# Usage:
#   bash ~/.claude/deepseek-hud/setup-token.sh
# =============================================================================

set -euo pipefail

TOKEN_FILE="$HOME/.claude/deepseek-hud/.platform_token"
GREEN='\033[32m'
CYAN='\033[36m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   DeepSeek HUD — Platform Token Setup    ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""

# Step 1 — Check existing token
if [ -f "$TOKEN_FILE" ]; then
  EXISTING=$(cat "$TOKEN_FILE" 2>/dev/null || echo "")
  if [ -n "$EXISTING" ]; then
    echo -e "Existing token: ${CYAN}${EXISTING:0:20}...${RESET}"
    echo ""
  fi
fi

# Step 2 — Open browser
echo "Opening DeepSeek platform in your browser..."
echo ""
if command -v open >/dev/null 2>&1; then
  open "https://platform.deepseek.com/usage" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "https://platform.deepseek.com/usage" 2>/dev/null || true
elif command -v start >/dev/null 2>&1; then
  start "https://platform.deepseek.com/usage" 2>/dev/null || true
fi

# Step 3 — Instructions
echo ""
echo -e "${BOLD}📋 下一步：${RESET}"
echo ""
echo -e "  1. 在浏览器中按 ${CYAN}F12${RESET} → ${CYAN}Console${RESET} 标签"
echo ""
echo -e "  2. 粘贴并执行以下代码："
echo ""
echo -e "     ${GREEN}${BOLD}copy(await (await fetch('/api/v0/usage/amount?month=6&year=2026',{headers:{Authorization:localStorage.getItem('token')||''}})).headers.get('x-ds-trace-id')||'');${RESET}"
echo ""
echo "     ⚠️ 如果不能直接用 fetch，请手动操作："
echo "        F12 → Network → 刷新页面 → 点 /api/v0/usage/amount"
echo "        → Request Headers → 复制 Authorization 中 Bearer 后面的值"
echo ""
echo -e "  3. 粘贴 Token 到这里："
echo ""
read -r -p "  Token: " TOKEN
echo ""

if [ -z "$TOKEN" ]; then
  echo "❌ Token 为空，已取消。"
  exit 1
fi

# Step 4 — Save
mkdir -p "$(dirname "$TOKEN_FILE")"
echo "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"

echo -e "✅ Token 已保存到 ${CYAN}${TOKEN_FILE}${RESET}"
echo ""
echo "  重启 Claude Code 即可生效。"
echo ""
