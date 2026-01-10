import puppeteer from "puppeteer";

const TIMEOUT_MS = 15000; // Increased timeout
let browser = null;

// Initialize browser (reuse for performance)
async function getBrowser() {
  if (!browser) {
    console.log('Launching Puppeteer browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,720'
      ]
    });

    console.log('✓ Puppeteer browser initialized');
  }
  return browser;
}

// Take screenshot and return as base64 data URL
export async function takeScreenshot(url) {
  console.log(`\n=== Taking screenshot of: ${url} ===`);

  let page = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    console.log('1. Page created');

    // Set viewport
    await page.setViewport({
      width: 1280,
      height: 720,
      deviceScaleFactor: 1
    });

    console.log('2. Viewport set: 1280x720');

    // Set user agent (some sites block headless browsers)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('3. User agent set');

    // Navigate with timeout
    console.log(`4. Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: TIMEOUT_MS
    });

    console.log('5. Page loaded');

    // Wait a bit for dynamic content
    await page.waitForTimeout(2000);

    console.log('6. Waited for dynamic content');

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 75,
      fullPage: false
    });

    console.log('7. Screenshot captured');

    // Convert to base64 data URL
    const base64 = screenshot.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    const sizeKB = Math.round(base64.length / 1024);
    console.log(`✓ Screenshot complete: ${sizeKB}KB`);

    return dataUrl;

  } catch (err) {
    console.error(`\n❌ Screenshot failed for ${url}`);
    console.error(`Error: ${err.message}`);
    console.error(`Stack: ${err.stack}`);

    // Return error placeholder
    const errorSvg = `
      <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#1a1a1a"/>
        <text x="50%" y="45%" font-family="Arial, sans-serif" font-size="32" fill="#f44336" text-anchor="middle">
          ❌ Screenshot Failed
        </text>
        <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="16" fill="#888" text-anchor="middle">
          ${err.message}
        </text>
        <text x="50%" y="65%" font-family="Arial, sans-serif" font-size="14" fill="#666" text-anchor="middle">
          Click to open link directly
        </text>
      </svg>
    `;

    const base64 = Buffer.from(errorSvg).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;

  } finally {
    if (page) {
      try {
        await page.close();
        console.log('8. Page closed');
      } catch (err) {
        console.error('Error closing page:', err.message);
      }
    }
  }
}

// Cleanup on exit
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    console.log('Puppeteer browser closed');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await closeBrowser();
});

process.on('SIGTERM', async () => {
  await closeBrowser();
});
