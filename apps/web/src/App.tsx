import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { WorkflowEditorPage } from './pages/WorkflowEditorPage';
import { WorkflowsListPage } from './pages/WorkflowsListPage';
import { RunDetailPage } from './pages/RunDetailPage';
import { OperationsPage } from './pages/OperationsPage';

export function App(): ReactNode {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/workflows" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route
          path="/workflows"
          element={
            <RequireAuth>
              <WorkflowsListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/workflows/new"
          element={
            <RequireAuth>
              <WorkflowEditorPage mode="create" />
            </RequireAuth>
          }
        />
        <Route
          path="/workflows/:id"
          element={
            <RequireAuth>
              <WorkflowEditorPage mode="edit" />
            </RequireAuth>
          }
        />
        <Route
          path="/runs/:id"
          element={
            <RequireAuth>
              <RunDetailPage />
            </RequireAuth>
          }
        />

        <Route
          path="/operations"
          element={
            <RequireAuth>
              <OperationsPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/workflows" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
