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
echo -e "  1. 登录 DeepSeek 后台，点击 ${CYAN}每月用量${RESET}"
echo ""
echo -e "  2. 按 ${CYAN}F12${RESET} → ${CYAN}Network${RESET}（网络）标签"
echo ""
echo -e "  3. ${YELLOW}切换一下月份或直接刷新页面${RESET}，触发 API 请求"
echo ""
echo -e "  4. 在 Network 列表中找到 ${CYAN}/api/v0/usage/amount?month=...${RESET} 并点击"
echo ""
echo -e "  5. 右侧 ${CYAN}Request Headers${RESET}（请求标头）往下翻"
echo ""
echo -e "  6. 找到 ${GREEN}authorization: Bearer ...${RESET} 这一行"
echo ""
echo -e "  7. 复制 ${YELLOW}Bearer 后面的值${RESET}（不含 'Bearer ' 前缀），粘贴到下方"
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
