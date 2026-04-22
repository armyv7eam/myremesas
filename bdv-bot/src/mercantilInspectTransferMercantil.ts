import path from 'node:path';
import playwright from 'playwright';
import { mercantilConfig } from './mercantilConfig.js';
import { ensureDir, timestampSlug, writeJson } from './utils.js';

async function snapshot(page: playwright.Page, label: string) {
  const slug = `${label}-${timestampSlug()}`;
  const screenshotPath = path.join(mercantilConfig.artifactsDir, `${slug}.png`);
  const jsonPath = path.join(mercantilConfig.artifactsDir, `${slug}.json`);

  const data = {
    label,
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
      })).slice(0, 120)
    ),
    clickables: await page.locator('a, button, [role="button"], [role="tab"], [routerlink], span.pointer').evaluateAll((els) =>
      els.map((el) => ({
        text: (el.textContent || '').trim(),
        href: el.getAttribute('href'),
        role: el.getAttribute('role'),
        id: el.getAttribute('id'),
        className: el.getAttribute('class'),
      })).filter((x) => x.text).slice(0, 250)
    ),
  };

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeJson(jsonPath, data);
  return { screenshotPath, jsonPath, data };
}

async function clickByText(page: playwright.Page, regex: RegExp): Promise<boolean> {
  const direct = page.getByText(regex, { exact: false }).first();
  if (await direct.count()) {
    await direct.click({ force: true }).catch(() => undefined);
    return true;
  }

  const clicked = await page.evaluate((patternSource) => {
    const regex = new RegExp(patternSource, 'i');
    for (const rawNode of Array.from(document.querySelectorAll('body *'))) {
      const node = rawNode as HTMLElement;
      const text = (node.textContent || '').trim();
      if (!text || !regex.test(text)) continue;
      node.click();
      return true;
    }
    return false;
  }, regex.source).catch(() => false);

  return Boolean(clicked);
}

async function keepSessionAlive(page: playwright.Page): Promise<void> {
  const yesButton = page.locator('button, span.pointer, [role="button"]').filter({ hasText: /^Sí$/i }).first();
  if (await yesButton.count()) {
    await yesButton.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(800);
  }
}

async function main(): Promise<void> {
  await ensureDir(mercantilConfig.artifactsDir);
  const browser = await playwright.chromium.connectOverCDP(mercantilConfig.cdpUrl);

  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => /mercantilbanco\.com/i.test(candidate.url()));
    if (!page) throw new Error('No encontré una pestaña abierta de Mercantil.');

    await page.bringToFront().catch(() => undefined);
    await page.waitForTimeout(1000);
    await keepSessionAlive(page);

    const before = await snapshot(page, 'mercantil-transfer-start');

    if (await clickByText(page, /Transferir a otras cuentas Mercantil/i)) {
      await page.waitForTimeout(5000);
      await keepSessionAlive(page);
    }

    const transfer = await snapshot(page, 'mercantil-transfer-form');

    console.log(JSON.stringify({ ok: true, before, transfer }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil inspect transfer Mercantil falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
