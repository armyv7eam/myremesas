import { chromium } from 'playwright';

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: '.auth/mercantil-storage-state.json',
    viewport: { width: 1440, height: 1024 },
  });
  const page = await context.newPage();

  try {
    await page.goto('https://www30.mercantilbanco.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000);

    const data = {
      url: page.url(),
      title: await page.title(),
      bodyText: ((await page.locator('body').innerText()).replace(/\s+/g, ' ')).slice(0, 6000),
      links: await page.locator('a, button, [role="button"], [routerlink]').evaluateAll((els) =>
        els
          .map((el) => ({
            text: (el.textContent || '').trim(),
            href: el.getAttribute('href'),
            router: el.getAttribute('routerlink'),
            cls: el.getAttribute('class'),
          }))
          .filter((x) => x.text)
          .slice(0, 120)
      ),
    };

    console.log(JSON.stringify(data, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil inspect session falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
