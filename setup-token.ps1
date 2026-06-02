# =============================================================================
# DeepSeek HUD — Refresh platform token (Windows PowerShell)
#
# Extracts a fresh Bearer token from platform.deepseek.com.
#
# Two methods:
#   AUTO   — Uses Playwright to automate the browser (recommended)
#   MANUAL — Guides you through DevTools extraction (no deps needed)
#
# Usage:
#   powershell -File ~/.claude/deepseek-hud/setup-token.ps1
# =============================================================================

param(
  [switch]$Manual   # Skip auto-detection, use manual mode
)

$TokenFile = "$env:USERPROFILE\.claude\deepseek-hud\.platform_token"
$InstallDir = "$env:USERPROFILE\.claude\deepseek-hud"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   DeepSeek HUD — Platform Token Setup    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check existing token
if (Test-Path $TokenFile) {
  $existing = Get-Content $TokenFile -Raw -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Existing token found (${existing.Length} chars)" -ForegroundColor DarkGray
  }
}

# ===========================================================================
# AUTO mode — Use Playwright to extract token without user interaction
# ===========================================================================

if (-not $Manual) {
  # Check if playwright is available
  $hasPlaywright = $false
  try {
    node -e "require('playwright')" 2>$null
    if ($LASTEXITCODE -eq 0) { $hasPlaywright = $true }
  } catch {}

  if ($hasPlaywright) {
    Write-Host "Playwright detected — trying automatic extraction..." -ForegroundColor Yellow
    Write-Host ""

    # Ask user to save work before closing Edge
    Write-Host "⚠  This will close all Edge windows to access your profile." -ForegroundColor Yellow
    Write-Host "   Please save any important browser work first." -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host -Prompt "Continue? (Y/n)"
    if ($confirm -eq 'n' -or $confirm -eq 'N') {
      Write-Host "Skipping auto mode. Switching to manual..." -ForegroundColor Yellow
      $Manual = $true
    } else {
      # Close Edge
      Write-Host "Closing Edge..." -ForegroundColor DarkGray
      Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force 2>$null
      Start-Sleep -Seconds 1

      # Run auto extractor
      $autoScript = Join-Path $InstallDir 'setup-token-auto.js'
      if (Test-Path $autoScript) {
        node $autoScript
        if ($LASTEXITCODE -eq 0 -and (Test-Path $TokenFile)) {
          Write-Host "✅ Token extracted and saved!" -ForegroundColor Green
          Write-Host "   Restart Claude Code to apply." -ForegroundColor Yellow
          Write-Host ""
          exit 0
        }
      }
      Write-Host "Auto extraction failed. Falling back to manual..." -ForegroundColor Yellow
      Write-Host ""
      $Manual = $true
    }
  } else {
    Write-Host "Playwright not installed. Use manual mode." -ForegroundColor DarkGray
    Write-Host "To enable auto mode: npm install -g playwright" -ForegroundColor DarkGray
    Write-Host ""
  }
}

# ===========================================================================
# MANUAL mode — DevTools method
# ===========================================================================

if ($Manual) {
  Write-Host "Opening DeepSeek platform..." -ForegroundColor Yellow
  Start-Process "https://platform.deepseek.com/usage"
  Write-Host ""

  Write-Host "Manual steps:" -ForegroundColor White
  Write-Host ""
  Write-Host "  1. 登录后点击 " -NoNewline
  Write-Host "每月用量" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  2. 按 " -NoNewline
  Write-Host "F12" -ForegroundColor Cyan -NoNewline
  Write-Host " -> " -NoNewline
  Write-Host "Network" -ForegroundColor Cyan -NoNewline
  Write-Host "（网络）标签"
  Write-Host ""
  Write-Host "  3. " -NoNewline
  Write-Host "切换月份或刷新页面" -ForegroundColor Yellow -NoNewline
  Write-Host "，触发 API 请求"
  Write-Host ""
  Write-Host "  4. 找到 " -NoNewline
  Write-Host "/api/v0/usage/amount?month=..." -ForegroundColor Cyan -NoNewline
  Write-Host " 并点击"
  Write-Host ""
  Write-Host "  5. 右侧 " -NoNewline
  Write-Host "Request Headers" -ForegroundColor Cyan -NoNewline
  Write-Host " 往下翻"
  Write-Host ""
  Write-Host "  6. 找到 " -NoNewline
  Write-Host "authorization: Bearer ..." -ForegroundColor Green -NoNewline
  Write-Host "，复制 Bearer " -NoNewline
  Write-Host "后面" -ForegroundColor Yellow -NoNewline
  Write-Host "的值"
  Write-Host ""
}

# ===========================================================================
# Read token from user
# ===========================================================================

$token = Read-Host -Prompt "Paste token here"
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Host "⚠ No token provided." -ForegroundColor Red
  exit 1
}

# Clean: remove "Bearer " prefix if accidentally pasted
$token = $token -replace '^Bearer\s+', ''

# Save
$dir = Split-Path $TokenFile -Parent
if (-not (Test-Path $dir)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
Set-Content $TokenFile $token -NoNewline

Write-Host ""
Write-Host "✅ Token saved" -ForegroundColor Green
Write-Host "   Restart Claude Code to apply." -ForegroundColor Yellow
Write-Host ""
