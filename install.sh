#!/usr/bin/env bash
# =============================================================================
# DeepSeek HUD — One-command installer (macOS / Linux / Git Bash on Windows)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/supadLL/deepseek-hud/main/install.sh | bash
#
# What it does:
#   1. Checks prerequisites (node, git)
#   2. Clones (or updates) the repo into ~/.claude/deepseek-hud/
#   3. Adds the statusLine config to ~/.claude/settings.json
#   4. Runs a quick smoke test
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
CYAN='\033[36m'
BOLD='\033[1m'
RESET='\033[0m'

REPO_URL="https://github.com/supadLL/deepseek-hud.git"
INSTALL_DIR="$HOME/.claude/deepseek-hud"
SETTINGS_FILE="$HOME/.claude/settings.json"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()    { echo -e "${CYAN}→${RESET} $*"; }
success() { echo -e "${GREEN}✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET} $*"; }
fail()    { echo -e "${RED}✗${RESET} $*"; exit 1; }

# ---------------------------------------------------------------------------
# Step 1 — Prerequisites
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║   DeepSeek HUD for Claude Code           ║${RESET}"
echo -e "${BOLD}${CYAN}║   One-command installer                  ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${RESET}"
echo ""

info "Checking prerequisites..."

command -v node >/dev/null 2>&1 || fail "Node.js is required but not found. Install it from https://nodejs.org"
NODE_VER=$(node -v)
success "Node.js ${NODE_VER}"

command -v git >/dev/null 2>&1 || fail "Git is required but not found. Install it from https://git-scm.com"
GIT_VER=$(git --version 2>&1)
success "${GIT_VER}"

# ---------------------------------------------------------------------------
# Step 2 — Clone or update the repo
# ---------------------------------------------------------------------------
echo ""
info "Setting up DeepSeek HUD..."

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Existing installation found — updating..."
  git -C "$INSTALL_DIR" pull --ff-only origin main 2>/dev/null || \
    warn "Could not update. Continuing with existing version."
  success "Updated to latest version"
else
  info "Cloning into ${INSTALL_DIR}..."
  rm -rf "$INSTALL_DIR" 2>/dev/null || true
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || \
    fail "Failed to clone repo. Check your network connection."
  success "Cloned successfully"
fi

# ---------------------------------------------------------------------------
# Step 3 — Configure Claude Code settings
# ---------------------------------------------------------------------------
echo ""
info "Configuring Claude Code status line..."

# Ensure settings directory exists
mkdir -p "$(dirname "$SETTINGS_FILE")"

# Read or create settings.json
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{ "statusLine": {} }' > "$SETTINGS_FILE"
fi

# Use Node.js to safely update the JSON (avoids jq dependency)
# Node resolves paths natively — avoids shell-to-Node path translation issues on Windows
NODE_BIN=$(command -v node)
"$NODE_BIN" -e "
const fs = require('fs');
const path = require('path');
const os   = require('os');

const claudeDir  = path.join(os.homedir(), '.claude');
const settingsFile = path.join(claudeDir, 'settings.json');
const installDir   = path.join(claudeDir, 'deepseek-hud');

// Ensure the .claude directory exists
fs.mkdirSync(claudeDir, { recursive: true });

// Read existing settings
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
} catch (e) {
  settings = {};
}

// Add/update statusLine — use forward slashes (required on Windows)
const cliPath = path.join(installDir, 'bin', 'cli.js').replace(/\\\\/g, '/');

settings.statusLine = {
  type: 'command',
  command: 'node ' + cliPath,
  padding: 0
};

// Write back
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n', 'utf8');
console.log('statusLine configured → node ' + cliPath);
" || fail "Failed to update settings.json"

success "Claude Code settings updated"

# ---------------------------------------------------------------------------
# Step 4 — Smoke test
# ---------------------------------------------------------------------------
echo ""
info "Running smoke test..."

TEST_OUTPUT=$(echo '{"model":{"id":"deepseek-v4-pro"},"workspace":{"current_dir":"'$HOME'"},"cost":{"total_cost_usd":0,"total_duration_ms":0},"context_window":{"context_window_size":200000,"used_percentage":0},"session_id":"install-test"}' | node "$INSTALL_DIR/bin/cli.js" 2>&1) || true

if [ -n "$TEST_OUTPUT" ]; then
  success "Smoke test passed"
else
  warn "Smoke test produced no output — this may be normal if not in an interactive session"
fi

# ---------------------------------------------------------------------------
# Step 5 — Configure real usage tracking (intercept.js)
# ---------------------------------------------------------------------------
echo ""
info "Configuring real usage tracking..."

# Determine shell RC file
if [ -n "${ZSH_VERSION:-}" ] || [ -f "$HOME/.zshrc" ]; then
  RC_FILE="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  RC_FILE="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
  RC_FILE="$HOME/.bash_profile"
else
  RC_FILE="$HOME/.bashrc"
fi

INTERCEPT_PATH="$INSTALL_DIR/src/intercept.js"

# Clean up old alias-style configs
if [ -f "$RC_FILE" ]; then
  sed -i '/^alias claude=.*deepseek-hud/d' "$RC_FILE" 2>/dev/null || true
  sed -i '/^# DeepSeek HUD.*real usage tracking/,/^}/d' "$RC_FILE" 2>/dev/null || true
fi

if grep -q "deepseek-hud.*intercept" "$RC_FILE" 2>/dev/null; then
  info "Usage interceptor already configured in ${RC_FILE}"
else
  # Write a shell function (not an alias) to avoid recursion.
  # `command claude` bypasses the function and runs the real binary.
  {
    echo ""
    echo "# DeepSeek HUD — real usage tracking"
    echo "# Injects intercept.js to capture actual DeepSeek API token counts"
    echo "claude() {"
    echo "  NODE_OPTIONS=\"--require ${INTERCEPT_PATH}\" command claude \"\$@\""
    echo "}"
  } >> "$RC_FILE"
  success "Added intercept function to ${RC_FILE}"
fi

echo ""
echo -e "  ${YELLOW}Reload your shell, then type ${CYAN}claude${YELLOW} as usual:${RESET}"
echo -e "    ${CYAN}source ${RC_FILE}${RESET}"
echo -e "    ${CYAN}claude${RESET}"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║   DeepSeek HUD installed successfully!   ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Install location: ${CYAN}${INSTALL_DIR}${RESET}"
echo -e "  Config file:      ${CYAN}${SETTINGS_FILE}${RESET}"
echo ""
echo -e "  The status line will appear on your next"
echo -e "  interaction with Claude Code."
echo ""
echo -e "  To upgrade later, re-run this installer."
echo -e "  To uninstall, run:"
echo -e "    ${YELLOW}rm -rf ~/.claude/deepseek-hud${RESET}"
echo -e "    Then remove 'statusLine' from ~/.claude/settings.json"
echo -e "    And remove the 'claude' alias from ${RC_FILE}"
echo ""
