import type { WorkflowExecutionStepTrace, WorkflowExecutionTrace, WorkflowStep } from '@workflow/shared';
import { STEP_TYPE } from '@workflow/shared';
import { getByDotPath, pickDotPaths, setByDotPath } from './dotPath';
import { deepTemplate, renderTemplate } from './template';
import { executeHttpRequest } from './httpRequest';

export type Ctx = Record<string, unknown>;

export type EngineResult =
  | { status: 'success'; ctx: Ctx; trace: WorkflowExecutionTrace }
  | { status: 'skipped'; ctx: Ctx; trace: WorkflowExecutionTrace }
  | { status: 'failed'; ctx: Ctx; trace: WorkflowExecutionTrace; error: { message: string; details?: unknown } };

export async function runWorkflowSteps(params: {
  steps: WorkflowStep[];
  initialCtx: Ctx;
}): Promise<EngineResult> {
  let ctx: Ctx = params.initialCtx;
  const workflowExecutionSteps: WorkflowExecutionStepTrace[] = [];

  for (const step of params.steps) {
    if (step.type === STEP_TYPE.filter) {
      const conditions = step.conditions.map((c) => {
        const actual = getByDotPath(ctx, c.path);
        const passed = evaluateFilterOp({ actual, op: c.op, expected: c.value });
        return { ...c, actual, passed };
      });
      const passed = conditions.every((c) => c.passed);
      workflowExecutionSteps.push({
        action: STEP_TYPE.filter,
        passed,
        details: { conditions },
        output: cloneCtx(ctx),
      });

      if (!passed) {
        return { status: 'skipped', ctx, trace: { workflowExecutionSteps } };
      }
      continue;
    }

    if (step.type === STEP_TYPE.transform) {
      for (const op of step.ops) {
        if (op.op === 'default') {
          const current = getByDotPath(ctx, op.path);
          const isEmpty = current === null || current === undefined || (typeof current === 'string' && current === '');
          if (isEmpty) {
            setByDotPath(ctx, op.path, op.value);
          }
          continue;
        }

        if (op.op === 'template') {
          const rendered = renderTemplate(op.template, ctx);
          setByDotPath(ctx, op.to, rendered);
          continue;
        }

        if (op.op === 'pick') {
          ctx = pickDotPaths(ctx, op.paths);
          continue;
        }
      }

      workflowExecutionSteps.push({
        action: STEP_TYPE.transform,
        details: { ops: step.ops.map((o) => ({ op: o.op })) },
        output: cloneCtx(ctx),
      });
      continue;
    }

    if (step.type === STEP_TYPE.http_request) {
      const url = step.url.trim();
      if (!url) {
        const message = 'http_request requires a non-empty url';
        workflowExecutionSteps.push({
          action: STEP_TYPE.http_request,
          details: { error: message },
          output: cloneCtx(ctx),
        });
        return { status: 'failed', ctx, trace: { workflowExecutionSteps }, error: { message } };
      }
      if (url.startsWith('env:')) {
        const message = 'http_request url cannot use env:';
        workflowExecutionSteps.push({
          action: STEP_TYPE.http_request,
          details: { error: message },
          output: cloneCtx(ctx),
        });
        return { status: 'failed', ctx, trace: { workflowExecutionSteps }, error: { message } };
      }

      const headers = step.headers ? (deepTemplate(step.headers, ctx) as Record<string, string>) : undefined;

      let jsonBody: unknown = undefined;
      if (step.body?.mode === 'ctx') {
        jsonBody = ctx;
      } else if (step.body?.mode === 'custom') {
        jsonBody = deepTemplate(step.body.value, ctx);
      }

      const result = await executeHttpRequest({
        step: {
          method: step.method,
          url,
          headers,
          body: step.body,
          timeoutMs: step.timeoutMs,
          retries: step.retries,
        },
        jsonBody,
      });

      const parsed = result.bodyText !== undefined ? tryParseJson(result.bodyText) : null;
      ctx['http_status'] = result.status;
      ctx['http_ok'] = result.ok;
      ctx['http_response'] = parsed ?? result.bodyText ?? null;
      ctx['http_retries_used'] = result.retriesUsed;

      workflowExecutionSteps.push({
        action: STEP_TYPE.http_request,
        details: {
          request: { method: step.method, url, headers, bodyMode: step.body?.mode },
          response: {
            ok: result.ok,
            status: result.status,
            bodyText: result.bodyText,
            attempts: result.attempts,
            retriesUsed: result.retriesUsed,
            error: result.error,
          },
        },
        output: cloneCtx(ctx),
      });

      if (!result.ok) {
        return {
          status: 'failed',
          ctx,
          trace: { workflowExecutionSteps },
          error: {
            message:
              result.status === 0
                ? 'HTTP request failed (no response)'
                : `HTTP request failed with status ${result.status}`,
            details: {
              status: result.status,
              bodyText: result.bodyText,
              attempts: result.attempts,
              retriesUsed: result.retriesUsed,
              error: result.error,
            },
          },
        };
      }

      continue;
    }

    // Should be impossible after schema validation
    workflowExecutionSteps.push({
      action: 'unknown',
      details: { error: 'Unknown step type' },
      output: cloneCtx(ctx),
    });
    return { status: 'failed', ctx, trace: { workflowExecutionSteps }, error: { message: 'Unknown step type' } };
  }

  return { status: 'success', ctx, trace: { workflowExecutionSteps } };
}

function cloneCtx(ctx: Ctx): Ctx {
  return JSON.parse(JSON.stringify(ctx)) as Ctx;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;

  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, k)) return false;
    if (!isEqual(aObj[k], bObj[k])) return false;
  }
  return true;
}

function evaluateFilterOp(params: { actual: unknown; op: string; expected: unknown }): boolean {
  const { actual, expected, op } = params;

  if (op === 'eq') return isEqual(actual, expected);
  if (op === 'neq') return !isEqual(actual, expected);

  return false;
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function compareScalars(a: unknown, b: unknown): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : a > b ? 1 : -1;
  if (typeof a === 'string' && typeof b === 'string') return a === b ? 0 : a > b ? 1 : -1;
  return null;
}
