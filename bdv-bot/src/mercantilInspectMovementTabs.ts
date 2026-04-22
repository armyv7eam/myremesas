import playwright from 'playwright';
import 'dotenv/config';

async function main(): Promise<void> {
  const browser = await playwright.chromium.connectOverCDP(process.env.MERCANTIL_CDP_URL!);

  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => /mercantilbanco\.com\/account\/account-detail/i.test(candidate.url()));

    if (!page) {
      throw new Error('No encontré la página account-detail de Mercantil.');
    }

    const tabCandidates = await page.locator('body *').evaluateAll((els) =>
      els
        .map((el) => ({
          text: (el.textContent || '').trim(),
          className: el.getAttribute('class'),
          role: el.getAttribute('role'),
          tag: el.tagName,
          html: (el.outerHTML || '').slice(0, 400),
        }))
        .filter((item) => /Estado de cuenta|Movimientos|Diferido|Bloqueado/i.test(item.text))
        .slice(0, 40)
    );

    console.log(JSON.stringify(tabCandidates, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil inspect movement tabs falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
