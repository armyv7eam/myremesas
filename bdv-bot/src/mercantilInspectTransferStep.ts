import path from 'node:path';
import playwright from 'playwright';
import 'dotenv/config';
import { mercantilConfig } from './mercantilConfig.js';
import { ensureDir, timestampSlug, writeJson } from './utils.js';

async function main(): Promise<void> {
  await ensureDir(mercantilConfig.artifactsDir);
  const browser = await playwright.chromium.connectOverCDP(mercantilConfig.cdpUrl);

  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => /mercantilbanco\.com/i.test(candidate.url()));
    if (!page) throw new Error('No encontré una pestaña abierta de Mercantil.');

    await page.bringToFront().catch(() => undefined);
    await page.waitForTimeout(800);

    const data = {
      url: page.url(),
      title: await page.title(),
      capturedAt: new Date().toISOString(),
      bodyText: ((await page.locator('body').innerText()).replace(/\s+/g, ' ')).slice(0, 12000),
      inputs: await page.locator('input, textarea, select, [role="combobox"]').evaluateAll((els) =>
        els.map((el) => ({
          tag: el.tagName,
          id: el.getAttribute('id'),
          name: el.getAttribute('name'),
          type: el.getAttribute('type'),
          placeholder: el.getAttribute('placeholder'),
          ariaLabel: el.getAttribute('aria-label'),
          className: el.getAttribute('class'),
          value: (el as HTMLInputElement).value || '',
        }))
      ),
      buttons: await page.locator('button, a, [role="button"], span.pointer').evaluateAll((els) =>
        els.map((el) => ({
          text: (el.textContent || '').trim(),
          id: el.getAttribute('id'),
          className: el.getAttribute('class'),
          href: el.getAttribute('href'),
        })).filter((x) => x.text).slice(0, 200)
      ),
    };

    const slug = timestampSlug();
    const screenshotPath = path.join(mercantilConfig.artifactsDir, `mercantil-transfer-step-${slug}.png`);
    const jsonPath = path.join(mercantilConfig.artifactsDir, `mercantil-transfer-step-${slug}.json`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await writeJson(jsonPath, data);

    console.log(JSON.stringify({ ok: true, screenshotPath, jsonPath, data }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil inspect transfer step falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
