export type WorkflowRunResultStatus = 'success' | 'skipped' | 'failed';

export type QueueRunRequest = {
  kind: 'workflow_run_request';
  correlationId: string;
  runId: string;
  workflowId: string;
  triggerPath: string;
  input: unknown;
};

export type QueueRunResult = {
  kind: 'workflow_run_result';
  correlationId: string;
  runId: string;
  workflowId: string;
  status: WorkflowRunResultStatus;
  ctxFinal?: unknown;
  workflowExecutionSteps?: unknown;
  error?: {
    message: string;
    details?: unknown;
  };
  finishedAt: string; // ISO
};
