import type { QueueRunResult } from './types';

type Pending = {
  resolve: (value: QueueRunResult) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
};

export class RunWaiter {
  private readonly pending = new Map<string, Pending>();

  waitFor(correlationId: string, timeoutMs: number): Promise<QueueRunResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(correlationId);
        reject(new Error('Timed out waiting for workflow result'));
      }, timeoutMs);

      this.pending.set(correlationId, { resolve, reject, timeout });
    });
  }

  resolve(correlationId: string, value: QueueRunResult): void {
    const entry = this.pending.get(correlationId);
    if (!entry) return;
    clearTimeout(entry.timeout);
    this.pending.delete(correlationId);
    entry.resolve(value);
  }

  reject(correlationId: string, err: Error): void {
    const entry = this.pending.get(correlationId);
    if (!entry) return;
    clearTimeout(entry.timeout);
    this.pending.delete(correlationId);
    entry.reject(err);
  }
}
