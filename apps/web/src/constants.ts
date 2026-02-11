export const API_PATHS = {
  auth: '/api/auth',
  workflows: '/api/workflows',
  workflowById: (workflowId: string) => `/api/workflows/${encodeURIComponent(workflowId)}`,
  workflowsDefaults: '/api/workflows/defaults',
  workflowRuns: (workflowId: string) => `/api/workflows/${encodeURIComponent(workflowId)}/runs`,
  runById: (runId: string) => `/api/runs/${runId}`,
  slackTest: '/api/slack/test',
} as const;

export const DEFAULTS = {
  apiBaseUrl: '',
} as const;

export const ENV_KEYS = {
  apiBaseUrl: 'VITE_API_BASE_URL',
} as const;

declare const __VITE_API_BASE_URL__: string | undefined;

export function getApiBaseUrl(): string {
  const injected = typeof __VITE_API_BASE_URL__ === 'string' ? __VITE_API_BASE_URL__ : undefined;
  const nodeEnvValue = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.[ENV_KEYS.apiBaseUrl];
  return injected ?? nodeEnvValue ?? DEFAULTS.apiBaseUrl;
}
