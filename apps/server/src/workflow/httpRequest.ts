type HttpRequestStep = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: { mode: 'ctx' } | { mode: 'custom'; value?: unknown };
  timeoutMs: number;
  retries: number;
};

export type HttpRequestResult = {
  ok: boolean;
  status: number;
  bodyText: string;
  attempts: number;
  retriesUsed: number;
  error?: { name?: string; message: string };
};

export async function executeHttpRequest(params: {
  step: HttpRequestStep;
  jsonBody?: unknown;
}): Promise<HttpRequestResult> {
  const { step, jsonBody } = params;

  const attempts = 1 + Math.max(0, step.retries);
  let lastError: unknown;
  let lastErrorMessage: string | undefined;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), step.timeoutMs);

    try {
      const res = await fetch(step.url, {
        method: step.method,
        headers: {
          ...(step.headers ?? {}),
        },
        body: jsonBody === undefined ? undefined : JSON.stringify(jsonBody),
        signal: controller.signal,
      });

      const text = await res.text();
      const status = res.status;

      if (!res.ok && status >= 400 && attempt < attempts - 1) {
        await backoff(attempt);
        continue;
      }

      return { ok: res.ok, status, bodyText: text, attempts, retriesUsed: attempt };
    } catch (err) {
      lastError = err;
      lastErrorMessage = formatErrorMessage(err);

      if (attempt < attempts - 1) {
        await backoff(attempt);
        continue;
      }

      return {
        ok: false,
        status: 0,
        bodyText: lastErrorMessage,
        attempts,
        retriesUsed: attempt,
        error: { name: getErrorName(err), message: lastErrorMessage },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    ok: false,
    status: 0,
    bodyText: lastErrorMessage ?? 'HTTP request failed',
    attempts,
    retriesUsed: Math.max(0, attempts - 1),
    error: { name: getErrorName(lastError), message: lastErrorMessage ?? 'HTTP request failed' },
  };
}

async function backoff(attempt: number): Promise<void> {
  const ms = Math.min(2000, 200 * Math.pow(2, attempt));
  await new Promise((r) => setTimeout(r, ms));
}

function formatErrorMessage(err: unknown): string {
  const name = getErrorName(err);
  const message = err instanceof Error ? err.message : String(err);

  if (name === 'AbortError') {
    return message ? `Request aborted: ${message}` : 'Request aborted (timeout)';
  }

  return message;
}

function getErrorName(err: unknown): string | undefined {
  if (!err) return undefined;
  if (err instanceof Error && err.name) return err.name;
  const anyErr = err as any;
  if (typeof anyErr?.name === 'string') return anyErr.name;
  return undefined;
}
