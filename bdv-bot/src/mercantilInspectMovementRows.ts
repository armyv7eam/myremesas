import playwright from 'playwright';
import 'dotenv/config';

async function main(): Promise<void> {
  const browser = await playwright.chromium.connectOverCDP(process.env.MERCANTIL_CDP_URL!);

  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => /mercantilbanco\.com\/account\/account-detail/i.test(candidate.url()));

    if (!page) throw new Error('No encontré account-detail.');

    const movementTab = page.locator('[role="tab"]').filter({ hasText: /^Movimientos$/i }).first();
    if (await movementTab.count()) {
      await movementTab.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(1200);
    }

    const rows = await page.evaluate(() => {
      const selectors = ['table tr', 'tbody tr', '[role="row"]', '.mat-mdc-row', '.mdc-data-table__row'];
      const results: Array<{ text: string; html: string }> = [];
      for (const selector of selectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const text = (el.textContent || '').trim();
          if (!text) continue;
          results.push({ text, html: (el as HTMLElement).outerHTML.slice(0, 500) });
        }
        if (results.length) break;
      }
      return results;
    });

    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil inspect movement rows falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
