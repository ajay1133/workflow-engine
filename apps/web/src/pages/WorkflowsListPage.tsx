import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteWorkflow, listWorkflows } from '../api';
import { clearAuthToken } from '../auth';
import type { Workflow } from '../types';

export function WorkflowsListPage(): ReactNode {
  const [rows, setRows] = useState<Workflow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  async function load() {
    setError(null);
    const data = await listWorkflows();
    setRows(data);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const sorted = useMemo(() => (rows ?? []).slice(), [rows]);
  const visible = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Workflow Engine</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to="/operations">Operations</Link>
          <Link to="/workflows/new">Create workflow</Link>
          <button
            type="button"
            onClick={() => {
              clearAuthToken();
              window.location.href = '/login';
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <p style={{ color: '#555' }}>HTTP-triggered workflows; execution is queued via SQS.</p>

      {error ? (
        <div style={{ background: '#ffecec', border: '1px solid #f5b5b5', padding: 12 }}>{error}</div>
      ) : null}

      {rows === null ? <div>Loading…</div> : null}

      {rows && rows.length === 0 ? <div>No workflows yet.</div> : null}

      {rows && rows.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left" style={th}>Name</th>
              <th align="left" style={th}>Enabled</th>
              <th align="left" style={th}>Trigger</th>
              <th align="left" style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((w) => (
              <tr key={w.id}>
                <td style={td}>
                  <Link to={`/workflows/${encodeURIComponent(w.id)}`}>{w.name}</Link>
                </td>
                <td style={td}>{w.enabled ? 'Yes' : 'No'}</td>
                <td style={{ ...td, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {w.triggerUrl ?? w.triggerPath ?? '—'}
                </td>
                <td style={td}>
                  <button
                    type="button"
                    disabled={busyId === w.id}
                    onClick={() => {
                      setBusyId(w.id);
                      void deleteWorkflow(w.id)
                        .then(load)
                        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                        .finally(() => setBusyId(null));
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {rows && rows.length > visibleCount ? (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setVisibleCount((n) => n + 20)}>
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}

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
