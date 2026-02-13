import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import cx from 'classnames';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createWorkflow,
  getWorkflowDefaults,
  getWorkflow,
  listRuns,
  triggerWorkflow,
  updateWorkflow,
} from '../api';
import type { Workflow, WorkflowRunListItem } from '../types';
import { StepsEditor } from '../components/StepsEditor';
import styles from './WorkflowEditorPage.module.css';


function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function coerceRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function deriveNameFromId(id: unknown): string {
  if (typeof id !== 'string') return '';
  const base = id.replace(/_+/g, ' ').trim().replace(/\s+/g, ' ');
  if (!base) return '';
  return base.charAt(0).toUpperCase() + base.slice(1);
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

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const DEFAULT_WORKFLOW_JSON = JSON.stringify(
  {
    id: 'Test',
    name: 'Test',
    enabled: true,
    trigger: {
      type: 'http',
    },
    steps: [
      {
        type: 'filter',
        conditions: [
          { path: 'key', op: 'eq', value: 'test' },
          { path: 'value', op: 'neq', value: '' },
        ],
      },
      {
        type: 'transform',
        ops: [
          { op: 'default', path: 'value', value: 'test' },
          { op: 'template', to: 'title', template: 'Replace {{key}} by {{value}}' },
        ],
      },
      {
        type: 'http_request',
        method: 'POST',
        url: '',
        headers: { 'content-type': 'application/json' },
        body: { mode: 'custom', value: { text: '{{title}}' } },
        timeoutMs: 2000,
        retries: 3,
      },
    ],
  },
  null,
  2,
);

export function WorkflowEditorPage(props: { mode: 'create' | 'edit' }): ReactNode {
  const navigate = useNavigate();
  const params = useParams();
  const workflowId = params.id ?? null;

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<WorkflowRunListItem[] | null>(null);
  const [workflowJson, setWorkflowJson] = useState(DEFAULT_WORKFLOW_JSON);
  const [lastGoodWorkflow, setLastGoodWorkflow] = useState<Record<string, unknown>>(() =>
    coerceRecord(JSON.parse(DEFAULT_WORKFLOW_JSON) as unknown),
  );
  const [inputJson, setInputJson] = useState(JSON.stringify({ key: 'test', value: 'test' }, null, 2));

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);
  const [lastAutoName, setLastAutoName] = useState(() => deriveNameFromId(JSON.parse(DEFAULT_WORKFLOW_JSON)?.id));
  const [autoNameSource, setAutoNameSource] = useState<'derived' | 'server-default'>(() => 'derived');

  function setWorkflowFields(patch: Record<string, unknown>) {
    const base = parsedWorkflow.ok && isRecord(parsedWorkflow.value) ? parsedWorkflow.value : lastGoodWorkflow;
    const next = { ...base, ...patch };
    setLastGoodWorkflow(next);
    setWorkflowJson(JSON.stringify(next, null, 2));
  }

  const canLoad = props.mode === 'edit' && !!workflowId;

  async function reloadRuns(id: string) {
    const data = await listRuns(id);
    setRuns(data);
  }

  useEffect(() => {
    if (!canLoad) return;

    setError(null);
    void getWorkflow(workflowId)
      .then((w) => {
        setWorkflow(w);
        const next = {
          id: w.id,
          name: w.name,
          enabled: w.enabled,
          trigger: { type: 'http' },
          steps: w.steps ?? [],
        };
        setLastGoodWorkflow(next);
        setWorkflowJson(JSON.stringify(next, null, 2));
        return reloadRuns(w.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [canLoad, workflowId]);

  const parsedWorkflow = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(workflowJson) as unknown };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [workflowJson]);

  // Create-mode defaults: id is <ownerIndexInTotalUsers>/(count+1) and name is <email>-workflow-<n>
  useEffect(() => {
    if (props.mode !== 'create') return;
    if (!parsedWorkflow.ok) return;

    if (!isRecord(parsedWorkflow.value)) return;

    const currentId = parsedWorkflow.value.id;
    const currentName = parsedWorkflow.value.name;

    // Only auto-apply defaults if user hasn't changed away from the initial template.
    if (currentName !== 'Test' || currentId !== currentName) return;

    void getWorkflowDefaults()
      .then((d) => {
        setNameManuallyEdited(false);
        setIdManuallyEdited(false);
        setLastAutoName(d.name);
        setAutoNameSource('server-default');
        setWorkflowFields({ id: d.id, name: d.name });
      })
      .catch(() => {
        // non-fatal; keep the built-in template values
      });
  }, [props.mode, parsedWorkflow.ok, parsedWorkflow.ok ? parsedWorkflow.value : null]);

  useEffect(() => {
    if (parsedWorkflow.ok) {
      setLastGoodWorkflow(coerceRecord(parsedWorkflow.value));
    }
  }, [parsedWorkflow.ok, parsedWorkflow.ok ? parsedWorkflow.value : null]);

  useEffect(() => {
    if (props.mode !== 'create') return;
    if (!parsedWorkflow.ok) return;
    if (autoNameSource !== 'derived') return;
    if (!isRecord(parsedWorkflow.value)) return;

    const currentId = parsedWorkflow.value.id;
    const currentName = parsedWorkflow.value.name;
    if (typeof currentId === 'string' && typeof currentName === 'string' && currentId !== currentName) {
      setIdManuallyEdited(true);
    }
  }, [props.mode, parsedWorkflow.ok, parsedWorkflow.ok ? parsedWorkflow.value : null, autoNameSource]);

  useEffect(() => {
    if (props.mode !== 'create') return;
    if (!parsedWorkflow.ok) return;
    if (nameManuallyEdited) return;
    if (autoNameSource !== 'derived') return;

    if (!isRecord(parsedWorkflow.value)) return;

    const currentId = parsedWorkflow.value.id;
    const currentName = typeof parsedWorkflow.value.name === 'string' ? parsedWorkflow.value.name : '';
    if (currentName) return;

    const derived = deriveNameFromId(currentId);
    if (!derived) return;

    setLastAutoName(derived);
    setWorkflowField('name', derived);
  }, [props.mode, parsedWorkflow.ok, parsedWorkflow.ok ? parsedWorkflow.value : null, nameManuallyEdited, autoNameSource]);

  const parsedValue = parsedWorkflow.ok && isRecord(parsedWorkflow.value) ? parsedWorkflow.value : null;
  const name = parsedValue && typeof parsedValue.name === 'string' ? parsedValue.name : '';
  const enabled = parsedValue && typeof parsedValue.enabled === 'boolean' ? parsedValue.enabled : true;
  const stepsValue = parsedValue ? parsedValue.steps : undefined;

  const httpRequestUrl = useMemo(() => {
    const wf = parsedWorkflow.ok && isRecord(parsedWorkflow.value) ? parsedWorkflow.value : lastGoodWorkflow;
    const stepsRaw = wf.steps;
    const steps = Array.isArray(stepsRaw) ? stepsRaw : [];
    const step = steps.find((s): s is Record<string, unknown> => {
      if (!isRecord(s)) return false;
      return s.type === 'http_request';
    });
    return typeof step?.url === 'string' ? step.url : '';
  }, [parsedWorkflow.ok, parsedWorkflow.ok ? parsedWorkflow.value : null, lastGoodWorkflow]);

  function setWorkflowField(field: 'name' | 'enabled', value: unknown) {
    const base = parsedWorkflow.ok && isRecord(parsedWorkflow.value) ? parsedWorkflow.value : lastGoodWorkflow;
    const next = { ...base, [field]: value };
    setLastGoodWorkflow(next);
    setWorkflowJson(JSON.stringify(next, null, 2));
  }

  function setHttpRequestUrl(url: string) {
    const base = parsedWorkflow.ok && isRecord(parsedWorkflow.value) ? parsedWorkflow.value : lastGoodWorkflow;
    const steps: unknown[] = Array.isArray(base.steps) ? [...base.steps] : [];
    const idx = steps.findIndex((s) => {
      if (!isRecord(s)) return false;
      return s.type === 'http_request';
    });

    if (idx === -1) {
      steps.push({ type: 'http_request', method: 'POST', url, timeoutMs: 2000, retries: 3 });
    } else {
      const existing = steps[idx];
      if (isRecord(existing)) {
        steps[idx] = {
          ...existing,
          type: 'http_request',
          method: typeof existing.method === 'string' ? existing.method : 'POST',
          url,
        };
      } else {
        steps[idx] = { type: 'http_request', method: 'POST', url, timeoutMs: 2000, retries: 3 };
      }
    }

    const next = { ...base, steps };
    setLastGoodWorkflow(next);
    setWorkflowJson(JSON.stringify(next, null, 2));
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    setTriggerResult(null);

    try {
      if (!parsedWorkflow.ok) {
        throw new Error(`Workflow JSON is invalid: ${parsedWorkflow.error}`);
      }

      if (typeof name !== 'string' || name.trim() === '') {
        throw new Error('Workflow name is required');
      }
      if (!Array.isArray(stepsValue)) {
        throw new Error('Workflow steps must be an array');
      }

      const httpRequestIndex = stepsValue.findIndex(
        (s) => isRecord(s) && s.type === 'http_request',
      );
      if (httpRequestIndex !== -1 && httpRequestIndex !== stepsValue.length - 1) {
        throw new Error('Invalid workflow: http_request must be the last step (no steps allowed after it)');
      }

      const httpRequestStep = stepsValue.find(
        (s): s is Record<string, unknown> => isRecord(s) && s.type === 'http_request',
      );
      if (httpRequestStep) {
        const url = typeof httpRequestStep.url === 'string' ? httpRequestStep.url.trim() : '';
        if (!url) {
          throw new Error('HTTP request URL (http_request) is required');
        }

        if (!isHttpUrl(url) && !isSlackWebhookUrl(url)) {
          throw new Error('HTTP request URL must be a valid http(s) URL');
        }
      }

      if (props.mode === 'create') {
        const rawId =
          isRecord(parsedWorkflow.value) && typeof parsedWorkflow.value.id === 'string'
            ? parsedWorkflow.value.id
            : undefined;

        const id =
          autoNameSource === 'derived' && !idManuallyEdited && typeof rawId === 'string' && rawId === name ? undefined : rawId;

        const created = await createWorkflow({ id, name, enabled, steps: stepsValue });
        navigate(`/workflows/${encodeURIComponent(created.id)}`);
        return;
      }

      if (!workflowId) throw new Error('Missing workflow id');
      const updated = await updateWorkflow(workflowId, { name, enabled, steps: stepsValue });
      setWorkflow(updated);
      await reloadRuns(updated.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onTrigger() {
    if (!workflow) return;
    if (!lastGoodWorkflow?.enabled) return;

    setBusy(true);
    setError(null);
    setTriggerResult(null);

    try {
      const input = JSON.parse(inputJson) as unknown;
      const triggerPath = workflow.triggerPath;
      if (!triggerPath) throw new Error('Missing workflow trigger path');
      const res = await triggerWorkflow(triggerPath, input);
      setTriggerResult(JSON.stringify(res, null, 2));
      await reloadRuns(workflow.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const title = props.mode === 'create' ? 'Create workflow' : 'Edit workflow';


  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <Link to="/workflows">Back to list</Link>
      </header>

      {error ? (
        <div className={styles.errorBox}>{error}</div>
      ) : null}

      <section className={styles.twoCol}>
        <div>
          <label className={styles.label}>
            Trigger URL
            <div className={styles.row}>
              <input
                className={cx(styles.input, styles.triggerUrlInput)}
                value={workflow?.triggerUrl ?? workflow?.triggerPath ?? 'TO BE GENERATED'}
                disabled
              />
              <button
                type="button"
                disabled={!workflow?.triggerUrl && !workflow?.triggerPath}
                onClick={() => {
                  const t = workflow?.triggerUrl ?? workflow?.triggerPath;
                  if (t) void navigator.clipboard?.writeText(t);
                }}
              >
                Copy
              </button>
            </div>
          </label>

          <label className={styles.label}>
            Name
            <input
              className={styles.input}
              value={typeof lastGoodWorkflow?.name === 'string' ? lastGoodWorkflow.name : ''}
              onChange={(e) => {
                setNameManuallyEdited(true);
                const nextName = e.target.value;
                if (props.mode === 'create' && autoNameSource === 'derived' && !idManuallyEdited) {
                  setWorkflowFields({ name: nextName, id: nextName });
                } else {
                  setWorkflowField('name', nextName);
                }
              }}
              disabled={busy}
            />
          </label>

          <label className={styles.label}>
            HTTP request URL (http_request)
            <input
              className={styles.input}
              value={httpRequestUrl}
              onChange={(e) => setHttpRequestUrl(e.target.value)}
              disabled={busy}
              placeholder="https://example.com/webhook (or Slack webhook URL)"
            />
          </label>

          <label className={cx(styles.label, styles.enabledRow)}>
            <input
              type="checkbox"
              checked={!!lastGoodWorkflow?.enabled}
              onChange={(e) => setWorkflowField('enabled', e.target.checked)}
              disabled={busy}
            />
            Enabled
          </label>

          <div className={styles.actions}>
            <button type="button" onClick={() => void onSave()} disabled={busy || !parsedWorkflow.ok || name.trim() === ''}>
              Save
            </button>
          </div>

          {!parsedWorkflow.ok ? (
            <div className={styles.jsonError}>Workflow JSON parse error: {parsedWorkflow.error}</div>
          ) : null}
        </div>

        <div>
          <div className={styles.mutedLabel}>Workflow (JSON)</div>
          <StepsEditor value={workflowJson} onChange={setWorkflowJson} />
        </div>
      </section>

      <div className={styles.sectionNote}>
        Workflows have <b>steps</b> (ordered list). Each item uses <b>type</b> to select behavior, and reads/writes <b>ctx</b>.
      </div>

      {workflow ? (
        <section>
          <h2 className={styles.subHeader}>Trigger test</h2>
          <div className={styles.triggerTestGrid}>
            <div>
              <div className={styles.mutedLabel}>ctx (JSON)</div>
              <textarea
                className={cx(styles.input, styles.textarea)}
                value={inputJson}
                onChange={(e) => setInputJson(e.target.value)}
              />
              <div className={styles.mt8}>
                <button type="button" onClick={() => void onTrigger()} disabled={busy || !lastGoodWorkflow?.enabled}>
                  Trigger
                </button>
              </div>
            </div>
            <div className={styles.resultCol}>
              <div className={styles.mutedLabel}>Workflow Response</div>
              <pre className={styles.pre}>
                {triggerResult ?? '—'}
              </pre>
            </div>
          </div>

          <h2 className={styles.runsHeader}>Recent runs</h2>
          {runs === null ? <div>Loading runs…</div> : null}
          {runs && runs.length === 0 ? <div>No runs yet.</div> : null}
          {runs && runs.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th align="left" className={styles.th}>Run</th>
                  <th align="left" className={styles.th}>Status</th>
                  <th align="left" className={styles.th}>Started</th>
                  <th align="left" className={styles.th}>Finished</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.td}>
                      <Link to={`/runs/${r.id}`}>{r.id}</Link>
                    </td>
                    <td className={styles.td}>{r.status}</td>
                    <td className={styles.td}>{new Date(r.startedAt).toLocaleString()}</td>
                    <td className={styles.td}>{r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
