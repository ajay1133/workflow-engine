import { executeHttpRequest } from './httpRequest';

function res(status: number, bodyText = ''): any {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => bodyText,
  };
}

describe('executeHttpRequest retries', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('default retries is 0 (single attempt)', async () => {
    const fetchMock = jest
      .spyOn(globalThis as any, 'fetch')
      .mockResolvedValueOnce(res(500, 'nope'));

    const promise = executeHttpRequest({
      step: {
        method: 'POST',
        url: 'http://example.com',
        timeoutMs: 50,
        retries: 0,
      },
      jsonBody: { key: 'test' },
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.attempts).toBe(1);
    expect(result.retriesUsed).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  test('retries on 5xx up to max retries', async () => {
    const fetchMock = jest
      .spyOn(globalThis as any, 'fetch')
      .mockResolvedValueOnce(res(500, 'e1'))
      .mockResolvedValueOnce(res(500, 'e2'))
      .mockResolvedValueOnce(res(500, 'e3'));

    const promise = executeHttpRequest({
      step: {
        method: 'POST',
        url: 'http://example.com',
        timeoutMs: 50,
        retries: 2,
      },
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.attempts).toBe(3);
    expect(result.retriesUsed).toBe(2);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.bodyText).toBe('e3');
  });

  test('retries on 4xx and can succeed later', async () => {
    const fetchMock = jest
      .spyOn(globalThis as any, 'fetch')
      .mockResolvedValueOnce(res(400, 'bad request'))
      .mockResolvedValueOnce(res(200, 'ok'));

    const promise = executeHttpRequest({
      step: {
        method: 'POST',
        url: 'http://example.com',
        timeoutMs: 50,
        retries: 2,
      },
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.retriesUsed).toBe(1);
  });

  test('retries on network errors and reports no-response failure', async () => {
    const fetchMock = jest
      .spyOn(globalThis as any, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed again'));

    const promise = executeHttpRequest({
      step: {
        method: 'POST',
        url: 'http://example.com',
        timeoutMs: 50,
        retries: 1,
      },
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.retriesUsed).toBe(1);
    expect(result.error?.message).toContain('fetch failed');
  });
});
