import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  BDV_USERNAME: z.string().min(1, 'BDV_USERNAME es requerido'),
  BDV_PASSWORD: z.string().min(1, 'BDV_PASSWORD es requerido'),
  BDV_HEADLESS: z.string().optional().default('false'),
  BDV_LOGIN_URL: z.string().url().default('https://bdvenlinea.banvenez.com/'),
  BDV_STORAGE_STATE_PATH: z.string().default('.auth/bdv-storage-state.json'),
  BDV_ARTIFACTS_DIR: z.string().default('artifacts'),
  BDV_TIMEOUT_MS: z.string().optional().default('45000'),
  BDV_SLOW_MO_MS: z.string().optional().default('250'),
  BDV_TRACE_ON: z.string().optional().default('true'),
  BDV_EXPECTED_OWNER: z.string().optional().default(''),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional().default(''),
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  BDV_SYNC_TO_FIRESTORE: z.string().optional().default('false'),
});

const parsed = envSchema.parse(process.env);

export const botConfig = {
  username: parsed.BDV_USERNAME,
  password: parsed.BDV_PASSWORD,
  loginUrl: parsed.BDV_LOGIN_URL,
  headless: parsed.BDV_HEADLESS === 'true',
  storageStatePath: parsed.BDV_STORAGE_STATE_PATH,
  artifactsDir: parsed.BDV_ARTIFACTS_DIR,
  timeoutMs: Number(parsed.BDV_TIMEOUT_MS || 45000),
  slowMoMs: Number(parsed.BDV_SLOW_MO_MS || 250),
  traceOn: parsed.BDV_TRACE_ON === 'true',
  expectedOwner: parsed.BDV_EXPECTED_OWNER.trim(),
  syncToFirestore: parsed.BDV_SYNC_TO_FIRESTORE === 'true',
  firebaseServiceAccountPath: parsed.FIREBASE_SERVICE_ACCOUNT_PATH.trim(),
  firebaseProjectId: parsed.FIREBASE_PROJECT_ID.trim(),
};
