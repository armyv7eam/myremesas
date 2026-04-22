import path from 'node:path';
import playwright from 'playwright';
import { mercantilConfig } from './mercantilConfig.js';
import { saveBankSyncRun, saveMercantilTransferResult, uploadArtifacts } from './firebase.js';
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

async function main(): Promise<void> {
  await ensureDir(mercantilConfig.artifactsDir);
  const browser = await playwright.chromium.connectOverCDP(mercantilConfig.cdpUrl);

  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => /mercantilbanco\.com\/transfer\/third/i.test(candidate.url()));
    if (!page) throw new Error('No encontré la pestaña de transferencia Mercantil.');

    await page.bringToFront().catch(() => undefined);
    await page.waitForTimeout(1000);
    await keepSessionAlive(page);

    const verification = await snapshot(page, 'mercantil-transfer-before-confirm');
    if (!/Verifica tu operaci[oó]n/i.test(verification.data.bodyText)) {
      throw new Error('La pantalla actual no está en el paso de verificación.');
    }

    const acceptButton = page.locator('button, span.pointer, [role="button"]').filter({ hasText: /^Aceptar$/i }).first();
    if (!(await acceptButton.count())) {
      throw new Error('No encontré el botón Aceptar en la verificación de la transferencia.');
    }

    await acceptButton.click({ force: true }).catch(async () => {
      await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('button, span.pointer, [role="button"]'));
        const button = nodes.find((node) => /^Aceptar$/i.test((node.textContent || '').trim())) as HTMLElement | undefined;
        button?.click();
      });
    });

    await page.waitForTimeout(5000);
    await keepSessionAlive(page);

    const resultSnap = await snapshot(page, 'mercantil-transfer-result');
    const bodyText = resultSnap.data.bodyText;

    if (!/transferencia fue exitosa/i.test(bodyText)) {
      const localArtifacts = buildLocalArtifacts([verification, resultSnap]);
      const artifacts = await uploadArtifacts({
        provider: 'mercantil',
        ownerLabel: 'Vanessa',
        command: 'confirm-transfer-failed',
        artifacts: localArtifacts,
      });
      const runId = await saveBankSyncRun({
        provider: 'mercantil',
        mode: 'manual_session',
        source: 'mercantil-cdp-manual',
        ownerLabel: 'Vanessa',
        status: 'failed',
        command: 'confirm-transfer',
        artifacts,
        errorMessage: 'No se detectó pantalla de éxito después de Aceptar.',
        summary: {
          payoutAlias: mercantilConfig.payout.alias,
          payoutLast4: mercantilConfig.payout.last4,
          amount: mercantilConfig.payout.amount,
        },
      });
      throw new Error(`No se detectó pantalla de éxito. Run: ${runId || 'sin-run'}`);
    }

    const reference = bodyText.match(/Nro\.\s*Referencia:\s*(\d+)/i)?.[1] || null;
    const beneficiaryLabel = bodyText.match(/A la cuenta\s+([^]+?)\s+Transferido/i)?.[1]?.replace(/\s+/g, ' ').trim() || null;
    const sourceAccountLabel = bodyText.match(/Desde mi cuenta\s+([^]+?)\s+Concepto/i)?.[1]?.replace(/\s+/g, ' ').trim() || null;
    const amountBs = parseBsAmount(bodyText.match(/Transferido \(Bs\.\)\s*([\d.,]+)/i)?.[0] || mercantilConfig.payout.amount);
    const concept = bodyText.match(/Concepto\s+([^]+?)\s+Fecha y hora/i)?.[1]?.replace(/\s+/g, ' ').trim() || mercantilConfig.payout.concept || null;
    const executedAtLabel = bodyText.match(/Fecha y hora\s+([^]+?)\s+Resumen financiero/i)?.[1]?.replace(/\s+/g, ' ').trim() || null;

    const localArtifacts = buildLocalArtifacts([verification, resultSnap]);
    const artifacts = await uploadArtifacts({
      provider: 'mercantil',
      ownerLabel: 'Vanessa',
      command: 'confirm-transfer',
      artifacts: localArtifacts,
    });

    const result: MercantilTransferResult = {
      capturedAt: new Date().toISOString(),
      ownerLabel: 'Vanessa',
      beneficiaryLabel,
      beneficiaryAlias: mercantilConfig.payout.alias,
      beneficiaryLast4: mercantilConfig.payout.last4,
      sourceAccountLabel,
      amountBs,
      concept,
      reference,
      executedAtLabel,
      source: 'mercantil-cdp-manual',
      artifacts,
    };

    const runId = await saveMercantilTransferResult(result);

    console.log(JSON.stringify({
      ok: true,
      runId,
      result,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil confirm transfer falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
