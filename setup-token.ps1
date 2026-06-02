# =============================================================================
# DeepSeek HUD — Refresh platform token (Windows PowerShell)
#
# Opens the DeepSeek platform in your browser and guides you through
# extracting a fresh Bearer token from the browser's DevTools.
#
# Usage:
#   powershell -File ~/.claude/deepseek-hud/setup-token.ps1
# =============================================================================

$TokenFile = "$env:USERPROFILE\.claude\deepseek-hud\.platform_token"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   DeepSeek HUD — Platform Token Setup    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check existing
if (Test-Path $TokenFile) {
    $existing = Get-Content $TokenFile -Raw -ErrorAction SilentlyContinue
    Write-Host "Existing token: " -NoNewline
    Write-Host $existing.Substring(0, [Math]::Min(20, $existing.Length)) -ForegroundColor Cyan -NoNewline
    Write-Host "..."
    Write-Host ""
}

# Step 1 — Open browser
Write-Host "Opening DeepSeek platform..." -ForegroundColor Yellow
Start-Process "https://platform.deepseek.com/usage"
Write-Host ""

# Step 2 — Instructions
Write-Host "Next steps:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Press " -NoNewline
Write-Host "F12" -ForegroundColor Cyan -NoNewline
Write-Host " -> " -NoNewline
Write-Host "Console" -ForegroundColor Cyan -NoNewline
Write-Host " tab"
Write-Host ""
Write-Host "  2. Paste and run this ONE-LINER in the Console:" -ForegroundColor Yellow
Write-Host ""
Write-Host "     ┌─────────────────────────────────────────────────────────────┐"
Write-Host "     │ " -NoNewline
Write-Host "copy(localStorage.getItem('userToken') || '');'DONE'"  -ForegroundColor Green -NoNewline
Write-Host " │"
Write-Host "     └─────────────────────────────────────────────────────────────┘"
Write-Host ""
Write-Host "     If that shows an empty string, try this instead:"
Write-Host ""
Write-Host "     ┌─────────────────────────────────────────────────────────────┐"
Write-Host "     │ " -NoNewline
Write-Host "copy(JSON.parse(localStorage.getItem('persist:root')||'{}').user?.token||'')" -ForegroundColor Green -NoNewline
Write-Host " │"
Write-Host "     └─────────────────────────────────────────────────────────────┘"
Write-Host ""
Write-Host "     Still not working? Manual method:" -ForegroundColor Yellow
Write-Host "     F12 -> Network -> Refresh page -> Click /api/v0/usage/amount"
Write-Host "     -> Request Headers -> Copy the Bearer token from Authorization"
Write-Host ""

# Step 3 — Read token
$token = Read-Host -Prompt "Paste the Bearer token here"
if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "⚠ No token provided. Please try again." -ForegroundColor Red
    exit 1
}

# Clean up: remove "Bearer " prefix if pasted
$token = $token -replace '^Bearer\s+', ''

# Step 4 — Save
$dir = Split-Path $TokenFile -Parent
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
Set-Content $TokenFile $token -NoNewline

Write-Host ""
Write-Host "✅ Token saved to " -NoNewline -ForegroundColor Green
Write-Host $TokenFile -ForegroundColor Cyan
Write-Host ""
Write-Host "   Restart Claude Code to apply." -ForegroundColor Yellow
Write-Host ""
