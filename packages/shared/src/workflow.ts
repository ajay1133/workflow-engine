export const WORKFLOW_RUN_STATUS = {
  success: 'success',
  skipped: 'skipped',
  failed: 'failed',
} as const;

export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUS)[keyof typeof WORKFLOW_RUN_STATUS];

export const STEP_TYPE = {
  filter: 'filter',
  transform: 'transform',
  http_request: 'http_request',
} as const;

export type StepType = (typeof STEP_TYPE)[keyof typeof STEP_TYPE];
