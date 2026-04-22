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
  };
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeJson(jsonPath, data);
  return { screenshotPath, jsonPath, data };
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

    if (!/\/transfer\/third/i.test(page.url())) {
      throw new Error('La pestaña actual no está en la pantalla de transferencias a otras cuentas Mercantil.');
    }

    const initialBodyText = ((await page.locator('body').innerText()).replace(/\s+/g, ' ')).trim();
    if (/Verifica tu operaci[oó]n/i.test(initialBodyText)) {
      const verification = await snapshot(page, 'mercantil-transfer-verification-already-open');
      console.log(JSON.stringify({
        ok: true,
        mode: 'prepare-only',
        payout: mercantilConfig.payout,
        message: 'La pantalla de verificación ya estaba abierta. No se ejecutó Aceptar.',
        verification,
      }, null, 2));
      return;
    }

    const accountSelect = page.locator('#mat-select-4').first();
    if (await accountSelect.count()) {
      const visibleText = ((await accountSelect.innerText()).replace(/\s+/g, ' ')).trim();
      const hasExpectedBeneficiary = visibleText.toLowerCase().includes(mercantilConfig.payout.alias.toLowerCase())
        || visibleText.includes(mercantilConfig.payout.last4);
      if (!hasExpectedBeneficiary) {
        throw new Error(`El beneficiario seleccionado no coincide con ${mercantilConfig.payout.alias} ****${mercantilConfig.payout.last4}.`);
      }
    }

    const amountInput = page.locator('#mat-input-6').first();
    await amountInput.fill('');
    await amountInput.fill(mercantilConfig.payout.amount);

    const conceptInput = page.locator('#mat-input-7').first();
    if (await conceptInput.count()) {
      await conceptInput.fill('');
      await conceptInput.fill(mercantilConfig.payout.concept);
    }

    const beforeContinue = await snapshot(page, 'mercantil-transfer-prepared');

    const continueButton = page.locator('button, span.pointer, [role="button"]').filter({ hasText: /^Continuar$/i }).first();
    if (!(await continueButton.count())) {
      throw new Error('No encontré el botón Continuar en la pantalla de transferencia.');
    }

    await continueButton.click({ force: true }).catch(async () => {
      await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('button, span.pointer, [role="button"]'));
        const button = nodes.find((node) => /^Continuar$/i.test((node.textContent || '').trim())) as HTMLElement | undefined;
        button?.click();
      });
    });

    await page.waitForTimeout(3000);
    await keepSessionAlive(page);

    const verification = await snapshot(page, 'mercantil-transfer-verification');

    const bodyText = verification.data.bodyText;
    const reachedVerification = /Verifica tu operaci[oó]n/i.test(bodyText) && bodyText.includes(mercantilConfig.payout.last4);
    if (!reachedVerification) {
      throw new Error('No llegué a la pantalla de verificación de la transferencia.');
    }

    console.log(JSON.stringify({
      ok: true,
      mode: 'prepare-only',
      payout: mercantilConfig.payout,
      message: 'Transferencia preparada hasta verificación. No se ejecutó Aceptar.',
      beforeContinue,
      verification,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil prepare transfer falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
