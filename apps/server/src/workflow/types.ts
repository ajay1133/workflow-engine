import type { WorkflowStep } from '@workflow/shared';

export type WorkflowRecord = {
  id: string;
  name: string;
  enabled: boolean;
  triggerPath: string;
  steps: WorkflowStep[];
  createdAt: Date;
  updatedAt: Date;
};

export const RUN_STATUS = {
  running: 'running',
  success: 'success',
  skipped: 'skipped',
  failed: 'failed',
} as const;

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];
