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

export const ACTION_TYPE = {
  filter_compare: 'filter.compare',
  transform_default_value: 'transform.default_value',
  transform_replace_template: 'transform.replace_template',
  transform_pick: 'transform.pick',
  send_http_request: 'send.http_request',
  if_start: 'if.start',
  if_end: 'if.end',
  while_start: 'while.start',
  while_end: 'while.end',
  create_or_update: 'create_or_update',
} as const;

export type ActionType = (typeof ACTION_TYPE)[keyof typeof ACTION_TYPE];
