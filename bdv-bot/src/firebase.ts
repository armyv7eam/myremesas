import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { botConfig } from './config.js';
import type { BdvArtifactRef, BdvSyncResult, MercantilAccountDetailResult, MercantilTransferResult } from './types.js';

let initialized = false;

export interface BankSyncRequest {
  id: string;
  ownerLabel: string;
  requestedBy?: string;
  requestedByEmail?: string;
  status: string;
}

export interface PayoutOrderRecord {
  id: string;
  provider: string;
  sourceAccountId: string;
  payoutAccountId: string;
  amountBs: number;
  concept: string;
  beneficiaryAlias?: string;
  beneficiaryLast4?: string;
  status: string;
}

function initFirebase(): void {
  if (initialized || !botConfig.syncToFirestore) return;
  if (!botConfig.firebaseServiceAccountPath) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH es requerido para sincronizar a Firestore.');
  }

  // Carga explicita de credenciales para que el worker no dependa del entorno.
  const serviceAccount = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), botConfig.firebaseServiceAccountPath), 'utf8')
  );
  const resolvedProjectId = botConfig.firebaseProjectId || serviceAccount.project_id;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: resolvedProjectId,
    storageBucket: `${resolvedProjectId}.firebasestorage.app`,
  });
  initialized = true;
}

function getDb(): admin.firestore.Firestore {
  if (!botConfig.syncToFirestore) {
    throw new Error('BDV_SYNC_TO_FIRESTORE debe estar en true para usar requests del bot.');
  }

  initFirebase();
  return admin.firestore();
}

function getBucket() {
  initFirebase();
  return admin.storage().bucket();
}

export async function uploadArtifacts(params: {
  provider?: string;
  ownerLabel: string;
  command: string;
  artifacts: BdvArtifactRef[];
}): Promise<BdvArtifactRef[]> {
  if (!botConfig.syncToFirestore || params.artifacts.length === 0) return params.artifacts;

  const bucket = getBucket();
  const ownerSegment = params.ownerLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'owner';
  const providerSegment = (params.provider || 'bdv').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return Promise.all(params.artifacts.map(async (artifact) => {
    const absolutePath = path.resolve(process.cwd(), artifact.relativePath);
    if (!fs.existsSync(absolutePath)) return artifact;

    const storagePath = `${providerSegment}_bot_artifacts/${ownerSegment}/${params.command}/${Date.now()}-${artifact.fileName}`;
    const token = crypto.randomUUID();

    await bucket.upload(absolutePath, {
      destination: storagePath,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    return {
      ...artifact,
      storagePath,
    };
  }));
}

export async function saveBankSyncRun(params: {
  provider: string;
  mode: string;
  source: string;
  ownerLabel: string;
  status: 'captured' | 'failed';
  command?: string;
  capturedAt?: string;
  accounts?: unknown[];
  artifacts?: BdvArtifactRef[];
  errorMessage?: string;
  errorStack?: string;
  summary?: Record<string, unknown>;
  movements?: unknown[];
}): Promise<string | null> {
  if (!botConfig.syncToFirestore) return null;

  const db = getDb();
  const docRef = await db.collection('bank_sync_runs').add({
    provider: params.provider,
    mode: params.mode,
    source: params.source,
    ownerLabel: params.ownerLabel,
    status: params.status,
    command: params.command || null,
    capturedAt: params.capturedAt || null,
    accounts: params.accounts || [],
    artifacts: params.artifacts || [],
    errorMessage: params.errorMessage || null,
    errorStack: params.errorStack || null,
    summary: params.summary || null,
    movements: params.movements || [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

export async function saveSyncResult(result: BdvSyncResult): Promise<string | null> {
  return saveBankSyncRun({
    provider: 'bdv',
    mode: 'read_only',
    source: result.source,
    ownerLabel: result.ownerLabel,
    capturedAt: result.capturedAt,
    accounts: result.accounts,
    artifacts: result.artifacts || [],
    status: 'captured',
  });
}

export async function saveSyncFailure(params: {
  command: string;
  ownerLabel?: string;
  errorMessage: string;
  errorStack?: string;
  artifacts?: BdvArtifactRef[];
}): Promise<string | null> {
  return saveBankSyncRun({
    provider: 'bdv',
    mode: 'read_only',
    source: 'bdv-playwright',
    ownerLabel: params.ownerLabel || botConfig.expectedOwner || 'Ender',
    command: params.command,
    status: 'failed',
    errorMessage: params.errorMessage,
    errorStack: params.errorStack || undefined,
    artifacts: params.artifacts || [],
  });
}

export async function saveMercantilAccountDetail(result: MercantilAccountDetailResult): Promise<string | null> {
  return saveBankSyncRun({
    provider: 'mercantil',
    mode: 'manual_session',
    source: result.source,
    ownerLabel: result.ownerLabel,
    status: 'captured',
    capturedAt: result.capturedAt,
    artifacts: result.artifacts || [],
    summary: {
      accountLabel: result.accountLabel,
      availableBalanceBs: result.availableBalanceBs,
      balanceBreakdown: result.balanceBreakdown,
      monthLabel: result.monthLabel,
    },
    movements: result.movements,
  });
}

export async function saveMercantilTransferResult(result: MercantilTransferResult): Promise<string | null> {
  return saveBankSyncRun({
    provider: 'mercantil',
    mode: 'manual_session',
    source: result.source,
    ownerLabel: result.ownerLabel,
    status: 'captured',
    command: 'confirm-transfer',
    capturedAt: result.capturedAt,
    artifacts: result.artifacts || [],
    summary: {
      beneficiaryLabel: result.beneficiaryLabel,
      beneficiaryAlias: result.beneficiaryAlias,
      beneficiaryLast4: result.beneficiaryLast4,
      sourceAccountLabel: result.sourceAccountLabel,
      amountBs: result.amountBs,
      concept: result.concept,
      reference: result.reference,
      executedAtLabel: result.executedAtLabel,
    },
  });
}

export async function claimPendingRetryRequest(): Promise<BankSyncRequest | null> {
  const db = getDb();
  const requestsRef = db.collection('bank_sync_requests');

  return db.runTransaction(async (transaction) => {
    const pendingQuery = requestsRef
      .where('provider', '==', 'bdv')
      .where('status', '==', 'pending')
      .limit(1);

    const snapshot = await transaction.get(pendingQuery);
    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data();

    transaction.update(doc.ref, {
      status: 'processing',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      processorHost: os.hostname(),
      processorSource: 'bdv-bot',
    });

    return {
      id: doc.id,
      ownerLabel: String(data.ownerLabel || botConfig.expectedOwner || 'Ender'),
      requestedBy: String(data.requestedBy || ''),
      requestedByEmail: String(data.requestedByEmail || ''),
      status: 'processing',
    };
  });
}

export async function completeRetryRequest(params: {
  requestId: string;
  status: 'completed' | 'failed';
  runId?: string | null;
  errorMessage?: string;
}): Promise<void> {
  const db = getDb();
  await db.collection('bank_sync_requests').doc(params.requestId).update({
    status: params.status,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    bankSyncRunId: params.runId || null,
    errorMessage: params.errorMessage || null,
  });
}

export async function claimPendingMercantilPayoutOrder(): Promise<PayoutOrderRecord | null> {
  const db = getDb();
  const ordersRef = db.collection('payout_orders');

  return db.runTransaction(async (transaction) => {
    const pendingQuery = ordersRef
      .where('provider', '==', 'mercantil')
      .where('status', '==', 'pending')
      .limit(1);

    const snapshot = await transaction.get(pendingQuery);
    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data();

    transaction.update(doc.ref, {
      status: 'processing',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      processorHost: os.hostname(),
      processorSource: 'mercantil-bot',
    });

    return {
      id: doc.id,
      provider: String(data.provider || 'mercantil'),
      sourceAccountId: String(data.sourceAccountId || ''),
      payoutAccountId: String(data.payoutAccountId || ''),
      amountBs: Number(data.amountBs || 0),
      concept: String(data.concept || ''),
      beneficiaryAlias: String(data.beneficiaryAlias || ''),
      beneficiaryLast4: String(data.beneficiaryLast4 || ''),
      status: 'processing',
    };
  });
}

export async function completeMercantilPayoutOrder(params: {
  orderId: string;
  status: 'completed' | 'failed';
  runId?: string | null;
  reference?: string | null;
  errorMessage?: string;
}): Promise<void> {
  const db = getDb();
  await db.collection('payout_orders').doc(params.orderId).update({
    status: params.status,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    bankSyncRunId: params.runId || null,
    reference: params.reference || null,
    errorMessage: params.errorMessage || null,
  });
}
