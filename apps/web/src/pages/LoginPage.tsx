import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api';
import { setAuthToken } from '../auth';
import styles from './LoginPage.module.css';

export function LoginPage(): ReactNode {
  const nav = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('root@test.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const params = new URLSearchParams(location.search);
  const returnTo = params.get('returnTo') ?? '/workflows';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await login({ email, password });
      setAuthToken(result.token);
      nav(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Workflow Engine</h1>
      <p className={styles.intro}>Login to view your workflows dashboard.</p>

      {error ? (
        <div className={styles.errorBox}>{error}</div>
      ) : null}

      <form onSubmit={onSubmit}>
        <label className={styles.label}>
          <div className={styles.fieldTitle}>Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            className={styles.input}
          />
        </label>

        <label className={styles.labelTight}>
          <div className={styles.fieldTitle}>Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            className={styles.input}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className={styles.button}
        >
          {busy ? 'Logging in…' : 'Login'}
        </button>
      </form>

      <p className={styles.note}>
        New here? <Link to={`/signup?returnTo=${encodeURIComponent(returnTo)}`}>Sign up</Link>
      </p>

      <p className={styles.noteMuted}>
        Default seeded admin: <code>root@test.com</code>
      </p>
    </div>
  );
}
