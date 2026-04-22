import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const mercantilEnvSchema = z.object({
  MERCANTIL_USERNAME: z.string().min(1, 'MERCANTIL_USERNAME es requerido'),
  MERCANTIL_PASSWORD: z.string().min(1, 'MERCANTIL_PASSWORD es requerido'),
  MERCANTIL_HEADLESS: z.string().optional().default('false'),
  MERCANTIL_LOGIN_URL: z.string().url().default('https://www30.mercantilbanco.com/login'),
  MERCANTIL_STORAGE_STATE_PATH: z.string().default('.auth/mercantil-storage-state.json'),
  MERCANTIL_ARTIFACTS_DIR: z.string().default('artifacts/mercantil'),
  MERCANTIL_TIMEOUT_MS: z.string().optional().default('45000'),
  MERCANTIL_SLOW_MO_MS: z.string().optional().default('250'),
  MERCANTIL_TRACE_ON: z.string().optional().default('true'),
  MERCANTIL_LOCALE: z.string().optional().default('es-VE'),
  MERCANTIL_TIMEZONE: z.string().optional().default('America/Caracas'),
  MERCANTIL_USER_AGENT: z.string().optional().default(''),
  MERCANTIL_USE_MOBILE: z.string().optional().default('true'),
  MERCANTIL_BROWSER_EXECUTABLE: z.string().optional().default('C:/Program Files/Google/Chrome/Application/chrome.exe'),
  MERCANTIL_PERSISTENT_PROFILE_DIR: z.string().optional().default('.auth/mercantil-chrome-profile'),
  MERCANTIL_CDP_URL: z.string().optional().default('http://127.0.0.1:9222'),
  MERCANTIL_PAYOUT_ALIAS: z.string().optional().default('Emma Quintero'),
  MERCANTIL_PAYOUT_LAST4: z.string().optional().default('2823'),
  MERCANTIL_PAYOUT_CONCEPT: z.string().optional().default('pago'),
  MERCANTIL_PAYOUT_AMOUNT: z.string().optional().default('0.01'),
  MERCANTIL_SECURITY_BEST_FRIEND: z.string().optional().default(''),
  MERCANTIL_SECURITY_SPOUSE_ID_LAST4: z.string().optional().default(''),
  MERCANTIL_SECURITY_FATHER_PROFESSION: z.string().optional().default(''),
  MERCANTIL_SECURITY_MET_SPOUSE: z.string().optional().default(''),
  MERCANTIL_SECURITY_MET_SPOUSE_YEAR: z.string().optional().default(''),
});

const parsed = mercantilEnvSchema.parse(process.env);

export const mercantilConfig = {
  username: parsed.MERCANTIL_USERNAME,
  password: parsed.MERCANTIL_PASSWORD,
  loginUrl: parsed.MERCANTIL_LOGIN_URL,
  headless: parsed.MERCANTIL_HEADLESS === 'true',
  storageStatePath: parsed.MERCANTIL_STORAGE_STATE_PATH,
  artifactsDir: parsed.MERCANTIL_ARTIFACTS_DIR,
  timeoutMs: Number(parsed.MERCANTIL_TIMEOUT_MS || 45000),
  slowMoMs: Number(parsed.MERCANTIL_SLOW_MO_MS || 250),
  traceOn: parsed.MERCANTIL_TRACE_ON === 'true',
  locale: parsed.MERCANTIL_LOCALE,
  timezoneId: parsed.MERCANTIL_TIMEZONE,
  userAgent: parsed.MERCANTIL_USER_AGENT.trim() || 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
  useMobile: parsed.MERCANTIL_USE_MOBILE === 'true',
  browserExecutablePath: parsed.MERCANTIL_BROWSER_EXECUTABLE.trim(),
  persistentProfileDir: parsed.MERCANTIL_PERSISTENT_PROFILE_DIR.trim(),
  cdpUrl: parsed.MERCANTIL_CDP_URL.trim(),
  payout: {
    alias: parsed.MERCANTIL_PAYOUT_ALIAS.trim(),
    last4: parsed.MERCANTIL_PAYOUT_LAST4.trim(),
    concept: parsed.MERCANTIL_PAYOUT_CONCEPT.trim(),
    amount: parsed.MERCANTIL_PAYOUT_AMOUNT.trim(),
  },
  securityAnswers: {
    bestFriend: parsed.MERCANTIL_SECURITY_BEST_FRIEND.trim(),
    spouseIdLast4: parsed.MERCANTIL_SECURITY_SPOUSE_ID_LAST4.trim(),
    fatherProfession: parsed.MERCANTIL_SECURITY_FATHER_PROFESSION.trim(),
    metSpouse: parsed.MERCANTIL_SECURITY_MET_SPOUSE.trim(),
    metSpouseYear: parsed.MERCANTIL_SECURITY_MET_SPOUSE_YEAR.trim(),
  },
};
