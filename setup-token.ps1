# =============================================================================
# DeepSeek HUD -- Refresh platform token (Windows PowerShell)
#
# Two methods:
#   AUTO   -- Uses Playwright to automate the browser (recommended)
#   MANUAL -- Guides you through DevTools extraction (no deps needed)
#
# Usage:
#   powershell -File ~/.claude/deepseek-hud/setup-token.ps1
#   powershell -File ~/.claude/deepseek-hud/setup-token.ps1 -Manual
# =============================================================================

param(
  [switch]$Manual
)

$TokenFile = "$env:USERPROFILE\.claude\deepseek-hud\.platform_token"
$InstallDir = "$env:USERPROFILE\.claude\deepseek-hud"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DeepSeek HUD -- Platform Token Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check existing
if (Test-Path $TokenFile) {
  $existing = Get-Content $TokenFile -Raw -ErrorAction SilentlyContinue
  if ($existing) {
    $len = $existing.Length
    Write-Host "Existing token found (${len} chars)" -ForegroundColor DarkGray
  }
}

# ===========================================================================
# AUTO mode
# ===========================================================================

if (-not $Manual) {
  # Check Playwright
  $hasPlaywright = $false
  try {
    node -e "require('playwright')" *>$null
    if ($LASTEXITCODE -eq 0) { $hasPlaywright = $true }
  } catch { }

  if ($hasPlaywright) {
    Write-Host "Playwright detected -- trying automatic extraction..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "NOTE: This will close all browser windows to access your login profile." -ForegroundColor Yellow
    Write-Host "Please save any important browser work first." -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host -Prompt "Continue? (Y/n)"

    if ($confirm -eq 'n' -or $confirm -eq 'N') {
      Write-Host "Skipping auto mode. Switching to manual..." -ForegroundColor Yellow
      $Manual = $true
    } else {
      # Close all Chromium-based browsers
      Write-Host "Closing browser windows..." -ForegroundColor DarkGray
      Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force 2>$null
      Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force 2>$null
      Get-Process brave -ErrorAction SilentlyContinue | Stop-Process -Force 2>$null
      Get-Process chromium -ErrorAction SilentlyContinue | Stop-Process -Force 2>$null
      Start-Sleep -Seconds 2

      # Run auto extractor
      $autoScript = Join-Path $InstallDir 'setup-token-auto.js'
      if (Test-Path $autoScript) {
        node $autoScript
        if ($LASTEXITCODE -eq 0 -and (Test-Path $TokenFile)) {
          Write-Host "Token extracted and saved!" -ForegroundColor Green
          Write-Host "Restart Claude Code to apply." -ForegroundColor Yellow
          Write-Host ""
          exit 0
        }
      }
      Write-Host "Auto extraction failed. Falling back to manual..." -ForegroundColor Yellow
      Write-Host ""
      $Manual = $true
    }
  } else {
    Write-Host "Playwright not installed. Using manual mode." -ForegroundColor DarkGray
    Write-Host "To enable auto mode: npm install -g playwright" -ForegroundColor DarkGray
    Write-Host "Or: npm install playwright (in this project)" -ForegroundColor DarkGray
    Write-Host ""
  }
}

# ===========================================================================
# MANUAL mode
# ===========================================================================

if ($Manual) {
  Write-Host "Opening DeepSeek platform..." -ForegroundColor Yellow
  Start-Process "https://platform.deepseek.com/usage"
  Write-Host ""

  Write-Host "Manual steps:" -ForegroundColor White
  Write-Host ""
  Write-Host "  1. Login and click Monthly Usage tab" -ForegroundColor White
  Write-Host "  2. Press F12 -> Network tab" -ForegroundColor White
  Write-Host "  3. Switch month or refresh page (triggers API request)" -ForegroundColor Yellow
  Write-Host "  4. Find /api/v0/usage/amount?month=... in the list, click it" -ForegroundColor White
  Write-Host "  5. Right side -> Request Headers -> scroll down" -ForegroundColor White
  Write-Host "  6. Find authorization: Bearer ... -> copy the value AFTER Bearer" -ForegroundColor Green
  Write-Host ""
}

# ===========================================================================
# Read token
# ===========================================================================

$token = Read-Host -Prompt "Paste the token here"
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Host "No token provided." -ForegroundColor Red
  exit 1
}

$token = $token -replace '^Bearer\s+', ''

$dir = Split-Path $TokenFile -Parent
if (-not (Test-Path $dir)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
Set-Content $TokenFile $token -NoNewline

Write-Host ""
Write-Host "Token saved!" -ForegroundColor Green
Write-Host "Restart Claude Code to apply." -ForegroundColor Yellow
Write-Host ""
