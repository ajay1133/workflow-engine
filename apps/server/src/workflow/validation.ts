import { workflowStepsSchema } from '@workflow/shared';
import { z } from 'zod';

const workflowTriggerSchema = z.object({
  type: z.literal('http'),
});

export const createWorkflowBodySchema = z.object({
  id: z.string().min(1).max(400).optional(),
  name: z.string().min(1).max(200),
  enabled: z.boolean().optional().default(true),
  trigger: workflowTriggerSchema.optional(),
  steps: workflowStepsSchema,
});

export const updateWorkflowBodySchema = z
  .object({
    id: z.string().min(1).max(400).optional(),
    name: z.string().min(1).max(200).optional(),
    enabled: z.boolean().optional(),
    trigger: workflowTriggerSchema.optional(),
    steps: workflowStepsSchema.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'Body must include at least one field');
