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
Write-Host "  1. 登录 DeepSeek 后台，点击 " -NoNewline
Write-Host "每月用量" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. 按 " -NoNewline
Write-Host "F12" -ForegroundColor Cyan -NoNewline
Write-Host " -> " -NoNewline
Write-Host "Network" -ForegroundColor Cyan -NoNewline
Write-Host "（网络）标签"
Write-Host ""
Write-Host "  3. " -NoNewline
Write-Host "切换一下月份或直接刷新页面" -ForegroundColor Yellow -NoNewline
Write-Host "，触发 API 请求"
Write-Host ""
Write-Host "  4. 在 Network 列表中找到 " -NoNewline
Write-Host "/api/v0/usage/amount?month=..." -ForegroundColor Cyan -NoNewline
Write-Host " 并点击"
Write-Host ""
Write-Host "  5. 右侧 " -NoNewline
Write-Host "Request Headers" -ForegroundColor Cyan -NoNewline
Write-Host "（请求标头）往下翻"
Write-Host ""
Write-Host "  6. 找到 " -NoNewline
Write-Host "authorization: Bearer ..." -ForegroundColor Green -NoNewline
Write-Host " 这一行"
Write-Host ""
Write-Host "  7. 复制 " -NoNewline
Write-Host "Bearer 后面的值" -ForegroundColor Yellow -NoNewline
Write-Host "（不含 'Bearer ' 前缀），粘贴到下方"
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
