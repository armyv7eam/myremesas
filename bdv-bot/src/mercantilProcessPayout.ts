import path from 'node:path';
import playwright from 'playwright';
import { mercantilConfig } from './mercantilConfig.js';
import { claimPendingMercantilPayoutOrder, completeMercantilPayoutOrder, saveBankSyncRun, saveMercantilTransferResult, uploadArtifacts } from './firebase.js';
import type { BdvArtifactRef, MercantilTransferResult } from './types.js';
import { ensureDir, timestampSlug, writeJson } from './utils.js';

function parseBsAmount(text: string): number | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/([\d.,]+)$/) || cleaned.match(/Bs\.\s*([\d.,]+)/i);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

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

function buildLocalArtifacts(paths: { screenshotPath: string; jsonPath: string }[]): BdvArtifactRef[] {
  return paths.flatMap(({ screenshotPath, jsonPath }) => ([
    { kind: 'screenshot' as const, fileName: path.basename(screenshotPath), relativePath: screenshotPath.replace(/\\/g, '/') },
    { kind: 'sync-json' as const, fileName: path.basename(jsonPath), relativePath: jsonPath.replace(/\\/g, '/') },
  ]));
}

async function clickButton(page: playwright.Page, text: RegExp): Promise<boolean> {
  const button = page.locator('button, span.pointer, [role="button"]').filter({ hasText: text }).first();
  if (await button.count()) {
    await button.click({ force: true }).catch(async () => {
      await page.evaluate((patternSource) => {
        const regex = new RegExp(patternSource, 'i');
        const nodes = Array.from(document.querySelectorAll('button, span.pointer, [role="button"]'));
        const target = nodes.find((node) => regex.test((node.textContent || '').trim())) as HTMLElement | undefined;
        target?.click();
      }, text.source);
    });
    return true;
  }
  return false;
}

async function processOrder(): Promise<boolean> {
  const order = await claimPendingMercantilPayoutOrder();
  if (!order) {
    console.log('No hay payout_orders Mercantil pendientes.');
    return false;
  }

  await ensureDir(mercantilConfig.artifactsDir);
  const browser = await playwright.chromium.connectOverCDP(mercantilConfig.cdpUrl);

  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => /mercantilbanco\.com\/transfer\/third/i.test(candidate.url()));
    if (!page) throw new Error('No encontré la pestaña de transferencia Mercantil abierta.');

    await page.bringToFront().catch(() => undefined);
    await page.waitForTimeout(1000);
    await keepSessionAlive(page);

    const currentText = ((await page.locator('body').innerText()).replace(/\s+/g, ' ')).trim();
    let preVerification;

    if (!/Verifica tu operaci[oó]n/i.test(currentText)) {
      const amountInput = page.locator('#mat-input-6').first();
      await amountInput.fill('');
      await amountInput.fill(String(order.amountBs));

      const conceptInput = page.locator('#mat-input-7').first();
      if (await conceptInput.count()) {
        await conceptInput.fill('');
        await conceptInput.fill(order.concept);
      }

      preVerification = await snapshot(page, 'mercantil-payout-prepared');
      const continued = await clickButton(page, /^Continuar$/i);
      if (!continued) throw new Error('No encontré el botón Continuar.');
      await page.waitForTimeout(3000);
      await keepSessionAlive(page);
    } else {
      preVerification = await snapshot(page, 'mercantil-payout-verification-open');
    }

    const verification = await snapshot(page, 'mercantil-payout-verification');
    if (!/Verifica tu operaci[oó]n/i.test(verification.data.bodyText)) {
      throw new Error('No llegué a la pantalla de verificación del payout.');
    }

    const accepted = await clickButton(page, /^Aceptar$/i);
    if (!accepted) throw new Error('No encontré el botón Aceptar.');

    await page.waitForTimeout(5000);
    await keepSessionAlive(page);

    const resultSnap = await snapshot(page, 'mercantil-payout-result');
    const bodyText = resultSnap.data.bodyText;
    const localArtifacts = buildLocalArtifacts([preVerification, verification, resultSnap]);

    if (!/transferencia fue exitosa/i.test(bodyText)) {
      const artifacts = await uploadArtifacts({ provider: 'mercantil', ownerLabel: 'Vanessa', command: 'process-payout-failed', artifacts: localArtifacts });
      const runId = await saveBankSyncRun({
        provider: 'mercantil',
        mode: 'manual_session',
        source: 'mercantil-cdp-manual',
        ownerLabel: 'Vanessa',
        status: 'failed',
        command: 'process-payout',
        artifacts,
        errorMessage: 'No se detectó pantalla de éxito después de Aceptar.',
        summary: {
          payoutOrderId: order.id,
          beneficiaryAlias: order.beneficiaryAlias,
          beneficiaryLast4: order.beneficiaryLast4,
          amountBs: order.amountBs,
        },
      });
      await completeMercantilPayoutOrder({ orderId: order.id, status: 'failed', runId, errorMessage: 'No se detectó pantalla de éxito después de Aceptar.' });
      throw new Error(`No se detectó pantalla de éxito. Run: ${runId || 'sin-run'}`);
    }

    const reference = bodyText.match(/Nro\.\s*Referencia:\s*(\d+)/i)?.[1] || null;
    const beneficiaryLabel = bodyText.match(/A la cuenta\s+([^]+?)\s+Transferido/i)?.[1]?.replace(/\s+/g, ' ').trim() || null;
    const sourceAccountLabel = bodyText.match(/Desde mi cuenta\s+([^]+?)\s+Concepto/i)?.[1]?.replace(/\s+/g, ' ').trim() || null;
    const amountBs = parseBsAmount(bodyText.match(/Transferido \(Bs\.\)\s*([\d.,]+)/i)?.[0] || String(order.amountBs));
    const concept = bodyText.match(/Concepto\s+([^]+?)\s+Fecha y hora/i)?.[1]?.replace(/\s+/g, ' ').trim() || order.concept || null;
    const executedAtLabel = bodyText.match(/Fecha y hora\s+([^]+?)\s+Resumen financiero/i)?.[1]?.replace(/\s+/g, ' ').trim() || null;

    const artifacts = await uploadArtifacts({ provider: 'mercantil', ownerLabel: 'Vanessa', command: 'process-payout', artifacts: localArtifacts });
    const result: MercantilTransferResult = {
      capturedAt: new Date().toISOString(),
      ownerLabel: 'Vanessa',
      beneficiaryLabel,
      beneficiaryAlias: order.beneficiaryAlias || mercantilConfig.payout.alias,
      beneficiaryLast4: order.beneficiaryLast4 || mercantilConfig.payout.last4,
      sourceAccountLabel,
      amountBs,
      concept,
      reference,
      executedAtLabel,
      source: 'mercantil-cdp-manual',
      artifacts,
    };

    const runId = await saveMercantilTransferResult(result);
    await completeMercantilPayoutOrder({ orderId: order.id, status: 'completed', runId, reference });

    console.log(JSON.stringify({ ok: true, orderId: order.id, runId, result }, null, 2));
    return true;
  } finally {
    await browser.close();
  }
}

processOrder().catch((error) => {
  console.error('Mercantil process payout falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
