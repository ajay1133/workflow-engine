import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import cx from 'classnames';
import { Link } from 'react-router-dom';
import { deleteWorkflow, listWorkflows } from '../api';
import { clearAuthToken } from '../auth';
import type { Workflow } from '../types';
import styles from './WorkflowsListPage.module.css';

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
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Workflow Engine</h1>
        <div className={styles.headerActions}>
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

      <p className={styles.intro}>HTTP-triggered workflows; execution is queued via SQS.</p>

      {error ? (
        <div className={styles.errorBox}>{error}</div>
      ) : null}

      {rows === null ? <div>Loading…</div> : null}

      {rows && rows.length === 0 ? <div>No workflows yet.</div> : null}

      {rows && rows.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th align="left" className={styles.th}>Name</th>
              <th align="left" className={styles.th}>Enabled</th>
              <th align="left" className={styles.th}>Trigger</th>
              <th align="left" className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((w) => (
              <tr key={w.id}>
                <td className={styles.td}>
                  <Link to={`/workflows/${encodeURIComponent(w.id)}`}>{w.name}</Link>
                </td>
                <td className={styles.td}>{w.enabled ? 'Yes' : 'No'}</td>
                <td className={cx(styles.td, styles.mono)}>
                  {w.triggerUrl ?? w.triggerPath ?? '—'}
                </td>
                <td className={styles.td}>
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
        <div className={styles.loadMore}>
          <button type="button" onClick={() => setVisibleCount((n) => n + 20)}>
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}
