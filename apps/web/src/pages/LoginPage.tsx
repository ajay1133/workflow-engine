import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api';
import { setAuthToken } from '../auth';

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
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', maxWidth: 520, margin: '60px auto' }}>
      <h1 style={{ marginTop: 0 }}>Workflow Engine</h1>
      <p style={{ color: '#555' }}>Login to view your workflows dashboard.</p>

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
            style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6 }}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #333', background: '#111', color: 'white' }}
        >
          {busy ? 'Logging in…' : 'Login'}
        </button>
      </form>

      <p style={{ marginTop: 14, color: '#555', fontSize: 13 }}>
        New here? <Link to={`/signup?returnTo=${encodeURIComponent(returnTo)}`}>Sign up</Link>
      </p>

      <p style={{ marginTop: 14, color: '#777', fontSize: 13 }}>
        Default seeded admin: <code>root@test.com</code>
      </p>
    </div>
  );
}
