import { workflowStepsSchema } from './workflowSchemas';

test('accepts a valid steps array', () => {
  const steps = [
    { type: 'filter', ops: [{ path: 'key', op: 'eq', value: 'test' }] },
    {
      type: 'transform',
      ops: [{ op: 'template', to: 'title', template: 'Replace {{key}} by {{value}}' }],
    },
  ];

  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(true);
});

test('filter step legacy conditions are accepted', () => {
  const steps = [{ type: 'filter', conditions: [{ path: 'key', op: 'eq', value: 'test' }] }];
  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(true);
});

test('accepts if/while and create_or_update operations', () => {
  const steps = [
    { action: 'create_or_update', key: 'counter', increment_by: '1', default_value: '0' },
    { action: 'if.start', key: 'key', condition: 'eq', value: 'test' },
    { action: 'transform.default_value', key: 'value', value: 'test' },
    { action: 'if.end' },
    { action: 'while.start', key: 'key', condition: 'eq', value: 'test' },
    { action: 'create_or_update', key: 'counter', increment_by: 1, default_value: 0 },
    { action: 'while.end' },
  ];

  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(true);
});

test('accepts send.http_request url env:KEY', () => {
  const steps = [
    {
      action: 'send.http_request',
      method: 'POST',
      url: 'env:SLACK_WEBHOOK_URL',
      headers: { 'content-type': 'application/json' },
      body: { mode: 'custom', value: { text: '{{value}}' } },
      timeoutMs: 2000,
      retries: 0,
    },
  ];

  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(true);
});

test('accepts a valid Slack webhook URL shape', () => {
  const steps = [
    {
      action: 'send.http_request',
      method: 'POST',
      url: 'https://hooks.slack.com/services/test/test/test',
    },
  ];

  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(true);
});

test('rejects an invalid Slack webhook URL shape', () => {
  const steps = [
    {
      action: 'send.http_request',
      method: 'POST',
      url: 'https://hooks.slack.com/not-services/test',
    },
  ];

  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(false);
});

test('rejects non-Slack URLs for send.http_request', () => {
  const steps = [
    {
      action: 'send.http_request',
      method: 'POST',
      url: 'https://example.com/webhook',
    },
  ];

  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(false);
});

test('rejects if.end without matching if.start', () => {
  const steps = [{ action: 'if.end' }];
  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(false);
});

test('rejects if.start without matching if.end', () => {
  const steps = [{ action: 'if.start', key: 'key', condition: 'eq', value: 'test' }];
  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(false);
});

test('rejects mismatched block ends (while.end closing if.start)', () => {
  const steps = [
    { action: 'if.start', key: 'key', condition: 'eq', value: 'test' },
    { action: 'while.end' },
  ];
  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(false);
});
