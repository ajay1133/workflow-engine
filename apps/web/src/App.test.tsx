import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders title', async () => {
  // WorkflowsListPage fetches on mount
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
    text: async () => '[]',
  });

  render(<App />);
  expect(await screen.findByText(/Workflow Engine/i)).toBeInTheDocument();
});
