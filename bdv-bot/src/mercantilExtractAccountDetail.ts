import path from 'node:path';
import playwright from 'playwright';
import { mercantilConfig } from './mercantilConfig.js';
import { saveMercantilAccountDetail, uploadArtifacts } from './firebase.js';
import type { BdvArtifactRef, MercantilAccountDetailResult, MercantilMovement } from './types.js';
import { ensureDir, timestampSlug, writeJson } from './utils.js';

async function activateMovementsTab(page: playwright.Page): Promise<void> {
  const movementTab = page.locator('[role="tab"]').filter({ hasText: /^Movimientos$/i }).first();
  if (await movementTab.count()) {
    await movementTab.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(1200);
  }
}

function parseBsAmount(text: string): number | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/([\d.,]+)$/) || cleaned.match(/Bs\.\s*([\d.,]+)/i);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

async function extractMovementRows(page: playwright.Page): Promise<MercantilMovement[]> {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr[role="row"], .mat-mdc-row, .mdc-data-table__row'));
    return rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll('td[role="cell"], td, .mat-mdc-cell, .mdc-data-table__cell'))
          .map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean);

        if (cells.length < 4) return null;
        const [date, reference, description, amountText] = cells;
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return null;

        return {
          date,
          reference,
          description,
          amountText,
        };
      })
      .filter(Boolean) as Array<{ date: string; reference: string; description: string; amountText: string }>;
  }).then((rows) => rows.map((row) => ({
    date: row.date,
    reference: row.reference,
    description: row.description,
    amountBs: parseBsAmount(row.amountText),
  })));
}

async function main(): Promise<void> {
  await ensureDir(mercantilConfig.artifactsDir);
  const browser = await playwright.chromium.connectOverCDP(mercantilConfig.cdpUrl);

  try {
    const contexts = browser.contexts();
    const allPages = contexts.flatMap((context) => context.pages());
    const page = allPages.find((candidate) => /mercantilbanco\.com\/account\/account-detail/i.test(candidate.url()));

    if (!page) {
      throw new Error('No encontré una pestaña abierta en Detalle de cuenta de Mercantil.');
    }

    await page.bringToFront().catch(() => undefined);
    await page.waitForTimeout(1000);
    await activateMovementsTab(page);

    const compactText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const ownerLabel = compactText.match(/¡Hola,\s*([^!]+)!/i)?.[1]?.trim() || 'Mercantil Owner';
    const accountLabel = compactText.match(/Cuenta Corriente\s+[•*]+\d{4}/i)?.[0] || null;
    const monthLabel = compactText.match(/Movimientos del mes de\s+([A-Za-záéíóúÁÉÍÓÚ]+\s+\d{4})/i)?.[1] || null;
    const availableBalanceBs = parseBsAmount(compactText.match(/Disponible\s+Bs\.\s*[\d.,]+/i)?.[0] || '');
    const deferredBs = parseBsAmount(compactText.match(/Diferido:\s*Bs\.\s*[\d.,]+/i)?.[0] || '');
    const blockedBs = parseBsAmount(compactText.match(/Bloqueado:\s*Bs\.\s*[\d.,]+/i)?.[0] || '');
    const totalBs = parseBsAmount(compactText.match(/Total:\s*Bs\.\s*[\d.,]+/i)?.[0] || '');
    const movements = await extractMovementRows(page);

    const slug = timestampSlug();
    const screenshotPath = path.join(mercantilConfig.artifactsDir, `mercantil-account-detail-${slug}.png`);
    const jsonPath = path.join(mercantilConfig.artifactsDir, `mercantil-account-detail-${slug}.json`);

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const localArtifacts: BdvArtifactRef[] = [
      { kind: 'screenshot', fileName: path.basename(screenshotPath), relativePath: screenshotPath.replace(/\\/g, '/') },
      { kind: 'sync-json', fileName: path.basename(jsonPath), relativePath: jsonPath.replace(/\\/g, '/') },
    ];

    const result: MercantilAccountDetailResult = {
      capturedAt: new Date().toISOString(),
      ownerLabel,
      accountLabel,
      availableBalanceBs,
      balanceBreakdown: {
        deferredBs,
        blockedBs,
        totalBs,
      },
      monthLabel,
      movements,
      source: 'mercantil-cdp-manual',
      artifacts: [],
    };

    await writeJson(jsonPath, result);
    result.artifacts = await uploadArtifacts({
      provider: 'mercantil',
      ownerLabel,
      command: 'extract-account-detail',
      artifacts: localArtifacts,
    });

    const runId = await saveMercantilAccountDetail(result);

    console.log(JSON.stringify({
      ok: true,
      runId,
      result,
      screenshotPath,
      jsonPath,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Mercantil extract account detail falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
