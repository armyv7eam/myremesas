import path from 'node:path';
import playwright from 'playwright';
import { mercantilConfig } from './mercantilConfig.js';
import { ensureDir, timestampSlug, writeJson } from './utils.js';

function parseBsAmount(text: string): number | null {
  const match = text.match(/Bs\.\s*([\d.,]+)/i) || text.match(/Disponible\s*Bs\.\s*([\d.,]+)/i);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

async function main(): Promise<void> {
  await ensureDir(mercantilConfig.artifactsDir);
  const browser = await playwright.chromium.connectOverCDP(mercantilConfig.cdpUrl);

  try {
    const contexts = browser.contexts();
    const allPages = contexts.flatMap((context) => context.pages());
    const mercantilPage = allPages.find((page) => /mercantilbanco\.com/i.test(page.url()));

    if (!mercantilPage) {
      throw new Error('No encontré una pestaña abierta de Mercantil en el navegador remoto.');
    }

    await mercantilPage.bringToFront().catch(() => undefined);
    await mercantilPage.waitForTimeout(2000);

    const bodyText = await mercantilPage.locator('body').innerText();
    const compactText = bodyText.replace(/\s+/g, ' ');

    const accountMatch = compactText.match(/Cuenta\s+Corriente\s+([•*]+\d{4})/i)
      || compactText.match(/Cuentas en Moneda Nacional\s+([^]+?)\s+Disponible/i);

    const summary = {
      url: mercantilPage.url(),
      title: await mercantilPage.title(),
      capturedAt: new Date().toISOString(),
      ownerLabel: compactText.match(/¡Hola,\s*([^!]+)!/i)?.[1]?.trim() || 'Mercantil Owner',
      sectionTitleFound: /Cuentas en Moneda Nacional/i.test(compactText),
      accountLabel: accountMatch?.[0] || null,
      availableBalanceBs: parseBsAmount(compactText),
      bodyText: compactText.slice(0, 5000),
    };

    const slug = timestampSlug();
    const screenshotPath = path.join(mercantilConfig.artifactsDir, `mercantil-summary-${slug}.png`);
    const jsonPath = path.join(mercantilConfig.artifactsDir, `mercantil-summary-${slug}.json`);

    await mercantilPage.screenshot({ path: screenshotPath, fullPage: true });
    await writeJson(jsonPath, summary);

    console.log(JSON.stringify({
      ok: true,
      summary,
      screenshotPath,
      jsonPath,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil extract summary falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
