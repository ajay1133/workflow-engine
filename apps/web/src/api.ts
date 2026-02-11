import { API_PATHS, getApiBaseUrl } from './constants';
import { getAuthToken } from './auth';
import type { Workflow, WorkflowRun, WorkflowRunListItem } from './types';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const token = getAuthToken();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 2000)}`);
  }
}

export async function login(input: { email: string; password: string }): Promise<{ token: string; user: { id: string; email: string; is_admin: boolean } }> {
  return http<{ token: string; user: { id: string; email: string; is_admin: boolean } }>(`${API_PATHS.auth}/login`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function signup(input: { email: string; password: string; confirmPassword: string }): Promise<{ token: string; user: { id: string; email: string; is_admin: boolean } }> {
  return http<{ token: string; user: { id: string; email: string; is_admin: boolean } }>(`${API_PATHS.auth}/signup`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listWorkflows(): Promise<Workflow[]> {
  return http<Workflow[]>(API_PATHS.workflows);
}

export async function getWorkflowDefaults(): Promise<{ id: string; name: string }> {
  return http<{ id: string; name: string }>(API_PATHS.workflowsDefaults);
}

export async function getWorkflow(id: string): Promise<Workflow> {
  return http<Workflow>(API_PATHS.workflowById(id));
}

export async function createWorkflow(input: {
  id?: string;
  name: string;
  enabled: boolean;
  steps: unknown;
}): Promise<Workflow> {
  return http<Workflow>(API_PATHS.workflows, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateWorkflow(
  id: string,
  input: { name?: string; enabled?: boolean; steps?: unknown },
): Promise<Workflow> {
  return http<Workflow>(API_PATHS.workflowById(id), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteWorkflow(id: string): Promise<void> {
  await http<void>(API_PATHS.workflowById(id), { method: 'DELETE' });
}

export async function listRuns(workflowId: string): Promise<WorkflowRunListItem[]> {
  return http<WorkflowRunListItem[]>(API_PATHS.workflowRuns(workflowId));
}

export async function getRun(runId: string): Promise<WorkflowRun> {
  return http<WorkflowRun>(API_PATHS.runById(runId));
}

export async function triggerWorkflow(
  triggerPath: string,
  input: unknown,
): Promise<{ runId: string; status: string; error?: unknown | null; ctxFinal?: unknown | null; workflowExecutionSteps?: unknown | null }> {
  return http<{ runId: string; status: string; error?: unknown | null; ctxFinal?: unknown | null; workflowExecutionSteps?: unknown | null }>(
    triggerPath,
    {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
    },
  );
}

export async function testSlackWebhook(input: {
  url: string;
  text: string;
  timeoutMs?: number;
  retries?: number;
}): Promise<{
  ok: boolean;
  status: number;
  bodyText: string;
  attempts: number;
  retriesUsed: number;
  error?: { name?: string; message: string };
  usedEnvDefault?: boolean;
}> {
  return http<{
    ok: boolean;
    status: number;
    bodyText: string;
    attempts: number;
    retriesUsed: number;
    error?: { name?: string; message: string };
    usedEnvDefault?: boolean;
  }>(API_PATHS.slackTest, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
