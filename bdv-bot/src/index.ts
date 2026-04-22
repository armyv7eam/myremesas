import { BdvClient } from './bdvClient.js';
import {
  claimPendingRetryRequest,
  completeRetryRequest,
  saveSyncFailure,
  saveSyncResult,
  uploadArtifacts,
} from './firebase.js';
import { botConfig } from './config.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeAttempt(command: 'login' | 'sync' | 'process-request', ownerLabel?: string) {
  const client = new BdvClient();
  const resolvedOwner = ownerLabel || botConfig.expectedOwner || 'Ender';

  try {
    await client.open();
    await client.login();

    if (command === 'login') {
      await client.close();
      const artifacts = await uploadArtifacts({
        ownerLabel: resolvedOwner,
        command,
        artifacts: client.getArtifacts(),
      });
      console.log('Login completado. Revisa artifacts/ para validar el flujo.');
      return { ok: true, runId: null, artifacts };
    }

    const result = await client.captureSyncResult();
    result.ownerLabel = resolvedOwner;
    const filePath = await client.persistLocalResult(result);
    await client.close();
    result.artifacts = await uploadArtifacts({
      ownerLabel: resolvedOwner,
      command,
      artifacts: client.getArtifacts(),
    });
    const runId = await saveSyncResult(result);

    console.log(JSON.stringify({
      ok: true,
      runId,
      filePath,
      accountCount: result.accounts.length,
      ownerLabel: result.ownerLabel,
    }, null, 2));

    return { ok: true, runId, artifacts: result.artifacts };
  } catch (error) {
    console.error('BDV bot fallo:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }

    await client.close().catch(() => undefined);
    const artifacts = await uploadArtifacts({
      ownerLabel: resolvedOwner,
      command,
      artifacts: client.getArtifacts(),
    });

    const runId = await saveSyncFailure({
      command,
      ownerLabel: resolvedOwner,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      artifacts,
    }).catch((saveError) => {
      console.error('No se pudo guardar el fallo en Firestore:', saveError);
      return null;
    });

    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      runId,
      artifacts,
    });
  }
}

async function processSingleRequest(): Promise<boolean> {
  const request = await claimPendingRetryRequest();
  if (!request) {
    console.log('No hay solicitudes BDV pendientes.');
    return false;
  }

  console.log(`Procesando solicitud BDV ${request.id} para ${request.ownerLabel}...`);

  try {
    const result = await executeAttempt('process-request', request.ownerLabel);
    await completeRetryRequest({
      requestId: request.id,
      status: 'completed',
      runId: result.runId,
    });
    console.log(`Solicitud ${request.id} completada.`);
  } catch (error) {
    await completeRetryRequest({
      requestId: request.id,
      status: 'failed',
      runId: typeof error === 'object' && error && 'runId' in error ? String((error as { runId?: string | null }).runId || '') : null,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    console.error(`Solicitud ${request.id} falló.`);
  }

  return true;
}

async function main(): Promise<void> {
  const command = process.argv[2] || 'sync';

  if (command === 'worker') {
    console.log('BDV worker escuchando solicitudes cada 15 segundos...');
    while (true) {
      try {
        await processSingleRequest();
      } catch (error) {
        console.error('Error del loop worker BDV:', error instanceof Error ? error.message : error);
      }

      await sleep(15000);
    }
  }

  if (command === 'process-request') {
    const processed = await processSingleRequest();
    if (!processed) process.exitCode = 0;
    return;
  }

  await executeAttempt(command === 'login' ? 'login' : 'sync');
}

main().catch((error) => {
  console.error('BDV bot finalizó con error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
