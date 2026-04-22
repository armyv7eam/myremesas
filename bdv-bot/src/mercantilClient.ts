import path from 'node:path';
import playwright from 'playwright';
import { mercantilConfig } from './mercantilConfig.js';
import { mercantilSelectors } from './mercantilSelectors.js';
import type { BdvArtifactRef } from './types.js';
import { ensureDir, timestampSlug, writeJson, writeText } from './utils.js';

type Browser = Awaited<ReturnType<typeof playwright.chromium.launch>>;
type BrowserContext = Awaited<ReturnType<Browser['newContext']>>;
type Page = Awaited<ReturnType<BrowserContext['newPage']>>;

async function firstVisible(page: Page, selectorList: string[]) {
  for (const selector of selectorList) {
    const locator = page.locator(selector).first();
    if (await locator.count()) return locator;
  }

  throw new Error(`No se encontró ninguno de los selectores esperados: ${selectorList.join(', ')}`);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export class MercantilClient {
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

  async open(usePersistentProfile = false): Promise<void> {
    await ensureDir(mercantilConfig.artifactsDir);
    await ensureDir(path.dirname(mercantilConfig.storageStatePath));

    const contextOptions = {
      viewport: mercantilConfig.useMobile ? { width: 510, height: 920 } : { width: 1440, height: 1024 },
      userAgent: mercantilConfig.userAgent,
      locale: mercantilConfig.locale,
      timezoneId: mercantilConfig.timezoneId,
      colorScheme: 'light' as const,
      isMobile: mercantilConfig.useMobile,
      hasTouch: mercantilConfig.useMobile,
      deviceScaleFactor: mercantilConfig.useMobile ? 2 : 1,
    };

    if (usePersistentProfile) {
      await ensureDir(mercantilConfig.persistentProfileDir);
      this.context = await playwright.chromium.launchPersistentContext(mercantilConfig.persistentProfileDir, {
        ...contextOptions,
        executablePath: mercantilConfig.browserExecutablePath,
        headless: mercantilConfig.headless,
        slowMo: mercantilConfig.headless ? 0 : mercantilConfig.slowMoMs,
      });
      this.page = this.context.pages()[0] || await this.context.newPage();
    } else {
      this.browser = await playwright.chromium.launch({
        headless: mercantilConfig.headless,
        slowMo: mercantilConfig.headless ? 0 : mercantilConfig.slowMoMs,
      });

      this.context = await this.browser.newContext(contextOptions);
      this.page = await this.context.newPage();
    }

    this.context.setDefaultTimeout(mercantilConfig.timeoutMs);
    await this.context.setExtraHTTPHeaders({
      'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
    });

    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'language', { get: () => 'es-VE' });
      Object.defineProperty(navigator, 'languages', { get: () => ['es-VE', 'es', 'en-US'] });
      Object.defineProperty(navigator, 'platform', { get: () => 'Linux armv8l' });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(window, 'chrome', { get: () => ({ runtime: {} }) });
    });

    if (mercantilConfig.traceOn) {
      await this.context.tracing.start({ screenshots: true, snapshots: true });
    }
  }

  async close(): Promise<void> {
    if (this.context && mercantilConfig.traceOn) {
      const tracePath = path.join(mercantilConfig.artifactsDir, `mercantil-trace-${timestampSlug()}.zip`);
      await this.context.tracing.stop({ path: tracePath }).then(() => {
        this.trackArtifact('trace', tracePath);
      }).catch(() => undefined);
    }

    await this.context?.close();
    await this.browser?.close();
  }

  private getPage(): Page {
    if (!this.page) throw new Error('El navegador de Mercantil no esta inicializado.');
    return this.page;
  }

  async login(): Promise<void> {
    const page = this.getPage();

    try {
      await page.goto(mercantilConfig.loginUrl, { waitUntil: 'domcontentloaded', timeout: mercantilConfig.timeoutMs });

      const usernameInput = await firstVisible(page, mercantilSelectors.usernameInput);
      await usernameInput.click();
      await usernameInput.fill(mercantilConfig.username);

      const passwordInput = await firstVisible(page, mercantilSelectors.passwordInput);
      await passwordInput.click();
      await passwordInput.fill(mercantilConfig.password);

      const submitButton = await firstVisible(page, mercantilSelectors.submitButton);
      await submitButton.click();

      await page.waitForTimeout(4000);
      await this.completeSecureAccessIfNeeded();

      await page.waitForTimeout(8000);
      const finalUrl = page.url();
      if (/\/login(?:$|\?)|\/secure-access(?:$|\?)/i.test(finalUrl)) {
        await this.captureDebugSnapshot('mercantil-login-not-authenticated');
        throw new Error(`Mercantil no completó la autenticación. URL final: ${finalUrl}`);
      }

      await Promise.race(
        mercantilSelectors.dashboardMarker.map((selector) => page.waitForSelector(selector, { timeout: mercantilConfig.timeoutMs }))
      );

      const screenshotPath = path.join(mercantilConfig.artifactsDir, `mercantil-dashboard-${timestampSlug()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      this.trackArtifact('screenshot', screenshotPath);
      await this.context?.storageState({ path: mercantilConfig.storageStatePath });
    } catch (error) {
      await this.captureFailureArtifacts('mercantil-login');
      throw error;
    }
  }

  private resolveSecurityAnswer(questionText: string): string {
    const text = normalize(questionText);

    if (text.includes('mejor amigo') || text.includes('mejor amiga')) {
      return mercantilConfig.securityAnswers.bestFriend;
    }
    if (text.includes('4 ultimos numeros') && text.includes('esposo')) {
      return mercantilConfig.securityAnswers.spouseIdLast4;
    }
    if (text.includes('profesion') && text.includes('padre')) {
      return mercantilConfig.securityAnswers.fatherProfession;
    }
    if (text.includes('donde conocio') && text.includes('esposo')) {
      return mercantilConfig.securityAnswers.metSpouse;
    }
    if ((text.includes('ano') || text.includes('año')) && text.includes('conocio') && text.includes('esposo')) {
      return mercantilConfig.securityAnswers.metSpouseYear;
    }

    return '';
  }

  private async fillSecureAccessInput(input: ReturnType<Page['locator']>, answer: string): Promise<void> {
    await input.focus().catch(() => undefined);
    await input.click({ clickCount: 3 }).catch(() => undefined);
    await input.press('Control+A').catch(() => undefined);
    await input.press('Backspace').catch(() => undefined);
    await input.type(answer, { delay: 120 }).catch(async () => {
      await input.fill(answer);
    });

    await input.evaluate((el: HTMLInputElement, value: string) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }, answer);

    const finalValue = await input.inputValue().catch(() => '');
    if (finalValue !== answer) {
      throw new Error(`No pude fijar correctamente la respuesta de seguridad en el input. Esperaba "${answer}" y obtuve "${finalValue}".`);
    }
  }

  private async captureSecurityFocusSnapshot(page: Page, step: string): Promise<void> {
    const slug = `${step}-${timestampSlug()}`;
    const debugPath = path.join(mercantilConfig.artifactsDir, `${slug}.debug.json`);
    const activeState = await page.evaluate(() => {
      const active = document.activeElement as HTMLInputElement | null;
      return {
        activeTag: active?.tagName || null,
        activeId: active?.id || null,
        activeType: active?.getAttribute('type') || null,
        activeClassName: active?.getAttribute('class') || null,
        activeValueLength: typeof active?.value === 'string' ? active.value.length : null,
      };
    }).catch(() => null);

    await writeJson(debugPath, {
      step,
      url: page.url(),
      title: await page.title().catch(() => ''),
      capturedAt: new Date().toISOString(),
      activeState,
      inputStates: await page.locator('input').evaluateAll((els) =>
        els.map((el) => ({
          id: el.getAttribute('id'),
          type: el.getAttribute('type'),
          valueAttribute: el.getAttribute('value'),
          valueLength: typeof (el as HTMLInputElement).value === 'string' ? (el as HTMLInputElement).value.length : null,
          ariaInvalid: el.getAttribute('aria-invalid'),
          className: el.getAttribute('class'),
        }))
      ).catch(() => []),
    });
  }

  private async ensurePersonalConnectionSelected(page: Page): Promise<void> {
    const personalRadio = page.locator('#personal');
    if (!(await personalRadio.count())) {
      return;
    }

    const personalContainer = page.locator('label[for="personal"], .radio-card, .mat-mdc-radio-button, .mdc-form-field').filter({ has: personalRadio }).first();

    await personalRadio.scrollIntoViewIfNeeded().catch(() => undefined);
    await personalRadio.click({ force: true }).catch(() => undefined);
    await personalContainer.click({ force: true }).catch(() => undefined);

    await personalRadio.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }).catch(() => undefined);

    const isChecked = await personalRadio.isChecked().catch(async () => {
      return personalRadio.evaluate((el: HTMLInputElement) => el.checked).catch(() => false);
    });

    if (!isChecked) {
      throw new Error('No pude seleccionar "Equipo de uso personal" en el acceso seguro de Mercantil.');
    }
  }

  async completeSecureAccessIfNeeded(): Promise<void> {
    const page = this.getPage();
    if (!/secure-access/i.test(page.url())) return;

    const bodyText = await page.locator('body').innerText();
    const normalizedBody = normalize(bodyText);
    if (!normalizedBody.includes('preguntas de seguridad')) return;

    await page.waitForSelector('input[id^="mat-input-"]', { timeout: mercantilConfig.timeoutMs });

    const questionMatches = Array.from(bodyText.matchAll(/¿[^?]+\?/g)).map((match) => match[0]);
    const securityQuestions = questionMatches.filter((question) => {
      const normalized = normalize(question);
      return normalized.includes('mejor amig') || normalized.includes('ultimos numeros') || normalized.includes('profesion') || normalized.includes('donde conocio');
    });

    const inputs = page.locator('input[id^="mat-input-"]');
    const inputCount = await inputs.count();
    if (inputCount < 2) {
      throw new Error('Mercantil secure-access no mostró los inputs esperados para preguntas de seguridad.');
    }

    const totalQuestions = Math.min(securityQuestions.length, inputCount);
    for (let index = 0; index < totalQuestions; index += 1) {
      const answer = this.resolveSecurityAnswer(securityQuestions[index]);
      if (!answer) {
        throw new Error(`No encontré respuesta configurada para la pregunta de seguridad: ${securityQuestions[index]}`);
      }

      const input = inputs.nth(index);
      await this.fillSecureAccessInput(input, answer);
      await page.waitForTimeout(250);

      if (index < totalQuestions - 1) {
        await input.press('Tab').catch(() => undefined);
        await page.waitForTimeout(350);
        await this.captureSecurityFocusSnapshot(page, `mercantil-secure-access-focus-${index + 1}`);
      }
    }

    await this.captureDebugSnapshot('mercantil-secure-access-filled');

    await this.ensurePersonalConnectionSelected(page);
    await this.captureDebugSnapshot('mercantil-secure-access-personal-selected');

    const submitCandidates = [
      page.getByRole('button', { name: /continuar|validar|ingresar|acceder/i }).first(),
      page.locator('span.pointer').filter({ hasText: /inicia tu sesion|inicia tu sesión/i }).first(),
      page.locator('button[type="submit"]').first(),
      page.locator('.mdc-button, .mat-mdc-raised-button, .mat-mdc-unelevated-button').first(),
    ];

    let submitted = false;
    for (const candidate of submitCandidates) {
      if (await candidate.count()) {
        await candidate.click().catch(() => undefined);
        submitted = true;
        break;
      }
    }

    if (!submitted) {
      await inputs.nth(Math.min(1, inputCount - 1)).press('Enter');
    }

    await page.waitForTimeout(5000);
    await this.captureDebugSnapshot('mercantil-post-secure-submit');
  }

  async captureDebugSnapshot(step: string): Promise<void> {
    const page = this.getPage();
    const slug = `${step}-${timestampSlug()}`;
    const debugPath = path.join(mercantilConfig.artifactsDir, `${slug}.debug.json`);

    const debugData = {
      step,
      url: page.url(),
      title: await page.title().catch(() => ''),
      capturedAt: new Date().toISOString(),
      bodyText: ((await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')).slice(0, 6000),
      inputStates: await page.locator('input').evaluateAll((els) =>
        els.map((el) => ({
          id: el.getAttribute('id'),
          type: el.getAttribute('type'),
          value: el.getAttribute('value'),
          ariaInvalid: el.getAttribute('aria-invalid'),
          className: el.getAttribute('class'),
        }))
      ).catch(() => []),
      clickables: await page.locator('button, a, [role="button"], span.pointer, [routerlink]').evaluateAll((els) =>
        els.map((el) => ({
          text: (el.textContent || '').trim(),
          id: el.getAttribute('id'),
          className: el.getAttribute('class'),
          href: el.getAttribute('href'),
        })).filter((x) => x.text).slice(0, 120)
      ).catch(() => []),
    };

    await writeJson(debugPath, debugData);
    this.trackArtifact('meta', debugPath);
  }

  async captureFailureArtifacts(step: string): Promise<BdvArtifactRef[]> {
    const page = this.getPage();
    const slug = `${step}-${timestampSlug()}`;
    const screenshotPath = path.join(mercantilConfig.artifactsDir, `${slug}.png`);
    const htmlPath = path.join(mercantilConfig.artifactsDir, `${slug}.html`);
    const metaPath = path.join(mercantilConfig.artifactsDir, `${slug}.meta.json`);

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

  getArtifacts(): BdvArtifactRef[] {
    return [...this.artifacts];
  }
}
