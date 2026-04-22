import { chromium } from 'playwright';
import 'dotenv/config';

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function resolveSecurityAnswer(questionText: string): string {
  const text = normalize(questionText);
  if (text.includes('mejor amig')) return process.env.MERCANTIL_SECURITY_BEST_FRIEND || '';
  if (text.includes('4 ultimos numeros') && text.includes('esposo')) return process.env.MERCANTIL_SECURITY_SPOUSE_ID_LAST4 || '';
  if (text.includes('profesion') && text.includes('padre')) return process.env.MERCANTIL_SECURITY_FATHER_PROFESSION || '';
  if (text.includes('donde conocio') && text.includes('esposo')) return process.env.MERCANTIL_SECURITY_MET_SPOUSE || '';
  return '';
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

  try {
    await page.goto(process.env.MERCANTIL_LOGIN_URL!, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#username').fill(process.env.MERCANTIL_USERNAME!);
    await page.locator('#password').fill(process.env.MERCANTIL_PASSWORD!);
    await page.getByRole('button', { name: /iniciar/i }).click();
    await page.waitForURL(/secure-access/, { timeout: 45000 });
    await page.waitForSelector('input[id^="mat-input-"]', { timeout: 45000 });

    const bodyText = await page.locator('body').innerText();
    const questionMatches = Array.from(bodyText.matchAll(/¿[^?]+\?/g)).map((match) => match[0]);
    const securityQuestions = questionMatches.filter((question) => {
      const normalized = normalize(question);
      return normalized.includes('mejor amig') || normalized.includes('ultimos numeros') || normalized.includes('profesion') || normalized.includes('donde conocio');
    });

    const inputs = page.locator('input[id^="mat-input-"]');
    for (let index = 0; index < Math.min(securityQuestions.length, await inputs.count()); index += 1) {
      await inputs.nth(index).fill(resolveSecurityAnswer(securityQuestions[index]));
    }

    const personalRadio = page.locator('#personal');
    if (await personalRadio.count()) {
      await personalRadio.evaluate((el: HTMLInputElement) => {
        el.checked = true;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    await inputs.nth(Math.min(1, (await inputs.count()) - 1)).press('Enter');
    await page.waitForTimeout(8000);

    const buttons = await page.locator('button, [role="button"], a, input[type="button"], input[type="submit"], .mdc-button, .mat-mdc-button, .mat-mdc-raised-button, .mat-mdc-unelevated-button, [tabindex]').evaluateAll((els) =>
      els.map((el) => ({
        text: (el.textContent || '').trim(),
        id: el.getAttribute('id'),
        value: el.getAttribute('value'),
        tag: el.tagName,
        className: el.getAttribute('class'),
      })).slice(0, 200)
    );

    const bodyTextAfter = ((await page.locator('body').innerText()).replace(/\s+/g, ' ')).slice(0, 5000);
    console.log(JSON.stringify({ url: page.url(), title: await page.title(), bodyTextAfter, buttons }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil inspect post-secure falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
