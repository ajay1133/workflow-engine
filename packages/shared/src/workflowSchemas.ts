import { z } from 'zod';
import { ACTION_TYPE, STEP_TYPE } from './workflow';

const slackWebhookUrlSchema = z
  .string()
  .min(1)
  .refine((raw) => {
    try {
      const u = new URL(raw.trim());
      if (u.protocol !== 'https:') return false;
      if (u.hostname !== 'hooks.slack.com') return false;
      return /^\/services\/[^/]+\/[^/]+\/[^/]+$/.test(u.pathname);
    } catch {
      return false;
    }
  }, 'Invalid Slack webhook url');

const slackWebhookOrEnvSchema = z
  .string()
  .min(1)
  .refine((raw) => {
    const value = raw.trim();
    if (value.startsWith('env:')) return value.slice('env:'.length).trim().length > 0;
    return slackWebhookUrlSchema.safeParse(value).success;
  }, 'Invalid Slack webhook url');

export const dotPathSchema = z
  .string()
  .min(1)
  .refine((s) => !s.startsWith('.') && !s.endsWith('.'), 'Invalid dot-path');

export const filterConditionSchema = z.object({
  path: dotPathSchema,
  op: z.enum(['eq', 'neq', 'contains', 'begins', 'ends', 'gt', 'gte', 'lt', 'lte']),
  value: z.any(),
});

export const filterCompareConditionSchema = z.enum([
  'eq',
  'neq',
  'noteq',
  'contains',
  'begins',
  'ends',
  'gt',
  'gte',
  'lt',
  'lte',
]);

const numericLikeSchema = z.union([
  z.number(),
  z
    .string()
    .trim()
    .regex(/^-?\d+(?:\.\d+)?$/, 'Must be a number or numeric string'),
]);

export const filterCompareOpSchema = z.object({
  action: z.literal(ACTION_TYPE.filter_compare).optional(),
  type: z.literal(ACTION_TYPE.filter_compare).optional(),
  key: dotPathSchema,
  condition: filterCompareConditionSchema,
  value: z.any(),
}).refine((o) => o.action === ACTION_TYPE.filter_compare || o.type === ACTION_TYPE.filter_compare, 'Invalid action');

export const filterStepOpsSchema = z.object({
  type: z.literal(STEP_TYPE.filter),
  ops: z.array(filterConditionSchema).min(1),
});

// Legacy shape (kept for backwards compatibility)
export const filterStepConditionsSchema = z.object({
  type: z.literal(STEP_TYPE.filter),
  conditions: z.array(filterConditionSchema).min(1),
});

export const filterStepSchema = z.union([filterStepOpsSchema, filterStepConditionsSchema]);

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

export const transformDefaultValueOpSchema = z.object({
  action: z.literal(ACTION_TYPE.transform_default_value).optional(),
  type: z.literal(ACTION_TYPE.transform_default_value).optional(),
  key: dotPathSchema,
  value: z.any(),
}).refine((o) => o.action === ACTION_TYPE.transform_default_value || o.type === ACTION_TYPE.transform_default_value, 'Invalid action');

export const transformReplaceTemplateOpSchema = z.object({
  action: z.literal(ACTION_TYPE.transform_replace_template).optional(),
  type: z.literal(ACTION_TYPE.transform_replace_template).optional(),
  key: dotPathSchema,
  value: z.string(),
}).refine((o) => o.action === ACTION_TYPE.transform_replace_template || o.type === ACTION_TYPE.transform_replace_template, 'Invalid action');

export const transformPickOpSchema = z.object({
  action: z.literal(ACTION_TYPE.transform_pick).optional(),
  type: z.literal(ACTION_TYPE.transform_pick).optional(),
  value: z.array(dotPathSchema).min(1),
}).refine((o) => o.action === ACTION_TYPE.transform_pick || o.type === ACTION_TYPE.transform_pick, 'Invalid action');

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

export const sendHttpRequestOpSchema = z.object({
  action: z.literal(ACTION_TYPE.send_http_request).optional(),
  type: z.enum([ACTION_TYPE.send_http_request, 'fetch.http_request']).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: slackWebhookOrEnvSchema.optional().default('env:SLACK_WEBHOOK_URL'),
  headers: z.record(z.string()).optional(),
  body: httpRequestBodySchema.optional(),
  timeoutMs: z.number().int().positive().max(30_000).default(2000),
  retries: z.number().int().min(0).max(10).default(0),
}).refine((o) => o.action === ACTION_TYPE.send_http_request || o.type === ACTION_TYPE.send_http_request || o.type === 'fetch.http_request', 'Invalid action');

export const ifStartOpSchema = z.object({
  action: z.literal(ACTION_TYPE.if_start).optional(),
  type: z.literal(ACTION_TYPE.if_start).optional(),
  key: dotPathSchema,
  condition: filterCompareConditionSchema,
  value: z.any(),
}).refine((o) => o.action === ACTION_TYPE.if_start || o.type === ACTION_TYPE.if_start, 'Invalid action');

export const ifEndOpSchema = z.object({
  action: z.literal(ACTION_TYPE.if_end).optional(),
  type: z.literal(ACTION_TYPE.if_end).optional(),
}).refine((o) => o.action === ACTION_TYPE.if_end || o.type === ACTION_TYPE.if_end, 'Invalid action');

export const whileStartOpSchema = z.object({
  action: z.literal(ACTION_TYPE.while_start).optional(),
  type: z.literal(ACTION_TYPE.while_start).optional(),
  key: dotPathSchema,
  condition: filterCompareConditionSchema,
  value: z.any(),
}).refine((o) => o.action === ACTION_TYPE.while_start || o.type === ACTION_TYPE.while_start, 'Invalid action');

export const whileEndOpSchema = z.object({
  action: z.literal(ACTION_TYPE.while_end).optional(),
  type: z.literal(ACTION_TYPE.while_end).optional(),
}).refine((o) => o.action === ACTION_TYPE.while_end || o.type === ACTION_TYPE.while_end, 'Invalid action');

export const createOrUpdateOpSchema = z.object({
  action: z.literal(ACTION_TYPE.create_or_update).optional(),
  type: z.literal(ACTION_TYPE.create_or_update).optional(),
  key: dotPathSchema,
  increment_by: numericLikeSchema,
  default_value: numericLikeSchema,
}).refine((o) => o.action === ACTION_TYPE.create_or_update || o.type === ACTION_TYPE.create_or_update, 'Invalid action');

export const workflowStepsSchema = z
  .array(
    z.union([
      filterCompareOpSchema,
      transformDefaultValueOpSchema,
      transformReplaceTemplateOpSchema,
      transformPickOpSchema,
      sendHttpRequestOpSchema,
      ifStartOpSchema,
      ifEndOpSchema,
      whileStartOpSchema,
      whileEndOpSchema,
      createOrUpdateOpSchema,
      // legacy
      filterStepOpsSchema,
      filterStepConditionsSchema,
      transformStepSchema,
      httpRequestStepSchema,
    ]),
  )
  .superRefine((steps, ctx) => {
    const stack: Array<{ kind: 'if' | 'while'; index: number }> = [];

    for (let index = 0; index < steps.length; index++) {
      const step: unknown = steps[index];
      const action =
        step && typeof step === 'object'
          ? (() => {
              const rec = step as Record<string, unknown>;
              if (typeof rec.action === 'string') return rec.action;
              if (typeof rec.type === 'string') return rec.type;
              return undefined;
            })()
          : undefined;

      if (action === ACTION_TYPE.if_start) {
        stack.push({ kind: 'if', index });
        continue;
      }

      if (action === ACTION_TYPE.while_start) {
        stack.push({ kind: 'while', index });
        continue;
      }

      if (action === ACTION_TYPE.if_end || action === ACTION_TYPE.while_end) {
        const expectedKind: 'if' | 'while' = action === ACTION_TYPE.if_end ? 'if' : 'while';
        const top = stack.pop();

        if (!top) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index],
            message: `${action} has no matching ${expectedKind}.start`,
          });
          continue;
        }

        if (top.kind !== expectedKind) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index],
            message: `${action} closes a ${top.kind}.start (at index ${top.index}); blocks must be properly nested`,
          });
        }
      }
    }

    for (const unclosed of stack) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [unclosed.index],
        message: `${unclosed.kind}.start has no matching ${unclosed.kind}.end`,
      });
    }
  });

export type WorkflowStep = z.infer<typeof workflowStepsSchema>[number];
