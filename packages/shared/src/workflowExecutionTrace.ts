export type WorkflowExecutionStepTrace = {
  action: string;
  passed?: boolean;
  details?: unknown;
  output: Record<string, unknown>;
};

export type WorkflowExecutionTrace = {
  workflowExecutionSteps: WorkflowExecutionStepTrace[];
};
