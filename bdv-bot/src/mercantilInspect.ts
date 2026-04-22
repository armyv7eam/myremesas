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
    await page.waitForTimeout(8000);

    const url = page.url();
    const title = await page.title();
    const bodyText = ((await page.locator('body').innerText()).replace(/\s+/g, ' ')).slice(0, 4000);
    const buttons = await page.locator('button, a, [role="button"]').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()).filter(Boolean).slice(0, 80)
    );

    console.log(JSON.stringify({ url, title, bodyText, buttons }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil inspect falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
