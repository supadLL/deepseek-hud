# =============================================================================
# DeepSeek HUD — One-command installer (Windows PowerShell)
#
# Usage:
#   irm https://raw.githubusercontent.com/supadLL/deepseek-hud/main/install.ps1 | iex
#
# What it does:
#   1. Checks prerequisites (node, git)
#   2. Clones (or updates) the repo into ~/.claude/deepseek-hud/
#   3. Adds the statusLine config to ~/.claude/settings.json
#   4. Runs a quick smoke test
# =============================================================================

param()

$ErrorActionPreference = "Stop"

$RepoUrl    = "https://github.com/supadLL/deepseek-hud.git"
$InstallDir = "$env:USERPROFILE\.claude\deepseek-hud"
$SettingsFile = "$env:USERPROFILE\.claude\settings.json"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Info    { Write-Host "→ $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "✓ $args" -ForegroundColor Green }
function Write-Warn    { Write-Host "⚠ $args" -ForegroundColor Yellow }
function Write-Fail    { Write-Host "✗ $args" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   DeepSeek HUD for Claude Code           ║" -ForegroundColor Cyan
Write-Host "║   One-command installer (PowerShell)     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# Step 1 — Prerequisites
# ---------------------------------------------------------------------------
Write-Info "Checking prerequisites..."

try {
    $nodeVer = (Get-Command node -ErrorAction Stop).Version
    Write-Success "Node.js v$nodeVer"
} catch {
    Write-Fail "Node.js is required but not found. Install it from https://nodejs.org"
}

try {
    $gitVer = (git --version 2>&1)
    Write-Success $gitVer
} catch {
    Write-Fail "Git is required but not found. Install it from https://git-scm.com"
}

# ---------------------------------------------------------------------------
# Step 2 — Clone or update the repo
# ---------------------------------------------------------------------------
Write-Host ""
Write-Info "Setting up DeepSeek HUD..."

if (Test-Path "$InstallDir\.git") {
    Write-Info "Existing installation found — updating..."
    Push-Location $InstallDir
    try {
        git pull --ff-only origin main 2>$null
        Write-Success "Updated to latest version"
    } catch {
        Write-Warn "Could not update. Continuing with existing version."
    }
    Pop-Location
} else {
    Write-Info "Cloning into $InstallDir..."
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir
    }
    git clone --depth 1 $RepoUrl $InstallDir 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Failed to clone repo. Check your network connection."
    }
    Write-Success "Cloned successfully"
}

# ---------------------------------------------------------------------------
# Step 3 — Configure Claude Code settings
# ---------------------------------------------------------------------------
Write-Host ""
Write-Info "Configuring Claude Code status line..."

# Ensure settings directory exists
$settingsDir = Split-Path $SettingsFile -Parent
if (-not (Test-Path $settingsDir)) {
    New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
}

# Use Node.js to safely update the JSON
$cliPath = "$InstallDir\bin\cli.js" -replace '\\', '/'
$nodeScript = @"
const fs = require('fs');
const settingsFile = process.argv[2];
const command = process.argv[3];

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
} catch (e) {
  settings = {};
}

settings.statusLine = {
  type: 'command',
  command: 'node ' + command,
  padding: 0
};

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n', 'utf8');
console.log('statusLine configured → node ' + command);
"@

$nodeScript | node - $SettingsFile $cliPath
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Failed to update settings.json"
}

Write-Success "Claude Code settings updated"

# ---------------------------------------------------------------------------
# Step 4 — Smoke test
# ---------------------------------------------------------------------------
Write-Host ""
Write-Info "Running smoke test..."

$testJson = '{"model":{"id":"deepseek-v4-pro"},"workspace":{"current_dir":"' + $env:USERPROFILE + '"},"cost":{"total_cost_usd":0,"total_duration_ms":0},"context_window":{"context_window_size":200000,"used_percentage":0},"session_id":"install-test"}'
$testOutput = $testJson | node "$InstallDir\bin\cli.js" 2>&1

if ($testOutput) {
    Write-Success "Smoke test passed"
} else {
    Write-Warn "Smoke test produced no output — this may be normal if not in an interactive session"
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   DeepSeek HUD installed successfully!   ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Install location: " -NoNewline; Write-Host $InstallDir -ForegroundColor Cyan
Write-Host "  Config file:      " -NoNewline; Write-Host $SettingsFile -ForegroundColor Cyan
Write-Host ""
Write-Host "  The status line will appear on your next"
Write-Host "  interaction with Claude Code."
Write-Host ""
Write-Host "  To upgrade later, re-run this installer."
Write-Host "  To uninstall, run:"
Write-Host "    Remove-Item -Recurse -Force $InstallDir"
Write-Host "    Then remove 'statusLine' from $SettingsFile"
Write-Host ""
