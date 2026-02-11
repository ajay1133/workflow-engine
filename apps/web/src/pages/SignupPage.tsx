import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signup } from '../api';
import { setAuthToken } from '../auth';
import styles from './SignupPage.module.css';

export function SignupPage(): ReactNode {
  const nav = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const params = new URLSearchParams(location.search);
  const returnTo = params.get('returnTo') ?? '/workflows';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      const result = await signup({ email, password, confirmPassword });
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
      <p className={styles.intro}>Create an account to use the dashboard.</p>

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
            autoComplete="email"
            className={styles.input}
          />
        </label>

        <label className={styles.label}>
          <div className={styles.fieldTitle}>Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={styles.input}
          />
        </label>

        <label className={styles.labelTight}>
          <div className={styles.fieldTitle}>Confirm password</div>
          <input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={styles.input}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className={styles.button}
        >
          {busy ? 'Creating…' : 'Sign up'}
        </button>
      </form>

      <p className={styles.note}>
        Already have an account? <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Login</Link>
      </p>
    </div>
  );
}
