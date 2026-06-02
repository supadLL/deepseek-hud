#!/usr/bin/env bash
# =============================================================================
# DeepSeek HUD — Refresh platform token (macOS / Linux / Git Bash)
#
# Usage:
#   bash ~/.claude/deepseek-hud/setup-token.sh
# =============================================================================

set -euo pipefail

TOKEN_FILE="$HOME/.claude/deepseek-hud/.platform_token"
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}============================================${RESET}"
echo -e "${BOLD}  DeepSeek HUD — Platform Token Setup${RESET}"
echo -e "${BOLD}============================================${RESET}"
echo ""

# Check existing
if [ -f "$TOKEN_FILE" ]; then
  EXISTING=$(cat "$TOKEN_FILE" 2>/dev/null || echo "")
  if [ -n "$EXISTING" ]; then
    echo -e "Existing token found (${#EXISTING} chars)"
  fi
fi

# Try auto extraction if playwright is available
if command -v node >/dev/null 2>&1; then
  AUTO_SCRIPT="$HOME/.claude/deepseek-hud/setup-token-auto.js"
  if [ -f "$AUTO_SCRIPT" ]; then
    if node -e "require('playwright')" 2>/dev/null; then
      echo ""
      echo -e "${YELLOW}Playwright detected — trying automatic extraction...${RESET}"
      echo ""
      echo -e "${YELLOW}NOTE: This will close all browser windows to access your login profile.${RESET}"
      echo -e "${YELLOW}Please save any important browser work first.${RESET}"
      echo ""
      read -r -p "Continue? (Y/n): " CONFIRM
      if [ "$CONFIRM" != "n" ] && [ "$CONFIRM" != "N" ]; then
        # Close browsers
        echo "Closing browser windows..."
        pkill -f "chrome" 2>/dev/null || true
        pkill -f "brave" 2>/dev/null || true
        pkill -f "chromium" 2>/dev/null || true
        pkill -f "msedge" 2>/dev/null || true
        pkill -f "Microsoft Edge" 2>/dev/null || true
        sleep 2

        if node "$AUTO_SCRIPT"; then
          echo ""
          echo -e "${GREEN}Token extracted and saved! Restart Claude Code to apply.${RESET}"
          echo ""
          exit 0
        fi
        echo ""
        echo -e "${YELLOW}Auto extraction failed. Switching to manual...${RESET}"
        echo ""
      fi
    fi
  fi
fi

# Manual mode
echo "Opening DeepSeek platform in your browser..."
if command -v open >/dev/null 2>&1; then
  open "https://platform.deepseek.com/usage" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "https://platform.deepseek.com/usage" 2>/dev/null || true
elif command -v start >/dev/null 2>&1; then
  start "https://platform.deepseek.com/usage" 2>/dev/null || true
fi

echo ""
echo -e "${BOLD}Manual steps:${RESET}"
echo ""
echo "  1. Login and click Monthly Usage tab"
echo "  2. Press F12 -> Network tab"
echo -e "  3. ${YELLOW}Switch month or refresh page${RESET} (triggers API request)"
echo "  4. Find /api/v0/usage/amount?month=... in the list, click it"
echo "  5. Right side -> Request Headers -> scroll down"
echo -e "  6. Find ${GREEN}authorization: Bearer ...${RESET} -> copy value AFTER Bearer"
echo ""
read -r -p "Paste token here: " TOKEN
echo ""

if [ -z "$TOKEN" ]; then
  echo "No token provided."
  exit 1
fi

# Strip "Bearer " prefix if present
TOKEN="${TOKEN#Bearer }"

# Save
mkdir -p "$(dirname "$TOKEN_FILE")"
echo "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE" 2>/dev/null || true

echo -e "${GREEN}Token saved!${RESET}"
echo "Restart Claude Code to apply."
echo ""
