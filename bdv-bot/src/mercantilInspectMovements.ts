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
    bodyText: ((await page.locator('body').innerText()).replace(/\s+/g, ' ')).slice(0, 8000),
    clickables: await page.locator('a, button, [role="button"], [routerlink], span.pointer').evaluateAll((els) =>
      els
        .map((el) => ({
          text: (el.textContent || '').trim(),
          href: el.getAttribute('href'),
          cls: el.getAttribute('class'),
        }))
        .filter((x) => x.text)
        .slice(0, 200)
    ),
  };

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeJson(jsonPath, data);
  return { screenshotPath, jsonPath, data };
}

async function keepSessionAlive(page: playwright.Page): Promise<void> {
  const yesButton = page.locator('button, span.pointer, [role="button"]').filter({ hasText: /^Sí$/i }).first();
  if (await yesButton.count()) {
    await yesButton.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(1000);
  }
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

async function main(): Promise<void> {
  await ensureDir(mercantilConfig.artifactsDir);
  const browser = await playwright.chromium.connectOverCDP(mercantilConfig.cdpUrl);

  try {
    const contexts = browser.contexts();
    const allPages = contexts.flatMap((context) => context.pages());
    const page = allPages.find((candidate) => /mercantilbanco\.com/i.test(candidate.url()));

    if (!page) {
      throw new Error('No encontré una pestaña abierta de Mercantil en el navegador remoto.');
    }

    await page.bringToFront().catch(() => undefined);
    await page.waitForTimeout(1500);
    await keepSessionAlive(page);
    const before = await snapshot(page, 'mercantil-movements-start');

    if (await clickByText(page, /^Consultas$/i)) {
      await page.waitForTimeout(4000);
      await keepSessionAlive(page);
    }

    const afterConsultas = await snapshot(page, 'mercantil-movements-after-consultas');

    if (await clickByText(page, /Movimientos|Consultar movimientos|Ultimos movimientos|Últimos movimientos/i)) {
      await page.waitForTimeout(4000);
      await keepSessionAlive(page);
    } else {
      if (await clickByText(page, /Mas opciones|Más opciones|Ver todas/i)) {
        await page.waitForTimeout(3000);
        await keepSessionAlive(page);
      }
    }

    const final = await snapshot(page, 'mercantil-movements-final');

    console.log(JSON.stringify({
      ok: true,
      before,
      afterConsultas,
      final,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil inspect movements falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
