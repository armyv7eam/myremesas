import { MercantilClient } from './mercantilClient.js';

async function main(): Promise<void> {
  const client = new MercantilClient();
  const mode = process.argv[2] || 'default';

  try {
    await client.open(mode === 'persistent');
    await client.login();
    console.log(`Login Mercantil completado (${mode}). Revisa artifacts/mercantil para validar el flujo.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('Mercantil bot falló:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
