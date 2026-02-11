import { runWorkflowSteps } from './engine';
import type { WorkflowStep } from '@workflow/shared';

test('filter can short-circuit to skipped', async () => {
  const steps: WorkflowStep[] = [
    { type: 'filter', ops: [{ path: 'type', op: 'eq', value: 'b' }] },
    { type: 'transform', ops: [{ op: 'template', to: 'x', template: 'hi' }] },
  ];

  const result = await runWorkflowSteps({
    initialCtx: { type: 'a' },
    steps,
  });

  expect(result.status).toBe('skipped');
});

test('transform default + template', async () => {
  const steps: WorkflowStep[] = [
    {
      type: 'transform',
      ops: [
        { op: 'default', path: 'value', value: 'test' },
        { op: 'template', to: 'title', template: 'Replace {{key}} by {{value}}' },
      ],
    },
  ];

  const result = await runWorkflowSteps({
    initialCtx: { key: 'test' },
    steps,
  });

  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error('Expected success');
  expect(result.ctx['value']).toBe('test');
  expect(result.ctx['title']).toBe('Replace test by test');
});

test('if.start / if.end gates execution', async () => {
  const steps: WorkflowStep[] = [
    { action: 'if.start', key: 'test', condition: 'eq', value: 'run' } as unknown as WorkflowStep,
    { action: 'transform.default_value', key: 'x', value: 'yes' } as unknown as WorkflowStep,
    { action: 'if.end' } as unknown as WorkflowStep,
  ];

  const result1 = await runWorkflowSteps({ initialCtx: { test: 'skip' }, steps });
  expect(result1.status).toBe('success');
  if (result1.status !== 'success') throw new Error('Expected success');
  expect((result1.ctx as Record<string, unknown>).x).toBeUndefined();

  const result2 = await runWorkflowSteps({ initialCtx: { test: 'run' }, steps });
  expect(result2.status).toBe('success');
  if (result2.status !== 'success') throw new Error('Expected success');
  expect((result2.ctx as Record<string, unknown>).x).toBe('yes');
});

test('create_or_update defaults then increments', async () => {
  const steps: WorkflowStep[] = [
    { action: 'create_or_update', key: 'counter', increment_by: '1', default_value: '0' } as unknown as WorkflowStep,
    { action: 'create_or_update', key: 'counter', increment_by: 2, default_value: 0 } as unknown as WorkflowStep,
  ];

  const result = await runWorkflowSteps({ initialCtx: {}, steps });
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error('Expected success');
  expect((result.ctx as Record<string, unknown>).counter).toBe(2);
});

test('while.start / while.end loops until condition fails', async () => {
  const steps: WorkflowStep[] = [
    { action: 'while.start', key: 'counter', condition: 'lt', value: 3 } as unknown as WorkflowStep,
    { action: 'create_or_update', key: 'counter', increment_by: 1, default_value: 0 } as unknown as WorkflowStep,
    { action: 'while.end' } as unknown as WorkflowStep,
  ];

  const result = await runWorkflowSteps({ initialCtx: { counter: 0 }, steps });
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error('Expected success');
  expect((result.ctx as Record<string, unknown>).counter).toBe(3);
});
