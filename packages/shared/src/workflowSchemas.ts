import { z } from 'zod';
import { STEP_TYPE } from './workflow';

export const dotPathSchema = z
  .string()
  .min(1)
  .refine((s) => !s.startsWith('.') && !s.endsWith('.'), 'Invalid dot-path');

export const filterConditionSchema = z.object({
  path: dotPathSchema,
  op: z.enum(['eq', 'neq']),
  value: z.any(),
});

export const filterStepSchema = z.object({
  type: z.literal(STEP_TYPE.filter),
  conditions: z.array(filterConditionSchema).min(1),
});

export const transformOpDefaultSchema = z.object({
  op: z.literal('default'),
  path: dotPathSchema,
  value: z.any(),
});

export const transformOpTemplateSchema = z.object({
  op: z.literal('template'),
  to: dotPathSchema,
  template: z.string(),
});

export const transformOpPickSchema = z.object({
  op: z.literal('pick'),
  paths: z.array(dotPathSchema).min(1),
});

export const transformStepSchema = z.object({
  type: z.literal(STEP_TYPE.transform),
  ops: z
    .array(
      z.discriminatedUnion('op', [transformOpDefaultSchema, transformOpTemplateSchema, transformOpPickSchema]),
    )
    .min(1),
});

export const httpRequestBodySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('ctx') }),
  z.object({ mode: z.literal('custom'), value: z.any() }),
]);

export const httpRequestStepSchema = z.object({
  type: z.literal(STEP_TYPE.http_request),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: httpRequestBodySchema.optional(),
  timeoutMs: z.number().int().positive().max(30_000).default(2000),
  retries: z.number().int().min(0).max(10).default(0),
});
export const workflowStepsSchema = z
  .array(z.union([filterStepSchema, transformStepSchema, httpRequestStepSchema]))
  .superRefine((steps, ctx) => {
    const httpRequestIndex = steps.findIndex((s) => s.type === STEP_TYPE.http_request);
    if (httpRequestIndex === -1) return;
    if (httpRequestIndex !== steps.length - 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [httpRequestIndex],
        message: 'http_request must be the last step (no steps are allowed after it)',
      });
    }
  });

export type WorkflowStep = z.infer<typeof workflowStepsSchema>[number];
