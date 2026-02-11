import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { clearAuthToken } from '../auth';
import type { OperationDoc } from './OperationsPage.constants';
import { DEFAULT_SELECTED_OPERATION_ID, DOCS, OPERATIONS_PAGE_TEXT } from './OperationsPage.constants';
import styles from './OperationsPage.module.css';
import { testSlackWebhook } from '../api';

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getByDotPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;

    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
      continue;
    }

    if (!isRecord(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function setByDotPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const next = cur[k];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      cur[k] = {};
    }

    const ensured = cur[k];
    cur = isRecord(ensured) ? ensured : {};
    if (!isRecord(ensured)) cur[k] = cur;
  }
  cur[parts[parts.length - 1]] = value;
}

function pickDotPaths(obj: Record<string, unknown>, paths: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of paths) {
    const v = getByDotPath(obj, p);
    if (v !== undefined) setByDotPath(out, p, v);
  }
  return out;
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

function compareScalars(a: unknown, b: unknown): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : a > b ? 1 : -1;
  if (typeof a === 'string' && typeof b === 'string') return a === b ? 0 : a > b ? 1 : -1;
  return null;
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

function renderTemplate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, rawPath: string) => {
    const value = getByDotPath(ctx, String(rawPath).trim());
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  });
}

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

function coerceInputToCtx(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (cloneJson(input) as Record<string, unknown>)
    : ({ value: cloneJson(input) } as Record<string, unknown>);
}

function getAction(op: unknown): string | undefined {
  if (!isRecord(op)) return undefined;
  if (typeof op.action === 'string') return op.action;
  if (typeof op.type === 'string') return op.type;
  return undefined;
}

function compileBlocks(
  ops: unknown[],
):
  | { ok: true; startToEnd: Map<number, number>; endToStart: Map<number, number> }
  | { ok: false; error: string } {
  const startToEnd = new Map<number, number>();
  const endToStart = new Map<number, number>();
  const stack: Array<{ kind: 'if' | 'while'; index: number }> = [];

  for (let i = 0; i < ops.length; i++) {
    const action = getAction(ops[i]);
    if (action === 'if.start') stack.push({ kind: 'if', index: i });
    if (action === 'while.start') stack.push({ kind: 'while', index: i });

    if (action === 'if.end' || action === 'while.end') {
      const expectedKind = action === 'if.end' ? 'if' : 'while';
      const top = stack.pop();
      if (!top) return { ok: false, error: `${action} has no matching ${expectedKind}.start` };
      if (top.kind !== expectedKind) {
        return { ok: false, error: `${action} closes a ${top.kind}.start; blocks must be properly nested` };
      }
      startToEnd.set(top.index, i);
      endToStart.set(i, top.index);
    }
  }

  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    return { ok: false, error: `${top.kind}.start has no matching ${top.kind}.end` };
  }

  return { ok: true, startToEnd, endToStart };
}

function runDocWorkflow(params: {
  ops: unknown[];
  input: unknown;
}): { output: unknown; workflowExecutionSteps: unknown[] } {
  const ctx = coerceInputToCtx(params.input);
  const compiled = compileBlocks(params.ops);
  if (!compiled.ok) {
    return {
      output: cloneJson(ctx),
      workflowExecutionSteps: [
        {
          action: 'validation',
          details: { error: compiled.error },
          output: cloneJson(ctx),
        },
      ],
    };
  }

  const { startToEnd, endToStart } = compiled;
  const steps: unknown[] = [];
  const whileIterations = new Map<number, number>();
  const MAX_WHILE_ITERATIONS = 100;

  for (let i = 0; i < params.ops.length; ) {
    const op = isRecord(params.ops[i]) ? (params.ops[i] as Record<string, unknown>) : {};
    const action = getAction(op);

    if (action === 'filter.compare') {
      const actual = getByDotPath(ctx, String(op?.key ?? ''));
      const passed = evaluateFilterOp({ actual, op: String(op?.condition ?? ''), expected: op?.value });
      steps.push({
        action: 'filter.compare',
        passed,
        details: { key: op?.key, condition: op?.condition, expected: op?.value, actual },
        output: cloneJson(ctx),
      });
      if (!passed) break;
      i++;
      continue;
    }

    if (action === 'transform.default_value') {
      const key = String(op?.key ?? '');
      const current = getByDotPath(ctx, key);
      const isEmpty = current === null || current === undefined || (typeof current === 'string' && current === '');
      if (isEmpty) setByDotPath(ctx, key, op?.value);
      steps.push({ action: 'transform.default_value', details: { key }, output: cloneJson(ctx) });
      i++;
      continue;
    }

    if (action === 'transform.replace_template') {
      const key = String(op?.key ?? '');
      const value = String(op?.value ?? '');
      const rendered = renderTemplate(value, ctx);
      setByDotPath(ctx, key, rendered);
      steps.push({ action: 'transform.replace_template', details: { key }, output: cloneJson(ctx) });
      i++;
      continue;
    }

    if (action === 'transform.pick') {
      const keys = Array.isArray(op?.value) ? op.value.map(String) : [];
      const picked = pickDotPaths(ctx, keys);
      steps.push({ action: 'transform.pick', details: { keys }, output: cloneJson(picked) });
      return { output: cloneJson(picked), workflowExecutionSteps: steps };
    }

    if (action === 'send.http_request') {
      const bodyMode =
        isRecord(op.body) && typeof (op.body as Record<string, unknown>).mode === 'string'
          ? String((op.body as Record<string, unknown>).mode)
          : undefined;
      const url = typeof op.url === 'string' ? op.url : '';
      const method = typeof op.method === 'string' ? op.method : undefined;
      steps.push({
        action: 'send.http_request',
        details: {
          dryRun: true,
          request: { method, url, bodyMode },
          note: 'Docs runner does not execute network requests from the browser. Use a workflow trigger to test real HTTP calls.',
        },
        output: cloneJson(ctx),
      });
      i++;
      continue;
    }

    if (action === 'if.start') {
      const actual = getByDotPath(ctx, String(op?.key ?? ''));
      const conditionMatched = evaluateFilterOp({ actual, op: String(op?.condition ?? ''), expected: op?.value });
      const end = startToEnd.get(i);
      steps.push({
        action: 'if.start',
        valid: true,
        details: { key: op?.key, condition: op?.condition, expected: op?.value, actual, conditionMatched },
        output: cloneJson(ctx),
      });
      if (!conditionMatched) {
        if (end !== undefined) {
          steps.push({ action: 'if.end', valid: true, details: { skipped: true }, output: cloneJson(ctx) });
          i = end + 1;
        } else {
          i = params.ops.length;
        }
        continue;
      }
      i++;
      continue;
    }

    if (action === 'if.end') {
      steps.push({ action: 'if.end', valid: true, details: {}, output: cloneJson(ctx) });
      i++;
      continue;
    }

    if (action === 'while.start') {
      const actual = getByDotPath(ctx, String(op?.key ?? ''));
      const conditionMatched = evaluateFilterOp({ actual, op: String(op?.condition ?? ''), expected: op?.value });
      const iteration = whileIterations.get(i) ?? 0;
      const end = startToEnd.get(i);
      steps.push({
        action: 'while.start',
        valid: true,
        details: { key: op?.key, condition: op?.condition, expected: op?.value, actual, iteration, conditionMatched },
        output: cloneJson(ctx),
      });

      if (!conditionMatched) {
        whileIterations.delete(i);
        if (end !== undefined) {
          steps.push({ action: 'while.end', valid: true, details: { skipped: true, iterations: iteration }, output: cloneJson(ctx) });
          i = end + 1;
        } else {
          i = params.ops.length;
        }
        continue;
      }

      i++;
      continue;
    }

    if (action === 'while.end') {
      const start = endToStart.get(i);
      if (start === undefined) {
        steps.push({ action: 'while.end', valid: false, details: { error: 'while.end has no matching while.start' }, output: cloneJson(ctx) });
        break;
      }

      const next = (whileIterations.get(start) ?? 0) + 1;
      whileIterations.set(start, next);
      steps.push({ action: 'while.end', valid: true, details: { iteration: next }, output: cloneJson(ctx) });
      if (next >= MAX_WHILE_ITERATIONS) break;
      i = start;
      continue;
    }

    if (action === 'create_or_update') {
      const key = String(op?.key ?? '');
      const before = getByDotPath(ctx, key);

      const inc = typeof op?.increment_by === 'number' ? op.increment_by : Number(String(op?.increment_by ?? '').trim());
      const def = typeof op?.default_value === 'number' ? op.default_value : Number(String(op?.default_value ?? '').trim());

      if (!Number.isFinite(inc) || !Number.isFinite(def)) {
        steps.push({ action: 'create_or_update', details: { key, error: 'increment_by/default_value must be numeric' }, output: cloneJson(ctx) });
        break;
      }

      if (before === null || before === undefined) {
        setByDotPath(ctx, key, def);
        steps.push({ action: 'create_or_update', details: { key, created: true, default_value: def }, output: cloneJson(ctx) });
        i++;
        continue;
      }

      const beforeNum = typeof before === 'number' ? before : Number(String(before).trim());
      if (!Number.isFinite(beforeNum)) {
        steps.push({ action: 'create_or_update', details: { key, error: 'existing value is not numeric', before }, output: cloneJson(ctx) });
        break;
      }

      const after = beforeNum + inc;
      setByDotPath(ctx, key, after);
      steps.push({ action: 'create_or_update', details: { key, created: false, before: beforeNum, increment_by: inc, after }, output: cloneJson(ctx) });
      i++;
      continue;
    }

    steps.push({ action: String(action ?? 'unknown'), details: { note: 'Unsupported operation in docs runner' }, output: cloneJson(ctx) });
    i++;
  }

  return { output: cloneJson(ctx), workflowExecutionSteps: steps };
}

export function OperationsPage(): ReactNode {
  const [selectedId, setSelectedId] = useState<OperationDoc['id']>(DEFAULT_SELECTED_OPERATION_ID);
  const selected = useMemo(() => DOCS.find((d) => d.id === selectedId)!, [selectedId]);

  const [tryUsageText, setTryUsageText] = useState(() => JSON.stringify(selected.usage, null, 2));
  const [tryUsageParseError, setTryUsageParseError] = useState<string | null>(null);

  const [tryInputText, setTryInputText] = useState(() => JSON.stringify(selected.sampleInput, null, 2));
  const [tryParseError, setTryParseError] = useState<string | null>(null);

  const [slackTestUrl, setSlackTestUrl] = useState<string>('');
  const [slackTestText, setSlackTestText] = useState<string>('test');
  const [slackTestBusy, setSlackTestBusy] = useState(false);
  const [slackTestError, setSlackTestError] = useState<string | null>(null);
  const [slackTestResult, setSlackTestResult] = useState<string | null>(null);

  useEffect(() => {
    setTryUsageText(JSON.stringify(selected.usage, null, 2));
    setTryUsageParseError(null);
    setTryInputText(JSON.stringify(selected.sampleInput, null, 2));
    setTryParseError(null);

    setSlackTestError(null);
    setSlackTestResult(null);
    setSlackTestBusy(false);
    setSlackTestText('test');
    if (selected.id !== 'send.http_request') {
      setSlackTestUrl('');
    }
  }, [selectedId, selected.sampleInput]);

  useEffect(() => {
    if (selected.id !== 'send.http_request') return;
    try {
      const parsed: unknown = JSON.parse(tryUsageText);
      const opCandidate = Array.isArray(parsed)
        ? parsed.find((x) => getAction(x) === 'send.http_request' || getAction(x) === 'fetch.http_request')
        : parsed;
      const op = isRecord(opCandidate) ? opCandidate : null;
      const url = typeof op?.url === 'string' ? op.url : '';
      if (url) setSlackTestUrl(url);
    } catch {
      // ignore
    }
  }, [selected.id, tryUsageText]);

  useEffect(() => {
    try {
      JSON.parse(tryUsageText);
      setTryUsageParseError(null);
    } catch (e) {
      setTryUsageParseError(e instanceof Error ? e.message : String(e));
    }
  }, [tryUsageText]);

  useEffect(() => {
    try {
      JSON.parse(tryInputText);
      setTryParseError(null);
    } catch (e) {
      setTryParseError(e instanceof Error ? e.message : String(e));
    }
  }, [tryInputText]);

  const tryRun = useMemo(() => {
    try {
      const usage = JSON.parse(tryUsageText) as unknown;
      const input = JSON.parse(tryInputText) as unknown;
      const ops = Array.isArray(usage) ? usage : [usage];
      return runDocWorkflow({ ops, input });
    } catch {
      return null;
    }
  }, [tryInputText, tryUsageText]);

  const listIdsForDoc = (doc: OperationDoc): string[] => {
    if (doc.id === 'if.start') return ['if.start', 'if.end'];
    if (doc.id === 'while.start') return ['while.start', 'while.end'];
    return [doc.id];
  };

  async function onSlackTest(): Promise<void> {
    setSlackTestError(null);
    setSlackTestResult(null);

    const url = slackTestUrl.trim();
    const text = slackTestText.trim();

    if (!url) {
      setSlackTestError('Slack webhook URL is required');
      return;
    }

    if (!isSlackWebhookUrl(url)) {
      setSlackTestError('Invalid Slack webhook URL (expected https://hooks.slack.com/services/...)');
      return;
    }

    if (!text) {
      setSlackTestError('Message text is required');
      return;
    }

    setSlackTestBusy(true);
    try {
      const res = await testSlackWebhook({ url, text, timeoutMs: 10_000, retries: 0 });
      setSlackTestResult(JSON.stringify(res, null, 2));
    } catch (e) {
      setSlackTestError(e instanceof Error ? e.message : String(e));
    } finally {
      setSlackTestBusy(false);
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{OPERATIONS_PAGE_TEXT.title}</h1>
        <div className={styles.headerActions}>
          <Link to="/workflows">{OPERATIONS_PAGE_TEXT.workflowsLink}</Link>
          <button
            type="button"
            onClick={() => {
              clearAuthToken();
              window.location.href = '/login';
            }}
          >
            {OPERATIONS_PAGE_TEXT.logout}
          </button>
        </div>
      </header>

      <p className={styles.intro}>{OPERATIONS_PAGE_TEXT.intro}</p>

      <section className={styles.layout}>
        <div className={`${styles.panel} ${styles.listPanel}`}>
          <div className={styles.listLabel}>{OPERATIONS_PAGE_TEXT.listLabel}</div>
          {DOCS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedId(d.id)}
              className={`${styles.listButton} ${d.id === selectedId ? styles.listButtonSelected : ''}`}
            >
              {listIdsForDoc(d).map((id) => (
                <div key={id} className={styles.listButtonId}>
                  {id}
                </div>
              ))}
              <div className={styles.listButtonKind}>Operation</div>
            </button>
          ))}
        </div>

        <div className={styles.panel}>
          <h2 className={styles.selectedTitle}>{selected.title}</h2>
          <div className={styles.summary}>{selected.summary}</div>

          <div className={styles.grid}>
            <div className={styles.colHead}>{OPERATIONS_PAGE_TEXT.usage}</div>
            <div className={styles.colHead}>{OPERATIONS_PAGE_TEXT.inputEditable}</div>
            <div className={styles.colHead}>{OPERATIONS_PAGE_TEXT.output}</div>

            <div>
              <textarea
                spellCheck={false}
                className={`${styles.codeBlock} ${styles.codeTextarea}`}
                value={tryUsageText}
                onChange={(e) => setTryUsageText(e.target.value)}
              />
              {tryUsageParseError ? (
                <div className={styles.parseError}>
                  {OPERATIONS_PAGE_TEXT.invalidJsonPrefix} {tryUsageParseError}
                </div>
              ) : null}
            </div>

            <div>
              <textarea
                spellCheck={false}
                className={`${styles.codeBlock} ${styles.codeTextarea}`}
                value={tryInputText}
                onChange={(e) => setTryInputText(e.target.value)}
              />
              {tryParseError ? (
                <div className={styles.parseError}>
                  {OPERATIONS_PAGE_TEXT.invalidJsonPrefix} {tryParseError}
                </div>
              ) : null}
            </div>

            <pre className={styles.codeBlock}>
              {JSON.stringify(
                tryRun?.workflowExecutionSteps ?? selected.sampleWorkflowExecutionSteps,
                null,
                2,
              )}
            </pre>
          </div>

          {selected.id === 'send.http_request' ? (
            <div className={styles.notes}>
              {OPERATIONS_PAGE_TEXT.sendHttpNotesPrefix} {OPERATIONS_PAGE_TEXT.sendHttpNotes}

              <div className={styles.slackTestRow}>
                <input
                  className={styles.slackTestInput}
                  value={slackTestUrl}
                  onChange={(e) => setSlackTestUrl(e.target.value)}
                  placeholder="SLACK_WEBHOOK_URL"
                  disabled={slackTestBusy}
                />
                <input
                  className={styles.slackTestInput}
                  value={slackTestText}
                  onChange={(e) => setSlackTestText(e.target.value)}
                  placeholder="Message text"
                  disabled={slackTestBusy}
                />
                <button type="button" onClick={() => void onSlackTest()} disabled={slackTestBusy}>
                  Test
                </button>
              </div>

              {slackTestError ? <div className={styles.parseError}>{slackTestError}</div> : null}
              {slackTestResult ? <pre className={styles.codeBlock}>{slackTestResult}</pre> : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
