export type Workflow = {
  id: string;
  name: string;
  enabled: boolean;
  trigger?: {
    type: 'http';
  };
  triggerPath?: string;
  triggerUrl?: string;
  steps: unknown;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRunListItem = {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: unknown | null;
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  input: unknown;
  ctxFinal: unknown | null;
  executionTrace?: unknown | null;
  error: unknown | null;
};

