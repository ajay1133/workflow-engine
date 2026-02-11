import type { WorkflowExecutionStepTrace, WorkflowExecutionTrace, WorkflowStep } from '@workflow/shared';
import { ACTION_TYPE, STEP_TYPE } from '@workflow/shared';
import { getByDotPath, pickDotPaths, setByDotPath } from './dotPath';
import { deepTemplate, renderTemplate } from './template';
import { executeHttpRequest } from './httpRequest';

function isSlackWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'hooks.slack.com') return false;
    return /^\/services\/[^/]+\/[^/]+\/[^/]+$/.test(u.pathname);
  } catch {
    return false;
  }
}

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

  const operations = normalizeToOperations(params.steps);

  const compiled = compileBlocks(operations);
  if (!compiled.ok) {
    return {
      status: 'failed',
      ctx,
      trace: { workflowExecutionSteps },
      error: { message: compiled.error },
    };
  }

  const { startToEnd, endToStart } = compiled;
  const whileIterations = new Map<number, number>();
  const MAX_WHILE_ITERATIONS = 100;

  for (let i = 0; i < operations.length; ) {
    const op = operations[i];
    if (op.action === ACTION_TYPE.filter_compare) {
      const actual = getByDotPath(ctx, op.key);
      const passed = evaluateFilterOp({ actual, op: op.condition, expected: op.value });
      workflowExecutionSteps.push({
        action: ACTION_TYPE.filter_compare,
        passed,
        details: { key: op.key, condition: op.condition, expected: op.value, actual },
        output: cloneCtx(ctx),
      });

      if (!passed) {
        return { status: 'skipped', ctx, trace: { workflowExecutionSteps } };
      }
      i++;
      continue;
    }

    if (op.action === ACTION_TYPE.transform_default_value) {
      const current = getByDotPath(ctx, op.key);
      const isEmpty = current === null || current === undefined || (typeof current === 'string' && current === '');
      if (isEmpty) {
        setByDotPath(ctx, op.key, op.value);
      }
      workflowExecutionSteps.push({
        action: ACTION_TYPE.transform_default_value,
        details: { key: op.key },
        output: cloneCtx(ctx),
      });
      i++;
      continue;
    }

    if (op.action === ACTION_TYPE.transform_replace_template) {
      const rendered = renderTemplate(op.value, ctx);
      setByDotPath(ctx, op.key, rendered);
      workflowExecutionSteps.push({
        action: ACTION_TYPE.transform_replace_template,
        details: { key: op.key },
        output: cloneCtx(ctx),
      });
      i++;
      continue;
    }

    if (op.action === ACTION_TYPE.transform_pick) {
      ctx = pickDotPaths(ctx, op.value);
      workflowExecutionSteps.push({
        action: ACTION_TYPE.transform_pick,
        details: { keys: op.value },
        output: cloneCtx(ctx),
      });
      i++;
      continue;
    }

    if (op.action === ACTION_TYPE.send_http_request) {
      const headers = op.headers ? (deepTemplate(op.headers, ctx) as Record<string, string>) : undefined;

      const url = op.url?.trim();
      if (!url) {
        const message = 'send.http_request requires a non-empty url';
        workflowExecutionSteps.push({
          action: ACTION_TYPE.send_http_request,
          details: { error: message },
          output: cloneCtx(ctx),
        });
        return { status: 'failed', ctx, trace: { workflowExecutionSteps }, error: { message } };
      }

      if (url.startsWith('env:')) {
        const message = 'send.http_request url cannot use env:; pass the webhook url directly';
        workflowExecutionSteps.push({
          action: ACTION_TYPE.send_http_request,
          details: { error: message },
          output: cloneCtx(ctx),
        });
        return { status: 'failed', ctx, trace: { workflowExecutionSteps }, error: { message } };
      }

      let body: unknown = undefined;
      if (op.body?.mode === 'ctx') {
        body = ctx;
      } else if (op.body?.mode === 'custom') {
        body = deepTemplate(op.body.value, ctx);
      }

      const result = await executeHttpRequest({
        step: {
          method: op.method,
          url,
          headers,
          body: op.body,
          timeoutMs: op.timeoutMs ?? (isSlackWebhookUrl(url) ? 10_000 : 2_000),
          retries: op.retries ?? 0,
        },
        jsonBody: body,
      });

      if (result.bodyText !== undefined) {
        const parsed = tryParseJson(result.bodyText);
        ctx['send_http_status'] = result.status;
        ctx['send_http_ok'] = result.ok;
        ctx['send_http_response'] = parsed ?? result.bodyText;
        ctx['send_http_retries_used'] = result.retriesUsed;
      }

      workflowExecutionSteps.push({
        action: ACTION_TYPE.send_http_request,
        details: {
          request: { method: op.method, url, headers, bodyMode: op.body?.mode },
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

      i++;
      continue;
    }

    if (op.action === ACTION_TYPE.if_start) {
      const actual = getByDotPath(ctx, op.key);
      const passed = evaluateFilterOp({ actual, op: op.condition, expected: op.value });
      workflowExecutionSteps.push({
        action: ACTION_TYPE.if_start,
        passed,
        details: { key: op.key, condition: op.condition, expected: op.value, actual },
        output: cloneCtx(ctx),
      });

      if (!passed) {
        const end = startToEnd.get(i);
        if (end === undefined) {
          return {
            status: 'failed',
            ctx,
            trace: { workflowExecutionSteps },
            error: { message: 'Invalid workflow: if.start has no matching if.end' },
          };
        }
        i = end + 1;
        continue;
      }

      i++;
      continue;
    }

    if (op.action === ACTION_TYPE.if_end) {
      workflowExecutionSteps.push({
        action: ACTION_TYPE.if_end,
        details: {},
        output: cloneCtx(ctx),
      });
      i++;
      continue;
    }

    if (op.action === ACTION_TYPE.while_start) {
      const actual = getByDotPath(ctx, op.key);
      const passed = evaluateFilterOp({ actual, op: op.condition, expected: op.value });
      const iteration = whileIterations.get(i) ?? 0;

      workflowExecutionSteps.push({
        action: ACTION_TYPE.while_start,
        passed,
        details: { key: op.key, condition: op.condition, expected: op.value, actual, iteration },
        output: cloneCtx(ctx),
      });

      if (!passed) {
        const end = startToEnd.get(i);
        if (end === undefined) {
          return {
            status: 'failed',
            ctx,
            trace: { workflowExecutionSteps },
            error: { message: 'Invalid workflow: while.start has no matching while.end' },
          };
        }
        whileIterations.delete(i);
        i = end + 1;
        continue;
      }

      i++;
      continue;
    }

    if (op.action === ACTION_TYPE.while_end) {
      const start = endToStart.get(i);
      if (start === undefined) {
        return {
          status: 'failed',
          ctx,
          trace: { workflowExecutionSteps },
          error: { message: 'Invalid workflow: while.end has no matching while.start' },
        };
      }

      const next = (whileIterations.get(start) ?? 0) + 1;
      whileIterations.set(start, next);

      workflowExecutionSteps.push({
        action: ACTION_TYPE.while_end,
        details: { iteration: next },
        output: cloneCtx(ctx),
      });

      if (next >= MAX_WHILE_ITERATIONS) {
        return {
          status: 'failed',
          ctx,
          trace: { workflowExecutionSteps },
          error: { message: `While loop exceeded max iterations (${MAX_WHILE_ITERATIONS})` },
        };
      }

      i = start;
      continue;
    }

    if (op.action === ACTION_TYPE.create_or_update) {
      const before = getByDotPath(ctx, op.key);
      const inc = toNumberLike(op.increment_by);
      const def = toNumberLike(op.default_value);
      if (inc === null || def === null) {
        return {
          status: 'failed',
          ctx,
          trace: { workflowExecutionSteps },
          error: { message: 'create_or_update requires numeric increment_by and default_value' },
        };
      }

      if (before === null || before === undefined) {
        setByDotPath(ctx, op.key, def);
        workflowExecutionSteps.push({
          action: ACTION_TYPE.create_or_update,
          details: { key: op.key, created: true, default_value: def },
          output: cloneCtx(ctx),
        });
        i++;
        continue;
      }

      const beforeNum = toNumberLike(before);
      if (beforeNum === null) {
        return {
          status: 'failed',
          ctx,
          trace: { workflowExecutionSteps },
          error: { message: `create_or_update cannot increment non-numeric value at key '${op.key}'` },
        };
      }

      const afterNum = beforeNum + inc;
      setByDotPath(ctx, op.key, afterNum);

      workflowExecutionSteps.push({
        action: ACTION_TYPE.create_or_update,
        details: { key: op.key, created: false, before: beforeNum, increment_by: inc, after: afterNum },
        output: cloneCtx(ctx),
      });

      i++;
      continue;
    }

    // Unknown op (should be impossible after schema validation/normalization)
    i++;
  }

  return { status: 'success', ctx, trace: { workflowExecutionSteps } };
}

function cloneCtx(ctx: Ctx): Record<string, unknown> {
  try {
    // structuredClone exists in Node 18+; but ctx may include non-cloneable values.
    const sc = (globalThis as unknown as { structuredClone?: (v: unknown) => unknown }).structuredClone;
    if (typeof sc === 'function') return sc(ctx) as Record<string, unknown>;
  } catch {
    // fall through
  }

  try {
    return JSON.parse(JSON.stringify(ctx)) as Record<string, unknown>;
  } catch {
    return { ...ctx };
  }
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
  if (op === 'neq' || op === 'noteq') return !isEqual(actual, expected);

  if (op === 'contains') {
    if (typeof actual === 'string' && typeof expected === 'string') return actual.includes(expected);
    if (Array.isArray(actual)) return actual.some((v) => isEqual(v, expected));
    return false;
  }

  if (op === 'begins') {
    if (typeof actual === 'string' && typeof expected === 'string') return actual.startsWith(expected);
    return false;
  }

  if (op === 'ends') {
    if (typeof actual === 'string' && typeof expected === 'string') return actual.endsWith(expected);
    return false;
  }

  const cmp = compareScalars(actual, expected);
  if (cmp === null) return false;

  if (op === 'gt') return cmp > 0;
  if (op === 'gte') return cmp >= 0;
  if (op === 'lt') return cmp < 0;
  if (op === 'lte') return cmp <= 0;

  return false;
}

type NormalizedOperation =
  | { action: typeof ACTION_TYPE.filter_compare; key: string; condition: string; value: unknown }
  | { action: typeof ACTION_TYPE.transform_default_value; key: string; value: unknown }
  | { action: typeof ACTION_TYPE.transform_replace_template; key: string; value: string }
  | { action: typeof ACTION_TYPE.transform_pick; value: string[] }
  | {
      action: typeof ACTION_TYPE.send_http_request;
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      url: string;
      headers?: Record<string, string>;
      body?: { mode: 'ctx' } | { mode: 'custom'; value: unknown };
      timeoutMs?: number;
      retries?: number;
    }
  | { action: typeof ACTION_TYPE.if_start; key: string; condition: string; value: unknown }
  | { action: typeof ACTION_TYPE.if_end }
  | { action: typeof ACTION_TYPE.while_start; key: string; condition: string; value: unknown }
  | { action: typeof ACTION_TYPE.while_end }
  | { action: typeof ACTION_TYPE.create_or_update; key: string; increment_by: unknown; default_value: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeToOperations(items: WorkflowStep[]): NormalizedOperation[] {
  const out: NormalizedOperation[] = [];

  for (const raw of items as unknown[]) {
    if (isRecord(raw) && typeof raw.action === 'string') {
      out.push(raw as unknown as NormalizedOperation);
      continue;
    }

    if (isRecord(raw) && typeof raw.type === 'string') {
      const rawType = raw.type;
      const t = rawType === 'fetch.http_request' ? ACTION_TYPE.send_http_request : rawType;
      if (
        t === ACTION_TYPE.filter_compare ||
        t === ACTION_TYPE.transform_default_value ||
        t === ACTION_TYPE.transform_replace_template ||
        t === ACTION_TYPE.transform_pick ||
        t === ACTION_TYPE.send_http_request ||
        t === ACTION_TYPE.if_start ||
        t === ACTION_TYPE.if_end ||
        t === ACTION_TYPE.while_start ||
        t === ACTION_TYPE.while_end ||
        t === ACTION_TYPE.create_or_update
      ) {
        out.push({ ...raw, action: t } as unknown as NormalizedOperation);
        continue;
      }
    }

    // Legacy grouped step shapes
    if (isRecord(raw) && raw.type === STEP_TYPE.filter) {
      const ops = Array.isArray(raw.ops) ? raw.ops : Array.isArray(raw.conditions) ? raw.conditions : [];
      for (const c of ops) {
        if (!isRecord(c)) continue;
        out.push({
          action: ACTION_TYPE.filter_compare,
          key: String(c.path ?? ''),
          condition: String(c.op ?? ''),
          value: c.value,
        });
      }
      continue;
    }

    if (isRecord(raw) && raw.type === STEP_TYPE.transform) {
      const ops = Array.isArray(raw.ops) ? raw.ops : [];
      for (const op of ops) {
        if (!isRecord(op)) continue;
        if (op.op === 'default') {
          out.push({ action: ACTION_TYPE.transform_default_value, key: String(op.path ?? ''), value: op.value });
        } else if (op.op === 'template') {
          out.push({
            action: ACTION_TYPE.transform_replace_template,
            key: String(op.to ?? ''),
            value: String(op.template ?? ''),
          });
        } else if (op.op === 'pick') {
          out.push({
            action: ACTION_TYPE.transform_pick,
            value: Array.isArray(op.paths) ? op.paths.map((p) => String(p)) : [],
          });
        }
      }
      continue;
    }

    if (isRecord(raw) && raw.type === STEP_TYPE.http_request) {
      out.push({
        action: ACTION_TYPE.send_http_request,
        method: String(raw.method ?? 'POST') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: String(raw.url ?? ''),
        headers: isRecord(raw.headers) ? (raw.headers as Record<string, string>) : undefined,
        body: raw.body as unknown as { mode: 'ctx' } | { mode: 'custom'; value: unknown } | undefined,
        timeoutMs: typeof raw.timeoutMs === 'number' ? raw.timeoutMs : undefined,
        retries: typeof raw.retries === 'number' ? raw.retries : undefined,
      });
      continue;
    }
  }

  return out;
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

function toNumberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function compileBlocks(ops: NormalizedOperation[]):
  | { ok: true; startToEnd: Map<number, number>; endToStart: Map<number, number> }
  | { ok: false; error: string } {
  const startToEnd = new Map<number, number>();
  const endToStart = new Map<number, number>();

  const stack: Array<{ kind: 'if' | 'while'; start: number }> = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.action === ACTION_TYPE.if_start) {
      stack.push({ kind: 'if', start: i });
      continue;
    }
    if (op.action === ACTION_TYPE.while_start) {
      stack.push({ kind: 'while', start: i });
      continue;
    }

    if (op.action === ACTION_TYPE.if_end) {
      const top = stack.pop();
      if (!top || top.kind !== 'if') {
        return { ok: false, error: 'Invalid workflow: if.end must have an earlier matching if.start' };
      }
      startToEnd.set(top.start, i);
      endToStart.set(i, top.start);
      continue;
    }

    if (op.action === ACTION_TYPE.while_end) {
      const top = stack.pop();
      if (!top || top.kind !== 'while') {
        return { ok: false, error: 'Invalid workflow: while.end must have an earlier matching while.start' };
      }
      startToEnd.set(top.start, i);
      endToStart.set(i, top.start);
      continue;
    }
  }

  if (stack.length > 0) {
    const last = stack[stack.length - 1];
    const end = last.kind === 'if' ? 'if.end' : 'while.end';
    return { ok: false, error: `Invalid workflow: ${last.kind}.start must have a later matching ${end}` };
  }

  return { ok: true, startToEnd, endToStart };
}
