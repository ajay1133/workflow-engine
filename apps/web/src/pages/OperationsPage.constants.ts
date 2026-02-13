export type OperationDoc = {
  id:
    | 'filter'
    | 'transform'
    | 'http_request';
  title: string;
  kind: 'grouped-step';
  summary: string;
  usage: unknown;
  sampleInput: unknown;
  sampleWorkflowExecutionSteps: unknown;
};

export const OPERATIONS_PAGE_TEXT = {
  title: 'Operations',
  workflowsLink: 'Workflows',
  logout: 'Logout',
  intro: 'Built-in grouped steps supported by the workflow engine. A workflow runs steps in order and each step reads/writes ctx.',
  listLabel: 'List',
  usage: 'Usage (editable)',
  inputEditable: 'ctx (editable)',
  output: 'Output',
  invalidJsonPrefix: 'Invalid JSON:',
  sendHttpNotesPrefix: 'Notes:',
  sendHttpNotes:
    'response metadata is stored in ctx.http_response / ctx.http_status / ctx.http_ok / ctx.http_retries_used.',
} as const;

export const DEFAULT_SELECTED_OPERATION_ID: OperationDoc['id'] = 'transform';

export const DOCS: OperationDoc[] = [
  {
    id: 'transform',
    title: 'transform',
    kind: 'grouped-step',
    summary:
      'Applies a list of transform ops to ctx: default (set if empty), template (render {{dot.path}}), and pick (keep only selected paths).',
    usage: {
      type: 'transform',
      ops: [
        { op: 'default', path: 'actor_name', value: 'Unknown' },
        { op: 'template', to: 'title', template: 'Event {{type}} by {{actor_name}}' },
        { op: 'pick', paths: ['uuid', 'type', 'success', 'severity', 'title'] },
      ],
    },
    sampleInput: {
      uuid: '123',
      type: 'lock.unlock',
      success: false,
      severity: 'high',
      body: { message: 'abc' },
    },
    sampleWorkflowExecutionSteps: [
      {
        action: 'transform',
        details: { ops: [{ op: 'default' }, { op: 'template' }, { op: 'pick' }] },
        output: {
          uuid: '123',
          type: 'lock.unlock',
          success: false,
          severity: 'high',
          title: 'Event lock.unlock by Unknown',
        },
      },
    ],
  },
  {
    id: 'filter',
    title: 'filter',
    kind: 'grouped-step',
    summary:
      'Gates execution based on a list of conditions evaluated against ctx. Supported ops: eq, neq. If any fails, the run is skipped.',
    usage: {
      type: 'filter',
      conditions: [
        { path: 'type', op: 'eq', value: 'lock.unlock' },
        { path: 'success', op: 'eq', value: false },
      ],
    },
    sampleInput: { type: 'lock.unlock', success: false, body: { message: 'abc' } },
    sampleWorkflowExecutionSteps: [
      {
        action: 'filter',
        passed: true,
        details: {
          conditions: [
            { path: 'type', op: 'eq', value: 'lock.unlock', actual: 'lock.unlock', passed: true },
            { path: 'success', op: 'eq', value: false, actual: false, passed: true },
          ],
        },
        output: { type: 'lock.unlock', success: false, body: { message: 'abc' } },
      },
    ],
  },
  {
    id: 'http_request',
    title: 'http_request',
    kind: 'grouped-step',
    summary:
      'Makes an HTTP request (must be the last step). Supports templated headers/body and retries. Body mode can be ctx (send whole ctx) or custom (send templated JSON).',
    usage: {
      type: 'http_request',
      method: 'POST',
      url: 'http://localhost:9000/alerts',
      headers: {
        'Content-Type': 'application/json',
        'X-Workflow-Id': '{{workflow_id}}',
      },
      body: { mode: 'ctx' },
      timeoutMs: 2000,
      retries: 3,
    },
    sampleInput: { workflow_id: 'wf-123', body: { message: 'abc' } },
    sampleWorkflowExecutionSteps: [
      {
        action: 'http_request',
        details: {
          request: { method: 'POST', url: 'http://localhost:9000/alerts', bodyMode: 'ctx' },
          response: { ok: true, status: 200 },
        },
        output: { workflow_id: 'wf-123', body: { message: 'abc' }, http_ok: true, http_status: 200 },
      },
    ],
  },
];
