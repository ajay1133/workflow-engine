import type { PrismaClient } from '@prisma/client';
import type { WorkflowStep } from '@workflow/shared';
import { STEP_TYPE } from '@workflow/shared';

const OP_REF_RE = /^{{\s*([a-zA-Z][a-zA-Z0-9_.-]{2,80})\s*}}$/;

type Attribute = { name: string; value: string };

type TemplateRow = {
  op: string;
  callbackType: string;
  visibility: string;
  created_by: string;
  attributes: unknown;
};

export async function expandOperationTemplates(params: {
  prisma: PrismaClient;
  workflowOwnerId: string | null;
  steps: WorkflowStep[];
}): Promise<WorkflowStep[]> {
  const referenced = new Set<string>();

  for (const step of params.steps) {
    if (step.type !== STEP_TYPE.transform) continue;
    for (const op of step.ops) {
      if (typeof op !== 'string') continue;
      const ref = parseOpRef(op);
      referenced.add(ref);
    }
  }

  if (referenced.size === 0) return params.steps;

  const opList = Array.from(referenced);

  const visibleWhere = params.workflowOwnerId
    ? {
        OR: [{ visibility: 'public' }, { created_by: params.workflowOwnerId }],
      }
    : { visibility: 'public' };

  const rows: TemplateRow[] = await params.prisma.operationTemplate.findMany({
    where: {
      op: { in: opList },
      ...visibleWhere,
    },
    select: {
      op: true,
      callbackType: true,
      visibility: true,
      created_by: true,
      attributes: true,
    },
  });

  const byOp = new Map(rows.map((r) => [r.op, r] as const));

  const missing = opList.filter((op) => !byOp.has(op));
  if (missing.length > 0) {
    throw new Error(`Operation template not found or not visible: ${missing.join(', ')}`);
  }

  return params.steps.map((step) => {
    if (step.type !== STEP_TYPE.transform) return step;

    const expandedOps = step.ops.flatMap((op) => {
      if (typeof op !== 'string') return [op];

      const ref = parseOpRef(op);
      const tpl = byOp.get(ref)!;

      return [expandOne(tpl)];
    });

    return { ...step, ops: expandedOps } as WorkflowStep;
  });
}

function parseOpRef(value: string): string {
  const match = value.match(OP_REF_RE);
  if (!match) {
    throw new Error(`Invalid operation reference: ${value}`);
  }
  return match[1];
}

function normalizeAttributes(value: unknown): Attribute[] {
  if (!Array.isArray(value)) return [];
  const out: Attribute[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== 'string') continue;
    if (typeof rec.value !== 'string') continue;
    out.push({ name: rec.name, value: rec.value });
  }
  return out;
}

function getAttr(attrs: Attribute[], name: string): string | undefined {
  return attrs.find((a) => a.name === name)?.value;
}

function expandOne(tpl: TemplateRow): { op: 'default'; path: string; value: unknown } | { op: 'template'; to: string; template: string } | { op: 'pick'; paths: string[] } {
  const attrs = normalizeAttributes(tpl.attributes);

  if (tpl.callbackType === 'template') {
    const to = getAttr(attrs, 'to');
    const template = getAttr(attrs, 'template');
    if (!to || !template) {
      throw new Error(`Operation ${tpl.op} (template) requires attributes: to, template`);
    }
    return { op: 'template', to, template };
  }

  if (tpl.callbackType === 'default') {
    const path = getAttr(attrs, 'path');
    const raw = getAttr(attrs, 'value');
    if (!path || raw === undefined) {
      throw new Error(`Operation ${tpl.op} (default) requires attributes: path, value`);
    }

    const parsed = tryParseJson(raw);
    return { op: 'default', path, value: parsed };
  }

  if (tpl.callbackType === 'pick') {
    const raw = getAttr(attrs, 'paths');
    if (!raw) {
      throw new Error(`Operation ${tpl.op} (pick) requires attribute: paths`);
    }

    const paths = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (paths.length === 0) {
      throw new Error(`Operation ${tpl.op} (pick) requires at least one path`);
    }

    return { op: 'pick', paths };
  }

  throw new Error(`Unsupported callbackType for operation ${tpl.op}: ${tpl.callbackType}`);
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
