#!/usr/bin/env node
/**
 * DeepSeek HUD — Automatic Platform Token Extractor
 *
 * Auto-detects available Chromium-based browsers (Chrome, Edge, Brave,
 * Chromium) on Windows / macOS / Linux, launches with the user's existing
 * profile so the session is preserved, and extracts the Bearer token from
 * the usage API request — no DevTools, no copy-paste.
 *
 * Requires: npm install -g playwright
 */

'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ---------------------------------------------------------------------------
// Resolve playwright from global install if not on default NODE_PATH
// ---------------------------------------------------------------------------
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  // Try global npm prefix
  try {
    const prefix = execSync('npm config get prefix', { encoding: 'utf8' }).trim();
    const globalPath = path.join(prefix, 'node_modules');
    ({ chromium } = require(require.resolve('playwright', { paths: [globalPath] })));
  } catch (_2) {
    console.error('Playwright not found. Install it first:');
    console.error('  npm install -g playwright');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Browser detection — ordered by preference
// ---------------------------------------------------------------------------

/**
 * Each entry maps a browser to its Playwright channel + profile paths.
 * We try them in order and use the first one that exists.
 *
 * Profile paths are arrays because some browsers have multiple possible
 * locations (e.g. Chrome Beta vs stable, Snap vs native on Linux).
 */
const BROWSERS = [
  {
    name:    'Microsoft Edge',
    channel: 'msedge',
    profiles: {
      win32:  [path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data')],
      darwin: [path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge')],
      linux:  [path.join(os.homedir(), '.config', 'microsoft-edge')],
    },
  },
  {
    name:    'Google Chrome',
    channel: 'chrome',
    profiles: {
      win32:  [path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data')],
      darwin: [path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')],
      linux:  [
        path.join(os.homedir(), '.config', 'google-chrome'),
        path.join(os.homedir(), 'snap', 'google-chrome', 'current', '.config', 'google-chrome'),
      ],
    },
  },
  {
    name:    'Brave Browser',
    channel: 'chrome',  // Brave uses Chrome channel in Playwright but needs custom executable
    profiles: {
      win32:  [path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data')],
      darwin: [path.join(os.homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser')],
      linux:  [path.join(os.homedir(), '.config', 'BraveSoftware', 'Brave-Browser')],
    },
    // Brave doesn't have a dedicated Playwright channel — we find the executable
    executableHint: true,
  },
  {
    name:    'Chromium',
    channel: 'chromium',
    profiles: {
      win32:  [path.join(os.homedir(), 'AppData', 'Local', 'Chromium', 'User Data')],
      darwin: [path.join(os.homedir(), 'Library', 'Application Support', 'Chromium')],
      linux:  [
        path.join(os.homedir(), '.config', 'chromium'),
        path.join(os.homedir(), 'snap', 'chromium', 'current', '.config', 'chromium'),
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function detectBrowser() {
  const platform = process.platform;
  const profiles = platform === 'win32' ? 'win32' : (platform === 'darwin' ? 'darwin' : 'linux');

  for (const browser of BROWSERS) {
    const dirs = browser.profiles[profiles] || [];
    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        // For Brave, also check if the executable exists
        if (browser.executableHint) {
          const exe = findBraveExecutable(platform);
          if (exe) {
            return { ...browser, profileDir: dir, executablePath: exe };
          }
          continue;
        }
        return { ...browser, profileDir: dir };
      }
    }
  }
  return null;
}

function findBraveExecutable(platform) {
  const candidates = {
    win32:  ['C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
    darwin: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
    linux:  ['/usr/bin/brave-browser', '/usr/bin/brave'],
  };
  const list = candidates[platform] || [];
  return list.find(fs.existsSync) || null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const TOKEN_FILE = path.join(os.homedir(), '.claude', 'deepseek-hud', '.platform_token');
  const PLATFORM_URL = 'https://platform.deepseek.com/usage';
  const USAGE_API_PATTERN = '/api/v0/usage/amount';

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   DeepSeek HUD — Auto Token Extractor   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // --- Detect browser ---
  const browser = detectBrowser();
  if (!browser) {
    console.error('❌ 未找到支持的浏览器。');
    console.error('   支持: Chrome, Edge, Brave, Chromium');
    console.error('');
    console.error('   请使用手动模式: setup-token.ps1 -Manual');
    process.exit(1);
  }

  console.log(`检测到: ${browser.name}`);
  console.log(`Profile: ${browser.profileDir}`);
  console.log('');

  let token = null;

  try {
    // Launch persistent context — uses the real profile with saved login
    const launchOptions = {
      channel: browser.channel,
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
      ],
    };

    if (browser.executablePath) {
      launchOptions.executablePath = browser.executablePath;
    }

    console.log(`正在启动 ${browser.name}（使用已保存的登录状态）...`);
    const context = await chromium.launchPersistentContext(browser.profileDir, launchOptions);

    const page = context.pages()[0] || await context.newPage();

    // Intercept API requests
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes(USAGE_API_PATTERN)) {
        const auth = request.headers()['authorization'] || '';
        if (auth.startsWith('Bearer ')) {
          token = auth.slice(7);
        }
      }
    });

    // Navigate
    console.log('正在打开 DeepSeek 后台...');
    await page.goto(PLATFORM_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Wait for usage API request
    console.log('等待用量 API 请求...');
    let attempts = 0;
    while (!token && attempts < 12) {
      await page.waitForTimeout(2000);
      attempts++;

      if (attempts === 2) {
        // Click usage/monthly tab
        try {
          const tab = page.locator('text=每月用量, text=用量, text=Usage, a[href*="usage"]').first();
          if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await tab.click();
          }
        } catch (_) {}
      } else if (attempts === 4) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
      } else if (attempts === 6) {
        // Try clicking a month selector
        try {
          const btn = page.locator('[class*="month"], [class*="picker"], button:has-text("月")').first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await btn.click();
            await page.waitForTimeout(1500);
            await btn.click();
          }
        } catch (_) {}
      } else if (attempts === 8) {
        // Navigate with query params
        const d = new Date();
        await page.goto(`${PLATFORM_URL}?month=${d.getMonth() + 1}&year=${d.getFullYear()}`, { waitUntil: 'domcontentloaded' });
      } else if (attempts === 10) {
        // Last resort: force full reload
        await page.goto(PLATFORM_URL, { waitUntil: 'load', timeout: 15000 });
      }
    }

    await context.close();

  } catch (err) {
    console.error('');
    console.error('❌ 自动化失败:', err.message.split('\n')[0]);
    console.error('');

    const msg = err.message || '';
    if (msg.includes('lock') || msg.includes('Singleton') || msg.includes('profile')) {
      console.error(`   ${browser.name} 正在运行中，Profile 被锁定。`);
      console.error('   请关闭所有浏览器窗口后重试。');
      console.error('   或使用手动模式: setup-token.ps1 -Manual');
    } else if (msg.includes('executable') || msg.includes('not found')) {
      console.error(`   找不到 ${browser.name} 的可执行文件。`);
      console.error('   请使用手动模式: setup-token.ps1 -Manual');
    } else {
      console.error('   请确保目标浏览器已安装且未运行。');
    }
    process.exit(1);
  }

  // --- Save ---
  if (token) {
    const dir = path.dirname(TOKEN_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, token, 'utf8');
    console.log('');
    console.log(`✅ Token 已保存 (${browser.name})`);
    console.log(`   路径: ${TOKEN_FILE}`);
    console.log('');
    console.log('   Line 3 将展示真实每日用量，重启 Claude Code 生效。');
    console.log('');
  } else {
    console.log('');
    console.log('❌ 未能捕获 Token。');
    console.log('   请确保已在浏览器中登录 platform.deepseek.com。');
    console.log('   如果已登录，使用手动模式: setup-token.ps1 -Manual');
    console.log('');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('未知错误:', err);
  process.exit(1);
});
