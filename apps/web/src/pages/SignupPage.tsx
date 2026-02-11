import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signup } from '../api';
import { setAuthToken } from '../auth';

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
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', maxWidth: 520, margin: '60px auto' }}>
      <h1 style={{ marginTop: 0 }}>Workflow Engine</h1>
      <p style={{ color: '#555' }}>Create an account to use the dashboard.</p>

      {error ? (
        <div style={{ background: '#ffecec', border: '1px solid #f5b5b5', padding: 12, marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      <form onSubmit={onSubmit}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="email"
            style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Confirm password</div>
          <input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6 }}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #333', background: '#111', color: 'white' }}
        >
          {busy ? 'Creating…' : 'Sign up'}
        </button>
      </form>

      <p style={{ marginTop: 14, color: '#555', fontSize: 13 }}>
        Already have an account? <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Login</Link>
      </p>
    </div>
  );
}
