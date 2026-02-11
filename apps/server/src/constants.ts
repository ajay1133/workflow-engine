export const API_PREFIX = '/api' as const;

export const ROUTES = {
  health: '/health',
  auth: `${API_PREFIX}/auth`,
  workflows: `${API_PREFIX}/workflows`,
  workflowById: `${API_PREFIX}/workflows/:id`,
  workflowRunsById: `${API_PREFIX}/workflows/:id/runs`,
  runById: `${API_PREFIX}/runs/:id`,
  trigger: '/t/:token',
} as const;

export const ENV_KEYS = {
  port: 'PORT',
  nodeEnv: 'NODE_ENV',
  publicBaseUrl: 'PUBLIC_BASE_URL',
  databaseUrl: 'DATABASE_URL',

  jwtSecret: 'JWT_SECRET',

  awsRegion: 'AWS_REGION',
  awsAccessKeyId: 'AWS_ACCESS_KEY_ID',
  awsSecretAccessKey: 'AWS_SECRET_ACCESS_KEY',
  sqsEndpoint: 'SQS_ENDPOINT',

  sqsRequestQueueName: 'SQS_REQUEST_QUEUE_NAME',
  sqsReplyQueueName: 'SQS_REPLY_QUEUE_NAME',

  workerEnabled: 'WORKER_ENABLED',
  workerPollWaitSeconds: 'WORKER_POLL_WAIT_SECONDS',
  workerVisibilityTimeoutSeconds: 'WORKER_VISIBILITY_TIMEOUT_SECONDS',

  triggerSyncTimeoutMs: 'TRIGGER_SYNC_TIMEOUT_MS',
} as const;

export const DEFAULTS = {
  port: 3000,
  publicBaseUrl: 'http://localhost:3000',
  sqsRequestQueueName: 'workflow-requests',
  sqsReplyQueueName: 'workflow-replies',
  workerEnabled: true,
  workerPollWaitSeconds: 10,
  workerVisibilityTimeoutSeconds: 30,

  triggerSyncTimeoutMs: 30000,
} as const;
