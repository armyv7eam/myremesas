import path from 'node:path';
import { MercantilClient } from './mercantilClient.js';
import { writeText, timestampSlug } from './utils.js';

async function main(): Promise<void> {
  const client = new MercantilClient();

  try {
    await client.open();
    await client.login();

    const page = (client as unknown as { page?: { url(): string; title(): Promise<string>; locator(sel: string): { innerText(): Promise<string>; evaluateAll(fn: (els: Element[]) => unknown): Promise<unknown> }; content(): Promise<string> } }).page;
    if (!page) {
      throw new Error('No pude acceder a la página interna del cliente Mercantil para inspección.');
    }

    await new Promise((resolve) => setTimeout(resolve, 20000));

    const bodyText = ((await page.locator('body').innerText()).replace(/\s+/g, ' ')).slice(0, 6000);
    const htmlPath = path.join('artifacts', 'mercantil', `mercantil-after-login-${timestampSlug()}.html`);
    await writeText(htmlPath, await page.content());
    const clickables = await page.locator('a, button, [role="button"], [routerlink], span.pointer').evaluateAll((els) =>
      els
        .map((el) => ({
          text: (el.textContent || '').trim(),
          href: el.getAttribute('href'),
          router: el.getAttribute('routerlink'),
          cls: el.getAttribute('class'),
        }))
        .filter((x) => x.text)
        .slice(0, 120)
    );

    console.log(JSON.stringify({
      url: page.url(),
      title: await page.title(),
      bodyText,
      htmlPath,
      clickables,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('Mercantil inspect after login falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
