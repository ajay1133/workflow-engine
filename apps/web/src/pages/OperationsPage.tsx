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
  if (op === 'neq') return !isEqual(actual, expected);

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

function deepTemplate(value: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof value === 'string') return renderTemplate(value, ctx);
  if (Array.isArray(value)) return value.map((v) => deepTemplate(v, ctx));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepTemplate(v, ctx);
    }
    return out;
  }
  return value;
}

function runDocWorkflow(params: {
  steps: unknown[];
  ctxInput: unknown;
}): { output: unknown; workflowExecutionSteps: unknown[] } {
  let ctx = coerceInputToCtx(params.ctxInput);
  const trace: unknown[] = [];

  for (const stepRaw of params.steps) {
    const step = isRecord(stepRaw) ? (stepRaw as Record<string, unknown>) : {};
    const type = typeof step.type === 'string' ? step.type : undefined;

    if (type === 'filter') {
      const conditionsRaw = Array.isArray(step.conditions) ? step.conditions : [];
      const conditions = conditionsRaw.filter(isRecord) as Array<Record<string, unknown>>;

      let passed = true;
      const details = conditions.map((c) => {
        const path = typeof c.path === 'string' ? c.path : '';
        const op = typeof c.op === 'string' ? c.op : '';
        const expected = c.value;
        const actual = getByDotPath(ctx, path);
        const conditionPassed = evaluateFilterOp({ actual, op, expected });
        if (!conditionPassed) passed = false;
        return { path, op, value: expected, actual, passed: conditionPassed };
      });

      trace.push({
        action: 'filter',
        passed,
        details: { conditions: details },
        output: cloneJson(ctx),
      });

      if (!passed) break;
      continue;
    }

    if (type === 'transform') {
      const opsRaw = Array.isArray(step.ops) ? step.ops : [];
      const ops = opsRaw.filter(isRecord) as Array<Record<string, unknown>>;
      const opSummaries: Array<Record<string, unknown>> = [];

      for (const op of ops) {
        const opType = typeof op.op === 'string' ? op.op : undefined;
        if (!opType) continue;

        if (opType === 'default') {
          const path = typeof op.path === 'string' ? op.path : '';
          const current = getByDotPath(ctx, path);
          const isEmpty = current === null || current === undefined || (typeof current === 'string' && current === '');
          if (isEmpty) setByDotPath(ctx, path, op.value);
          opSummaries.push({ op: 'default', path });
          continue;
        }

        if (opType === 'template') {
          const to = typeof op.to === 'string' ? op.to : '';
          const template = typeof op.template === 'string' ? op.template : '';
          setByDotPath(ctx, to, renderTemplate(template, ctx));
          opSummaries.push({ op: 'template', to });
          continue;
        }

        if (opType === 'pick') {
          const paths = Array.isArray(op.paths) ? op.paths.map(String) : [];
          ctx = pickDotPaths(ctx, paths);
          opSummaries.push({ op: 'pick', paths });
          continue;
        }

        opSummaries.push({ op: opType, note: 'Unsupported op in docs runner' });
      }

      trace.push({ action: 'transform', details: { ops: opSummaries }, output: cloneJson(ctx) });
      continue;
    }

    if (type === 'http_request') {
      const url = typeof step.url === 'string' ? step.url : '';
      const method = typeof step.method === 'string' ? step.method : undefined;
      const bodyMode =
        isRecord(step.body) && typeof (step.body as Record<string, unknown>).mode === 'string'
          ? String((step.body as Record<string, unknown>).mode)
          : undefined;

      trace.push({
        action: 'http_request',
        details: {
          dryRun: true,
          request: { method, url, bodyMode },
          note: 'Docs runner does not execute network requests from the browser. Use a workflow trigger to test real HTTP calls.',
        },
        output: cloneJson(ctx),
      });

      // Mirror server behavior: headers/body can be templated, but we do not execute the request here.
      void deepTemplate(step.headers, ctx);
      void deepTemplate(step.body, ctx);
      continue;
    }

    trace.push({ action: String(type ?? 'unknown'), details: { note: 'Unsupported step type in docs runner' }, output: cloneJson(ctx) });
  }

  return { output: cloneJson(ctx), workflowExecutionSteps: trace };
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
    if (selected.id !== 'http_request') {
      setSlackTestUrl('');
    }
  }, [selectedId, selected.sampleInput]);

  useEffect(() => {
    if (selected.id !== 'http_request') return;
    try {
      const parsed: unknown = JSON.parse(tryUsageText);
      const stepCandidate = Array.isArray(parsed)
        ? parsed.find((x) => isRecord(x) && (x as Record<string, unknown>).type === 'http_request')
        : parsed;
      const step = isRecord(stepCandidate) ? stepCandidate : null;
      const url = typeof step?.url === 'string' ? step.url : '';
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
      const steps = Array.isArray(usage) ? usage : [usage];
      return runDocWorkflow({ steps, ctxInput: input });
    } catch {
      return null;
    }
  }, [tryInputText, tryUsageText]);

  const listIdsForDoc = (doc: OperationDoc): string[] => {
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
              <div className={styles.listButtonKind}>Step</div>
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

          {selected.id === 'http_request' ? (
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
