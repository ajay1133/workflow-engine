import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRun } from '../api';
import type { WorkflowRun } from '../types';

export function RunDetailPage(): ReactNode {
  const params = useParams();
  const runId = params.id ?? null;

  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    setError(null);
    void getRun(runId)
      .then(setRun)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [runId]);

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Run details</h1>
        {run ? <Link to={`/workflows/${encodeURIComponent(run.workflowId)}`}>Back to workflow</Link> : <Link to="/workflows">Back</Link>}
      </header>

      {error ? (
        <div style={{ background: '#ffecec', border: '1px solid #f5b5b5', padding: 12, marginTop: 12 }}>{error}</div>
      ) : null}

      {!run ? <div style={{ marginTop: 12 }}>Loading…</div> : null}

      {run ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: '#666', fontSize: 12 }}>Run ID</div>
          <code style={{ fontSize: 12 }}>{run.id}</code>

          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>Status</div>
              <div>{run.status}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12 }}>Started / Finished</div>
              <div>
                {new Date(run.startedAt).toLocaleString()} →{' '}
                {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '—'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>Input</div>
            <pre style={pre}>{JSON.stringify(run.input, null, 2)}</pre>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>Final Input</div>
            <pre style={pre}>{JSON.stringify(run.ctxFinal, null, 2)}</pre>
          </div>

          {run.executionTrace ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>Execution Trace</div>
              <pre style={pre}>{JSON.stringify(run.executionTrace, null, 2)}</pre>
            </div>
          ) : null}

          <div style={{ marginTop: 14 }}>
            <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>Error</div>
            <pre style={pre}>{JSON.stringify(run.error, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const pre: CSSProperties = {
  background: '#f7f7f7',
  padding: 12,
  overflow: 'auto',
  minHeight: 80,
};
