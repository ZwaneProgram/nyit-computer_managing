import { chromium } from 'playwright-core';

// Render an HTML string to a PNG buffer using headless Chromium. The browser
// binary is located via CHROMIUM_PATH (any Chromium works: the dev machine's
// playwright chromium, or apt `chromium-browser` on the VPS). We screenshot the
// `.poster` element when present so the output is exactly the poster canvas.
export async function renderHtmlToPng(
  html: string,
  opts: { width: number; height: number },
): Promise<Buffer> {
  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) {
    throw new Error('CHROMIUM_PATH ไม่ได้ตั้งค่า (ต้องชี้ไปยัง Chromium สำหรับสร้างโปสเตอร์)');
  }
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: 2,
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(() => (globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } }).document.fonts.ready);
    const el = await page.$('.poster');
    const buf = el
      ? await el.screenshot({ type: 'png' })
      : await page.screenshot({ type: 'png' });
    return buf as Buffer;
  } finally {
    await browser.close();
  }
}
