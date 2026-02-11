import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRun } from '../api';
import type { WorkflowRun } from '../types';
import styles from './RunDetailPage.module.css';

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
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Run details</h1>
        {run ? (
          <Link to={`/workflows/${encodeURIComponent(run.workflowId)}`}>Back to workflow</Link>
        ) : (
          <Link to="/workflows">Back</Link>
        )}
      </header>

      {error ? (
        <div className={styles.errorBox}>{error}</div>
      ) : null}

      {!run ? <div className={styles.loading}>Loading…</div> : null}

      {run ? (
        <div className={styles.section}>
          <div className={styles.muted}>Run ID</div>
          <code className={styles.codeSmall}>{run.id}</code>

          <div className={styles.grid2}>
            <div>
              <div className={styles.muted}>Status</div>
              <div>{run.status}</div>
            </div>
            <div>
              <div className={styles.muted}>Started / Finished</div>
              <div>
                {new Date(run.startedAt).toLocaleString()} →{' '}
                {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '—'}
              </div>
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.blockTitle}>Input</div>
            <pre className={styles.pre}>{JSON.stringify(run.input, null, 2)}</pre>
          </div>

          <div className={styles.block}>
            <div className={styles.blockTitle}>Final Input</div>
            <pre className={styles.pre}>{JSON.stringify(run.ctxFinal, null, 2)}</pre>
          </div>

          {run.executionTrace ? (
            <div className={styles.block}>
              <div className={styles.blockTitle}>Execution Trace</div>
              <pre className={styles.pre}>{JSON.stringify(run.executionTrace, null, 2)}</pre>
            </div>
          ) : null}

          <div className={styles.block}>
            <div className={styles.blockTitle}>Error</div>
            <pre className={styles.pre}>{JSON.stringify(run.error, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
