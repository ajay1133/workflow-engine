import { workflowStepsSchema } from './workflowSchemas';

test('accepts a valid steps array', () => {
  const steps = [
    { type: 'filter', conditions: [{ path: 'key', op: 'eq', value: 'test' }] },
    {
      type: 'transform',
      ops: [{ op: 'template', to: 'title', template: 'Replace {{key}} by {{value}}' }],
    },
    {
      type: 'http_request',
      method: 'POST',
      url: 'http://localhost:9000/alerts',
      headers: { 'Content-Type': 'application/json' },
      body: { mode: 'ctx' },
      timeoutMs: 2000,
      retries: 3,
    },
  ];

  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(true);
});

test('rejects legacy action-based operations', () => {
  const steps = [{ action: 'filter.compare', key: 'key', condition: 'eq', value: 'test' }];
  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(false);
});

test('rejects filter step using ops (conditions required)', () => {
  const steps = [{ type: 'filter', ops: [{ path: 'key', op: 'eq', value: 'test' }] }];
  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(false);
});

test('rejects filter condition ops other than eq/neq', () => {
  const steps = [{ type: 'filter', conditions: [{ path: 'key', op: 'gt', value: 'test' }] }];
  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(false);
});

test('rejects steps after http_request', () => {
  const steps = [
    { type: 'http_request', method: 'POST', url: 'http://localhost:9000/alerts', timeoutMs: 2000, retries: 0 },
    { type: 'transform', ops: [{ op: 'default', path: 'x', value: 1 }] },
  ];
  const result = workflowStepsSchema.safeParse(steps);
  expect(result.success).toBe(false);
});
