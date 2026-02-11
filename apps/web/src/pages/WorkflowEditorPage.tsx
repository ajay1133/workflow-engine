import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
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

const DEFAULT_WORKFLOW_JSON = JSON.stringify(
  {
    id: 'test',
    name: 'Test',
    enabled: true,
    trigger: {
      type: 'http',
    },
    steps: [
      { action: 'filter.compare', key: 'key', condition: 'eq', value: 'test' },
      { action: 'filter.compare', key: 'value', condition: 'noteq', value: '' },
      { action: 'transform.default_value', key: 'value', value: 'test' },
      { action: 'transform.replace_template', key: 'title', value: 'Replace {{key}} by {{value}}' },
      {
        action: 'send.http_request',
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
    if (currentId !== 'test' || currentName !== 'Test') return;

    void getWorkflowDefaults()
      .then((d) => {
        setNameManuallyEdited(false);
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
    if (nameManuallyEdited) return;
    if (autoNameSource !== 'derived') return;

    if (!isRecord(parsedWorkflow.value)) return;

    const currentId = parsedWorkflow.value.id;
    const derived = deriveNameFromId(currentId);
    if (!derived) return;

    const currentName = typeof parsedWorkflow.value.name === 'string' ? parsedWorkflow.value.name : '';

    if (currentName && currentName !== derived && currentName !== lastAutoName) {
      setNameManuallyEdited(true);
      setLastAutoName(derived);
      return;
    }

    if (!currentName || currentName === lastAutoName) {
      setLastAutoName(derived);
      if (currentName !== derived) setWorkflowField('name', derived);
    }
  }, [
    props.mode,
    parsedWorkflow.ok,
    parsedWorkflow.ok ? parsedWorkflow.value : null,
    nameManuallyEdited,
    lastAutoName,
    autoNameSource,
  ]);

  const parsedValue = parsedWorkflow.ok && isRecord(parsedWorkflow.value) ? parsedWorkflow.value : null;
  const name = parsedValue && typeof parsedValue.name === 'string' ? parsedValue.name : '';
  const enabled = parsedValue && typeof parsedValue.enabled === 'boolean' ? parsedValue.enabled : true;
  const stepsValue = parsedValue ? parsedValue.steps : undefined;

  const sendUrl = useMemo(() => {
    const wf = parsedWorkflow.ok && isRecord(parsedWorkflow.value) ? parsedWorkflow.value : lastGoodWorkflow;
    const stepsRaw = wf.steps;
    const steps = Array.isArray(stepsRaw) ? stepsRaw : [];
    const op = steps.find(
      (s): s is Record<string, unknown> =>
        isRecord(s) &&
        (s.action === 'send.http_request' || s.type === 'send.http_request' || s.type === 'fetch.http_request'),
    );
    return typeof op?.url === 'string' ? op.url : '';
  }, [parsedWorkflow.ok, parsedWorkflow.ok ? parsedWorkflow.value : null, lastGoodWorkflow]);

  function setWorkflowField(field: 'name' | 'enabled', value: unknown) {
    const base = parsedWorkflow.ok && isRecord(parsedWorkflow.value) ? parsedWorkflow.value : lastGoodWorkflow;
    const next = { ...base, [field]: value };
    setLastGoodWorkflow(next);
    setWorkflowJson(JSON.stringify(next, null, 2));
  }

  function setSendHttpUrl(url: string) {
    const base = parsedWorkflow.ok && isRecord(parsedWorkflow.value) ? parsedWorkflow.value : lastGoodWorkflow;
    const steps: unknown[] = Array.isArray(base.steps) ? [...base.steps] : [];
    const idx = steps.findIndex(
      (s) =>
        isRecord(s) &&
        (s.action === 'send.http_request' || s.type === 'send.http_request' || s.type === 'fetch.http_request'),
    );

    if (idx === -1) {
      steps.push({ action: 'send.http_request', method: 'POST', url });
    } else {
      const existing = steps[idx];
      if (isRecord(existing)) {
        steps[idx] = {
          ...existing,
          action:
            typeof existing.action === 'string'
              ? existing.action
              : existing.type === 'fetch.http_request'
                ? 'send.http_request'
                : typeof existing.type === 'string'
                  ? existing.type
                  : 'send.http_request',
          method: typeof existing.method === 'string' ? existing.method : 'POST',
          url,
        };
      } else {
        steps[idx] = { action: 'send.http_request', method: 'POST', url };
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

      // send.http_request requires an explicit Slack webhook URL.
      const sendOp = stepsValue.find(
        (s): s is Record<string, unknown> =>
          isRecord(s) &&
          (s.action === 'send.http_request' || s.type === 'send.http_request' || s.type === 'fetch.http_request'),
      );
      if (sendOp) {
        const url = typeof sendOp.url === 'string' ? sendOp.url.trim() : '';
        if (!url) {
          throw new Error('Send URL (send.http_request) is required');
        }
        if (!isSlackWebhookUrl(url)) {
          throw new Error('Send URL must be a valid Slack webhook URL (https://hooks.slack.com/services/...)');
        }
      }

      if (props.mode === 'create') {
        const id =
          isRecord(parsedWorkflow.value) && typeof parsedWorkflow.value.id === 'string'
            ? parsedWorkflow.value.id
            : undefined;
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
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <Link to="/workflows">Back to list</Link>
      </header>

      {error ? (
        <div style={{ background: '#ffecec', border: '1px solid #f5b5b5', padding: 12, marginTop: 12 }}>{error}</div>
      ) : null}

      <section style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={label}>
            Trigger URL
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                style={{ ...input, marginTop: 6, flex: 1, background: '#f7f7f7' }}
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

          <label style={label}>
            Name
            <input
              style={input}
              value={typeof lastGoodWorkflow?.name === 'string' ? lastGoodWorkflow.name : ''}
              onChange={(e) => {
                setNameManuallyEdited(true);
                setWorkflowField('name', e.target.value);
              }}
              disabled={busy}
            />
          </label>

          <label style={label}>
            Send URL (send.http_request)
            <input
              style={input}
              value={sendUrl}
              onChange={(e) => setSendHttpUrl(e.target.value)}
              disabled={busy}
              placeholder="SLACK_WEBHOOK_URL"
            />
          </label>

          <label style={{ ...label, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={!!lastGoodWorkflow?.enabled}
              onChange={(e) => setWorkflowField('enabled', e.target.checked)}
              disabled={busy}
            />
            Enabled
          </label>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void onSave()} disabled={busy || !parsedWorkflow.ok || name.trim() === ''}>
              Save
            </button>
          </div>

          {!parsedWorkflow.ok ? (
            <div style={{ marginTop: 8, color: '#b00020' }}>Workflow JSON parse error: {parsedWorkflow.error}</div>
          ) : null}
        </div>

        <div>
          <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>Workflow (JSON)</div>
          <StepsEditor value={workflowJson} onChange={setWorkflowJson} />
        </div>
      </section>

      <div style={{ color: '#777', fontSize: 12, marginTop: 10 }}>
        Workflows have <b>steps</b> (ordered list of operations). Each item uses <b>action</b> to select behavior.
      </div>

      {workflow ? (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ margin: '0 0 8px 0' }}>Trigger test</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>Input (JSON)</div>
              <textarea style={{ ...input, minHeight: 200, fontFamily: 'ui-monospace, Menlo, monospace' }} value={inputJson} onChange={(e) => setInputJson(e.target.value)} />
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={() => void onTrigger()} disabled={busy || !lastGoodWorkflow?.enabled}>
                  Trigger
                </button>
              </div>
            </div>
            <div style={{ minWidth: 0, marginLeft: 25, marginTop: -7 }}>
              <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>Workflow Response</div>
              <pre style={{ background: '#f7f7f7', padding: 12, minHeight: 200, overflow: 'auto', maxWidth: '100%' }}>
                {triggerResult ?? '—'}
              </pre>
            </div>
          </div>

          <h2 style={{ margin: '16px 0 8px 0' }}>Recent runs</h2>
          {runs === null ? <div>Loading runs…</div> : null}
          {runs && runs.length === 0 ? <div>No runs yet.</div> : null}
          {runs && runs.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th align="left" style={th}>Run</th>
                  <th align="left" style={th}>Status</th>
                  <th align="left" style={th}>Started</th>
                  <th align="left" style={th}>Finished</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>
                      <Link to={`/runs/${r.id}`}>{r.id}</Link>
                    </td>
                    <td style={td}>{r.status}</td>
                    <td style={td}>{new Date(r.startedAt).toLocaleString()}</td>
                    <td style={td}>{r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '—'}</td>
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

const label: CSSProperties = {
  display: 'block',
  marginBottom: 10,
  color: '#333',
  fontSize: 13,
};

const input: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ccc',
  borderRadius: 6,
  marginTop: 6,
};

const th: CSSProperties = {
  borderBottom: '1px solid #ddd',
  padding: '10px 8px',
  fontWeight: 600,
  color: '#333',
};

const td: CSSProperties = {
  borderBottom: '1px solid #eee',
  padding: '10px 8px',
  verticalAlign: 'top',
};
