import path from 'node:path';
import playwright from 'playwright';
import { mercantilConfig } from './mercantilConfig.js';
import { ensureDir, timestampSlug, writeJson } from './utils.js';

async function main(): Promise<void> {
  await ensureDir(mercantilConfig.artifactsDir);

  const browser = await playwright.chromium.connectOverCDP(mercantilConfig.cdpUrl);

  try {
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No encontré contextos en el navegador remoto.');
    }

    const allPages = contexts.flatMap((context) => context.pages());
    const mercantilPage = allPages.find((page) => /mercantilbanco\.com/i.test(page.url()));

    if (!mercantilPage) {
      throw new Error('No encontré una pestaña abierta de Mercantil en el navegador remoto.');
    }

    await mercantilPage.bringToFront().catch(() => undefined);
    await mercantilPage.waitForTimeout(3000);

    const snapshot = {
      url: mercantilPage.url(),
      title: await mercantilPage.title(),
      capturedAt: new Date().toISOString(),
      bodyText: ((await mercantilPage.locator('body').innerText()).replace(/\s+/g, ' ')).slice(0, 8000),
      clickables: await mercantilPage.locator('a, button, [role="button"], [routerlink], span.pointer').evaluateAll((els) =>
        els
          .map((el) => ({
            text: (el.textContent || '').trim(),
            href: el.getAttribute('href'),
            cls: el.getAttribute('class'),
          }))
          .filter((x) => x.text)
          .slice(0, 150)
      ),
    };

    const slug = timestampSlug();
    const screenshotPath = path.join(mercantilConfig.artifactsDir, `mercantil-cdp-${slug}.png`);
    const jsonPath = path.join(mercantilConfig.artifactsDir, `mercantil-cdp-${slug}.json`);

    await mercantilPage.screenshot({ path: screenshotPath, fullPage: true });
    await writeJson(jsonPath, snapshot);

    console.log(JSON.stringify({
      ok: true,
      url: snapshot.url,
      title: snapshot.title,
      screenshotPath,
      jsonPath,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil attach falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
