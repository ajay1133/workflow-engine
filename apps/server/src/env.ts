import { z } from 'zod';
import { DEFAULTS, ENV_KEYS } from './constants';

function emptyStringToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}

function parseBooleanEnv(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (normalized === '') return undefined;

  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;

  return value;
}

const envSchema = z.object({
  [ENV_KEYS.port]: z.coerce.number().int().positive().default(DEFAULTS.port),
  [ENV_KEYS.nodeEnv]: z.enum(['development', 'test', 'production']).default('development'),
  [ENV_KEYS.serveWebDist]: z.preprocess(parseBooleanEnv, z.boolean().optional().default(false)),
  [ENV_KEYS.publicBaseUrl]: z.string().url().default(DEFAULTS.publicBaseUrl),
  [ENV_KEYS.databaseUrl]: z.string().min(1),

  [ENV_KEYS.jwtSecret]: z.string().min(16),

  [ENV_KEYS.awsRegion]: z.string().min(1).default('us-east-1'),
  [ENV_KEYS.awsAccessKeyId]: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  [ENV_KEYS.awsSecretAccessKey]: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  [ENV_KEYS.sqsEndpoint]: z.preprocess(emptyStringToUndefined, z.string().url().optional()),

  [ENV_KEYS.sqsRequestQueueName]: z.string().min(1).default(DEFAULTS.sqsRequestQueueName),
  [ENV_KEYS.sqsReplyQueueName]: z.string().min(1).default(DEFAULTS.sqsReplyQueueName),

  [ENV_KEYS.workerEnabled]: z.preprocess(parseBooleanEnv, z.boolean().default(DEFAULTS.workerEnabled)),
  [ENV_KEYS.workerPollWaitSeconds]: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(DEFAULTS.workerPollWaitSeconds),
  [ENV_KEYS.workerVisibilityTimeoutSeconds]: z.coerce
    .number()
    .int()
    .min(1)
    .max(12 * 60 * 60)
    .default(DEFAULTS.workerVisibilityTimeoutSeconds),

  [ENV_KEYS.triggerSyncTimeoutMs]: z.coerce
    .number()
    .int()
    .min(500)
    .max(60_000)
    .default(DEFAULTS.triggerSyncTimeoutMs),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(processEnv: NodeJS.ProcessEnv): AppEnv {
  const parsed = envSchema.safeParse(processEnv);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${message}`);
  }
  return parsed.data;
}
