import { runWorkflowSteps } from './engine';
import type { WorkflowStep } from '@workflow/shared';

test('filter can short-circuit to skipped', async () => {
  const steps: WorkflowStep[] = [
    { type: 'filter', conditions: [{ path: 'type', op: 'eq', value: 'b' }] },
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
