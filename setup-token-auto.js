#!/usr/bin/env node
/**
 * DeepSeek HUD — Automatic Platform Token Extractor
 *
 * Uses Playwright to launch your system browser with your existing login
 * session, navigate to the DeepSeek platform, intercept the usage API
 * request, and extract the Bearer token — all without any manual steps.
 *
 * Requires: playwright (npm install playwright)
 *           A valid browser session on platform.deepseek.com
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TOKEN_FILE = path.join(os.homedir(), '.claude', 'deepseek-hud', '.platform_token');
const PLATFORM_URL = 'https://platform.deepseek.com/usage';
const USAGE_API_PATTERN = '/api/v0/usage/amount';

// Edge user data directory (where cookies/sessions are stored)
const EDGE_PROFILE = process.env.EDGE_USER_DATA_PROFILE ||
  path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   DeepSeek HUD — Auto Token Extractor   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  let token = null;

  // Check if we should use Chrome instead of Edge
  const channel = process.env.CHROME ? 'chrome' : 'msedge';
  console.log(`Launching ${channel} with your existing profile...`);
  console.log('(This uses your saved login — no manual steps needed)');
  console.log('');

  try {
    // Launch browser with persistent context (keeps existing cookies/login)
    const context = await chromium.launchPersistentContext(EDGE_PROFILE, {
      channel,
      headless: false,  // show the browser window
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
      ],
    });

    const page = context.pages()[0] || await context.newPage();

    // Intercept API requests BEFORE navigating
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes(USAGE_API_PATTERN)) {
        const authHeader = request.headers()['authorization'] || '';
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.slice(7);  // strip 'Bearer ' prefix
        }
      }
    });

    // Navigate to the usage page
    console.log('Opening DeepSeek platform...');
    await page.goto(PLATFORM_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // The API request may not fire immediately — wait for it
    console.log('Waiting for usage API request...');

    // Try clicking on a month selector or refreshing to trigger the API
    let attempts = 0;
    while (!token && attempts < 10) {
      await page.waitForTimeout(2000);

      // Try clicking "每月用量" or refreshing if needed
      if (attempts === 0) {
        // First attempt: just wait (the page might auto-load)
      } else if (attempts === 2) {
        // Try to click the usage/monthly tab
        try {
          const usageLink = page.locator('text=每月用量, text=用量, text=Usage, a[href*="usage"]').first();
          if (await usageLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await usageLink.click();
          }
        } catch (_) { /* ignore */ }
      } else if (attempts === 4) {
        // Refresh the page
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
      } else if (attempts === 6) {
        // Try to interact with month picker
        try {
          const monthBtn = page.locator('[class*="month"], [class*="picker"], button:has-text("月")').first();
          if (await monthBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await monthBtn.click();
            await page.waitForTimeout(1000);
            // Click back
            await monthBtn.click();
          }
        } catch (_) { /* ignore */ }
      } else if (attempts === 8) {
        // Last resort: navigate to usage with query params directly
        const d = new Date();
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        await page.goto(`${PLATFORM_URL}?month=${m}&year=${y}`, { waitUntil: 'domcontentloaded' });
      }

      attempts++;
    }

    // Close browser
    await context.close();

  } catch (err) {
    console.error('');
    console.error('❌ 自动化失败:', err.message.split('\n')[0]);
    console.error('');
    if (err.message.includes('lockfile') || err.message.includes('SingletonLock') || err.message.includes('profile')) {
      console.error('   Edge 正在运行中，Profile 目录被锁定。');
      console.error('   请先关闭所有 Edge 窗口，然后重试。');
      console.error('   或者使用手动模式: setup-token.ps1 -Manual');
    } else {
      console.error('   Edge/Chrome 启动失败。请确保浏览器已安装。');
    }
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Result
  // -------------------------------------------------------------------------

  if (token) {
    // Save token
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_FILE, token, 'utf8');
    console.log('✅ Token saved to ' + TOKEN_FILE);
    console.log('');
    console.log('   Line 3 will now show real daily usage.');
    console.log('   Restart Claude Code to apply.');
    console.log('');
  } else {
    console.log('❌ Could not capture the token.');
    console.log('');
    console.log('   Make sure you are logged into platform.deepseek.com in Edge.');
    console.log('   If you are, try closing all Edge windows first and re-run.');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
