import { chromium } from 'playwright';
import 'dotenv/config';

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

  try {
    await page.goto(process.env.MERCANTIL_LOGIN_URL!, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#username').fill(process.env.MERCANTIL_USERNAME!);
    await page.locator('#password').fill(process.env.MERCANTIL_PASSWORD!);
    await page.getByRole('button', { name: /iniciar/i }).click();
    await page.waitForURL(/secure-access/, { timeout: 45000 });
    await page.waitForTimeout(3000);

    const inputs = await page.locator('input').evaluateAll((els) =>
      els.map((el) => ({
        type: el.getAttribute('type'),
        id: el.getAttribute('id'),
        name: el.getAttribute('name'),
        placeholder: el.getAttribute('placeholder'),
        className: el.getAttribute('class'),
      }))
    );

    const buttons = await page.locator('button, [role="button"], a').evaluateAll((els) =>
      els
        .map((el) => ({
          text: (el.textContent || '').trim(),
          id: el.getAttribute('id'),
          className: el.getAttribute('class'),
        }))
        .filter((x) => x.text)
        .slice(0, 100)
    );

    const labels = await page.locator('label, p, h1, h2, h3, span, div').evaluateAll((els) =>
      els
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 300)
    );

    console.log(JSON.stringify({ url: page.url(), inputs, buttons, labels }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil inspect secure falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
