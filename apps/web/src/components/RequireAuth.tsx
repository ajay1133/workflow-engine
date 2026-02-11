import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAuthToken } from '../auth';

export function RequireAuth(props: { children: ReactNode }): ReactNode {
  const location = useLocation();
  const token = getAuthToken();

  if (!token) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return props.children;
}
