import path from 'node:path';
import playwright from 'playwright';
import { botConfig } from './config.js';
import { selectors } from './selectors.js';
import type { BdvAccountSnapshot, BdvArtifactRef, BdvSyncResult } from './types.js';
import { ensureDir, timestampSlug, writeJson, writeText } from './utils.js';

type Browser = Awaited<ReturnType<typeof playwright.chromium.launch>>;
type BrowserContext = Awaited<ReturnType<Browser['newContext']>>;
type Page = Awaited<ReturnType<BrowserContext['newPage']>>;

async function firstVisible(page: Page, selectorList: string[]) {
  for (const selector of selectorList) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      return locator;
    }
  }

  throw new Error(`No se encontró ninguno de los selectores esperados: ${selectorList.join(', ')}`);
}

export class BdvClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private artifacts: BdvArtifactRef[] = [];

  private trackArtifact(kind: BdvArtifactRef['kind'], filePath: string): void {
    this.artifacts.push({
      kind,
      fileName: path.basename(filePath),
      relativePath: filePath.replace(/\\/g, '/'),
    });
  }

  async open(): Promise<void> {
    await ensureDir(botConfig.artifactsDir);
    await ensureDir(path.dirname(botConfig.storageStatePath));

    this.browser = await playwright.chromium.launch({
      headless: botConfig.headless,
      slowMo: botConfig.headless ? 0 : botConfig.slowMoMs,
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 1024 },
    });

    this.context.setDefaultTimeout(botConfig.timeoutMs);

    if (botConfig.traceOn) {
      await this.context.tracing.start({ screenshots: true, snapshots: true });
    }

    this.page = await this.context.newPage();
  }

  async close(): Promise<void> {
    if (this.context && botConfig.traceOn) {
      const tracePath = path.join(botConfig.artifactsDir, `bdv-trace-${timestampSlug()}.zip`);
      await this.context.tracing.stop({ path: tracePath }).then(() => {
        this.trackArtifact('trace', tracePath);
      }).catch(() => undefined);
    }
    await this.context?.close();
    await this.browser?.close();
  }

  private getPage(): Page {
    if (!this.page) throw new Error('El navegador no esta inicializado.');
    return this.page;
  }

  async login(): Promise<void> {
    const page = this.getPage();
    try {
      await page.goto(botConfig.loginUrl, { waitUntil: 'domcontentloaded', timeout: botConfig.timeoutMs });

      const usernameInput = await firstVisible(page, selectors.usernameInput);
      await usernameInput.click();
      await usernameInput.fill(botConfig.username);

      const enterButton = await firstVisible(page, selectors.enterButton);
      await enterButton.click();

      const passwordInput = await firstVisible(page, selectors.passwordInput);
      await passwordInput.click();
      await passwordInput.fill(botConfig.password);

      const continueButton = await firstVisible(page, selectors.continueButton);
      await continueButton.click();

      await Promise.race(
        selectors.dashboardMarker.map((selector) => page.waitForSelector(selector, { timeout: botConfig.timeoutMs }))
      );

      const screenshotPath = path.join(botConfig.artifactsDir, `bdv-dashboard-${timestampSlug()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      this.trackArtifact('screenshot', screenshotPath);
      await this.context?.storageState({ path: botConfig.storageStatePath });
    } catch (error) {
      await this.captureFailureArtifacts('login');
      throw error;
    }
  }

  async captureFailureArtifacts(step: string): Promise<BdvArtifactRef[]> {
    const page = this.getPage();
    const slug = `${step}-${timestampSlug()}`;
    const screenshotPath = path.join(botConfig.artifactsDir, `${slug}.png`);
    const htmlPath = path.join(botConfig.artifactsDir, `${slug}.html`);
    const metaPath = path.join(botConfig.artifactsDir, `${slug}.meta.json`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).then(() => {
      this.trackArtifact('screenshot', screenshotPath);
    }).catch(() => undefined);
    await writeText(htmlPath, await page.content()).then(() => {
      this.trackArtifact('html', htmlPath);
    }).catch(() => undefined);
    await writeJson(metaPath, {
      step,
      url: page.url(),
      title: await page.title().catch(() => ''),
      capturedAt: new Date().toISOString(),
    }).then(() => {
      this.trackArtifact('meta', metaPath);
    }).catch(() => undefined);
    return this.artifacts;
  }

  async extractAccounts(): Promise<BdvAccountSnapshot[]> {
    const page = this.getPage();
    await firstVisible(page, selectors.accountSectionHeader);

    let rowLocator = page.locator(selectors.accountRows[0]);
    let rowCount = await rowLocator.count();
    for (const selector of selectors.accountRows.slice(1)) {
      if (rowCount > 0) break;
      rowLocator = page.locator(selector);
      rowCount = await rowLocator.count();
    }

    const accounts: BdvAccountSnapshot[] = [];

    for (let index = 0; index < rowCount; index += 1) {
      const row = rowLocator.nth(index);
      const rowText = (await row.textContent())?.trim() || '';
      if (!rowText || !/cuenta/i.test(rowText)) continue;

      const pieces = rowText.split(/\s+/).filter(Boolean);
      const maskedAccount = pieces.find((piece: string) => piece.includes('*')) || '';
      const description = rowText.replace(maskedAccount, '').replace(/\s+/g, ' ').trim();
      const icons = row.locator('svg, i, mat-icon');
      const iconCount = await icons.count();
      const saldoLabelCount = await row.locator('text=/saldo/i').count();

      accounts.push({
        description,
        maskedAccount,
        movementActionVisible: iconCount >= 1,
        balanceVisible: rowText.toLowerCase().includes('saldo') || saldoLabelCount > 0,
      });
    }

    if (accounts.length === 0) {
      throw new Error('No se pudieron extraer cuentas visibles. Hay que ajustar selectores con el HTML real.');
    }

    return accounts;
  }

  async captureSyncResult(): Promise<BdvSyncResult> {
    const page = this.getPage();
    const headerText = (await page.locator('body').textContent()) || '';
    const ownerLabel = botConfig.expectedOwner || headerText.match(/Bienvenido\s+([^\n]+)/i)?.[1]?.trim() || 'BDV Owner';

    return {
      capturedAt: new Date().toISOString(),
      ownerLabel,
      accounts: await this.extractAccounts(),
      source: 'bdv-playwright',
      artifacts: this.artifacts,
    };
  }

  async persistLocalResult(result: BdvSyncResult): Promise<string> {
    const filePath = path.join(botConfig.artifactsDir, `bdv-sync-${timestampSlug()}.json`);
    await writeJson(filePath, result);
    this.trackArtifact('sync-json', filePath);
    return filePath;
  }

  getArtifacts(): BdvArtifactRef[] {
    return [...this.artifacts];
  }
}
