export type OperationDoc = {
  id:
    | 'filter.compare'
    | 'transform.default_value'
    | 'transform.replace_template'
    | 'transform.pick'
    | 'send.http_request'
    | 'if.start'
    | 'while.start'
    | 'create_or_update';
  title: string;
  kind: 'operation';
  summary: string;
  usage: unknown;
  sampleInput: unknown;
  sampleWorkflowExecutionSteps: unknown;
};

export const OPERATIONS_PAGE_TEXT = {
  title: 'Operations',
  workflowsLink: 'Workflows',
  logout: 'Logout',
  intro: 'Built-in operations supported by the workflow engine. A workflow runs these operations in order.',
  listLabel: 'List',
  usage: 'Usage (editable)',
  inputEditable: 'Input (editable)',
  output: 'Output',
  invalidJsonPrefix: 'Invalid JSON:',
  sendHttpNotesPrefix: 'Notes:',
  sendHttpNotes:
    'response is stored in Input.send_http_response (also sets Input.send_http_status and Input.send_http_ok).',
} as const;

export const DEFAULT_SELECTED_OPERATION_ID: OperationDoc['id'] = 'transform.replace_template';

export const DOCS: OperationDoc[] = [
  {
    id: 'filter.compare',
    title: 'filter.compare',
    kind: 'operation',
    summary: 'Gates execution based on Input[key] compared to value. If it fails, the run is skipped.',
    usage: { action: 'filter.compare', key: 'key', condition: 'eq', value: 'test' },
    sampleInput: { key: 'test', value: 'test' },
    sampleWorkflowExecutionSteps: [
      {
        action: 'filter.compare',
        passed: true,
        details: { key: 'key', condition: 'eq', expected: 'test', actual: 'test' },
        output: { key: 'test', value: 'test' },
      },
    ],
  },
  {
    id: 'transform.default_value',
    title: 'transform.default_value',
    kind: 'operation',
    summary: 'Sets Input[key] only if the current value is empty (null/undefined/"""").',
    usage: { action: 'transform.default_value', key: 'value', value: 'test' },
    sampleInput: { key: 'test', value: '' },
    sampleWorkflowExecutionSteps: [
      {
        action: 'transform.default_value',
        details: { key: 'value' },
        output: { key: 'test', value: 'test' },
      },
    ],
  },
  {
    id: 'transform.replace_template',
    title: 'transform.replace_template',
    kind: 'operation',
    summary: 'Renders a template string using {{dot.path}} lookups and writes it to Input[key].',
    usage: { action: 'transform.replace_template', key: 'title', value: 'Replace {{key}} by {{value}}' },
    sampleInput: { key: 'test', value: 'test' },
    sampleWorkflowExecutionSteps: [
      {
        action: 'transform.replace_template',
        details: { key: 'title' },
        output: { key: 'test', value: 'test', title: 'Replace test by test' },
      },
    ],
  },
  {
    id: 'transform.pick',
    title: 'transform.pick',
    kind: 'operation',
    summary: 'Replaces Input with a new object containing only the listed keys (dot-paths).',
    usage: { action: 'transform.pick', value: ['key', 'value'] },
    sampleInput: { key: 'test', value: 'test', extra: 'test' },
    sampleWorkflowExecutionSteps: [
      {
        action: 'transform.pick',
        details: { keys: ['key', 'value'] },
        output: { key: 'test', value: 'test' },
      },
    ],
  },
  {
    id: 'send.http_request',
    title: 'send.http_request',
    kind: 'operation',
    summary:
      'Posts to a Slack incoming webhook. url must be https://hooks.slack.com/services/... or env:SLACK_WEBHOOK_URL (default if omitted). Supports templated headers/body, timeoutMs, and retries. Retries happen on network errors/timeouts (no response) and HTTP 4xx/5xx. Response metadata is added to Input.send_http_response / Input.send_http_status / Input.send_http_ok / Input.send_http_retries_used, and the run trace includes retriesUsed.',
    usage: {
      action: 'send.http_request',
      method: 'POST',
      url: 'env:SLACK_WEBHOOK_URL',
      headers: { 'content-type': 'application/json' },
      body: { mode: 'custom', value: { text: '{{value}}' } },
      timeoutMs: 2000,
      retries: 3,
    },
    sampleInput: { value: 'test' },
    sampleWorkflowExecutionSteps: [
      {
        action: 'send.http_request',
        details: {
          request: { method: 'POST', url: 'env:SLACK_WEBHOOK_URL', headers: { 'content-type': 'application/json' }, bodyMode: 'custom' },
          response: { ok: true, status: 200, bodyText: 'ok' },
        },
        output: { value: 'test', send_http_ok: true, send_http_status: 200, send_http_response: 'ok' },
      },
    ],
  },
  {
    id: 'if.start',
    title: 'if.start / if.end',
    kind: 'operation',
    summary: 'Starts a conditional block. Steps between if.start and if.end run only when the condition passes.',
    usage: [
      { action: 'if.start', key: 'key', condition: 'eq', value: 'test' },
      { action: 'transform.default_value', key: 'value', value: 'test' },
      { action: 'if.end' },
    ],
    sampleInput: { key: 'test', value: '' },
    sampleWorkflowExecutionSteps: [
      {
        action: 'if.start',
        passed: true,
        details: { key: 'key', condition: 'eq', expected: 'test', actual: 'test' },
        output: { key: 'test', value: '' },
      },
      {
        action: 'transform.default_value',
        details: { key: 'value' },
        output: { key: 'test', value: 'test' },
      },
      {
        action: 'if.end',
        details: {},
        output: { key: 'test', value: 'test' },
      },
    ],
  },
  {
    id: 'while.start',
    title: 'while.start / while.end',
    kind: 'operation',
    summary: 'Starts a loop block. Steps between while.start and while.end run repeatedly while the condition passes.',
    usage: [
      { action: 'transform.default_value', key: 'counter', value: 0 },
      { action: 'while.start', key: 'counter', condition: 'lt', value: 3 },
      { action: 'create_or_update', key: 'counter', increment_by: 1, default_value: 0 },
      { action: 'while.end' },
    ],
    sampleInput: { counter: 0 },
    sampleWorkflowExecutionSteps: [
      {
        action: 'while.start',
        passed: true,
        details: { key: 'counter', condition: 'lt', expected: 3, actual: 0, iteration: 0 },
        output: { counter: 0 },
      },
    ],
  },
  {
    id: 'create_or_update',
    title: 'create_or_update',
    kind: 'operation',
    summary: 'Sets Input[key] to default_value if missing; otherwise increments it by increment_by.',
    usage: { action: 'create_or_update', key: 'value', increment_by: 1, default_value: 0 },
    sampleInput: {},
    sampleWorkflowExecutionSteps: [
      {
        action: 'create_or_update',
        details: { key: 'value', created: true, default_value: 0 },
        output: { value: 0 },
      },
    ],
  },
];
