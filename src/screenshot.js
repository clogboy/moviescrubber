import puppeteer from "puppeteer";

const TIMEOUT_MS = 10000;
let browser = null;

// Initialize browser (reuse for performance)
async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    console.log('Puppeteer browser initialized');
  }
  return browser;
}

// Take screenshot and return as base64 data URL
export async function takeScreenshot(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Set viewport
    await page.setViewport({
      width: 1280,
      height: 720,
      deviceScaleFactor: 1
    });

    // Set timeout and navigate
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: TIMEOUT_MS
    });

    // Wait a bit for dynamic content
    await page.waitForTimeout(1000);

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 80,
      fullPage: false
    });

    // Convert to base64 data URL
    const base64 = screenshot.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    console.log(`Screenshot taken: ${url} (${Math.round(base64.length / 1024)}KB)`);

    return dataUrl;

  } catch (err) {
    console.error(`Screenshot failed for ${url}:`, err.message);
    throw new Error(`Failed to capture screenshot: ${err.message}`);
  } finally {
    await page.close();
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
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});
