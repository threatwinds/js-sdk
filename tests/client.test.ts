import { jest } from '@jest/globals';
import {
  ThreatWindsClient,
  APIError,
  AuthError,
  RateLimitError,
  SDKError,
  BackoffBaseMs,
  BackoffMultiplier,
  UserAgent,
} from '../src/core';

describe('ThreatWindsClient', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFetch = jest.fn<any>();

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = mockFetch;
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  function createClient(opts: Partial<Record<string, any>> = {}) {
    return new ThreatWindsClient({
      baseUrl: 'https://api.threatwinds.com',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      ...opts,
    });
  }

  function createBearerClient(bearer = 'test-bearer') {
    return new ThreatWindsClient({
      baseUrl: 'https://api.threatwinds.com',
      bearer,
    });
  }

  function mockSuccess(body: Record<string, any> = { ok: true }) {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      text: async () => JSON.stringify(body),
    });
  }

  function mockNoContent() {
    mockFetch.mockResolvedValueOnce({
      status: 204,
      headers: new Map(),
      text: async () => '',
    });
  }

  function mockError(status: number, message: string, extraHeaders?: Record<string, string>) {
    const headers = new Map<string, string>();
    headers.set('X-Error', message);
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) {
        headers.set(k, v);
      }
    }
    mockFetch.mockResolvedValueOnce({
      status,
      headers,
      text: async () => JSON.stringify({ error: message }),
    });
  }

  function mockErrorWithHeaders(status: number, headers: Record<string, string>) {
    const h = new Map(Object.entries(headers)) as Map<string, string>;
    mockFetch.mockResolvedValueOnce({
      status,
      headers: h,
      text: async () => JSON.stringify({ error: headers['X-Error'] || '' }),
    });
  }

  describe('constructor', () => {
    it('throws SDKError when no auth is provided', () => {
      expect(() => new ThreatWindsClient({ baseUrl: 'https://api.test.com' })).toThrow(SDKError);
    });

    it('throws SDKError when both api key and bearer are provided', () => {
      expect(
        () =>
          new ThreatWindsClient({
            baseUrl: 'https://api.test.com',
            apiKey: 'key',
            apiSecret: 'secret',
            bearer: 'token',
          }),
      ).toThrow(SDKError);
    });

    it('accepts api key + api secret', () => {
      const client = createClient();
      expect(client.baseUrl).toBe('https://api.threatwinds.com');
    });

    it('uses default values', () => {
      const client = createClient();
      expect(client.timeout).toBe(30_000);
      expect(client.maxRetries).toBe(3);
    });

    it('accepts custom timeout and maxRetries', () => {
      const client = createClient({ timeout: 60_000, maxRetries: 5 });
      expect(client.timeout).toBe(60_000);
      expect(client.maxRetries).toBe(5);
    });
  });

  describe('auth headers', () => {
    it('sets Api-Key and Api-Secret headers for GET', async () => {
      mockSuccess();
      const client = createClient();
      await client.request('GET', '/test');

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Api-Key']).toBe('test-key');
      expect(headers['Api-Secret']).toBe('test-secret');
    });

    it('sets Authorization Bearer header', async () => {
      mockSuccess();
      const client = createBearerClient('my-token');
      await client.request('GET', '/test');

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('updates bearer via setBearerToken', async () => {
      mockSuccess();
      const client = createBearerClient('old-token');
      client.setBearerToken('new-token');
      await client.request('GET', '/test');

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer new-token');
    });
  });

  describe('User-Agent', () => {
    it('sets the correct User-Agent header', async () => {
      mockSuccess();
      const client = createClient();
      await client.request('GET', '/test');

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['User-Agent']).toBe(UserAgent);
    });
  });

  describe('request URL building', () => {
    it('builds correct URL with path', async () => {
      mockSuccess();
      const client = createClient();
      await client.request('GET', '/api/test');

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.threatwinds.com/api/test');
    });

    it('appends query parameters', async () => {
      mockSuccess();
      const client = createClient();
      await client.request('GET', '/api/test', {
        queryParams: { page: '1', limit: '10' },
      });

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.threatwinds.com/api/test?page=1&limit=10');
    });
  });

  describe('request body', () => {
    it('sends JSON body with Content-Type header', async () => {
      mockSuccess();
      const client = createClient();
      await client.request('POST', '/api/test', {
        body: { query: 'test' },
      });

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(init.body).toBe(JSON.stringify({ query: 'test' }));
    });
  });

  describe('response parsing', () => {
    it('parses JSON response', async () => {
      mockSuccess({ results: [{ id: '1' }] });
      const client = createClient();
      const result = await client.request('GET', '/test');
      expect(result).toEqual({ results: [{ id: '1' }] });
    });

    it('returns null for 204 No Content', async () => {
      mockNoContent();
      const client = createClient();
      const result = await client.request('DELETE', '/test');
      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('throws APIError for 4xx responses', async () => {
      mockErrorWithHeaders(400, {
        'X-Error': 'Bad Request',
        'X-Error-Id': 'err-123',
      });

      const client = createClient();
      try {
        await client.request('GET', '/test');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).statusCode).toBe(400);
        expect((err as APIError).rawMessage).toBe('Bad Request');
        expect((err as APIError).errorId).toBe('err-123');
      }
    });

    it('throws AuthError for 401', async () => {
      mockError(401, 'Unauthorized');

      const client = createClient();
      try {
        await client.request('GET', '/test');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).statusCode).toBe(401);
      }
    });

    it('throws AuthError for 403', async () => {
      mockError(403, 'Forbidden');

      const client = createClient();
      try {
        await client.request('GET', '/test');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).statusCode).toBe(403);
      }
    });

    it('throws RateLimitError for 429', async () => {
      mockErrorWithHeaders(429, {
        'X-Error': 'Rate limited',
        'Retry-After': '30',
      });

      const client = createClient({ maxRetries: 0 });
      try {
        await client.request('GET', '/test');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect((err as RateLimitError).retryAfterSeconds).toBe(30);
      }
    });

    it('throws APIError for 5xx', async () => {
      mockError(500, 'Internal Server Error');

      const client = createClient();
      try {
        await client.request('GET', '/test');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).statusCode).toBe(500);
      }
    });
  });

  describe('error type helpers', () => {
    it('isNotFound returns true for 404', () => {
      const err = new APIError(404, 'GET', '/test', 'Not found');
      expect(err.isNotFound()).toBe(true);
    });

    it('isUnauthorized returns true for 401', () => {
      const err = new APIError(401, 'GET', '/test', 'Unauthorized');
      expect(err.isUnauthorized()).toBe(true);
    });

    it('isForbidden returns true for 403', () => {
      const err = new APIError(403, 'GET', '/test', 'Forbidden');
      expect(err.isForbidden()).toBe(true);
    });

    it('isRateLimited returns true for 429', () => {
      const err = new APIError(429, 'GET', '/test', 'Rate limited');
      expect(err.isRateLimited()).toBe(true);
    });

    it('isValidationError returns true for 400', () => {
      const err = new APIError(400, 'GET', '/test', 'Bad request');
      expect(err.isValidationError()).toBe(true);
    });
  });

  describe('retry logic', () => {
    function mockSetImmediateTimeout(trackDelays: number[]) {
      const original = global.setTimeout;
      (global as any).setTimeout = function (callback: any, delay: number) {
        trackDelays.push(delay);
        process.nextTick(() => (callback as () => void)());
        return 0 as any;
      };
      return () => {
        global.setTimeout = original;
      };
    }

    it('retries GET requests on 429 with exponential backoff', async () => {
      const delays: number[] = [];
      const restore = mockSetImmediateTimeout(delays);

      mockError(429, 'Rate limited');
      mockSuccess();

      const client = createClient({ maxRetries: 3 });
      const result = await client.request('GET', '/test');

      restore();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
      expect(delays).toHaveLength(1);
      expect(delays[0]).toBe(BackoffBaseMs);
    });

    it('retries on 502', async () => {
      const delays: number[] = [];
      const restore = mockSetImmediateTimeout(delays);

      mockError(502, 'Bad Gateway');
      mockSuccess();

      const client = createClient();
      await client.request('GET', '/test');
      restore();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 503', async () => {
      const delays: number[] = [];
      const restore = mockSetImmediateTimeout(delays);

      mockError(503, 'Service Unavailable');
      mockSuccess();

      const client = createClient();
      await client.request('GET', '/test');
      restore();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 504', async () => {
      const delays: number[] = [];
      const restore = mockSetImmediateTimeout(delays);

      mockError(504, 'Gateway Timeout');
      mockSuccess();

      const client = createClient();
      await client.request('GET', '/test');
      restore();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry POST requests', async () => {
      mockError(429, 'Rate limited');

      const client = createClient();
      try {
        await client.request('POST', '/test', { body: { query: 'test' } });
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      }
    });

    it('does not retry on 400', async () => {
      mockError(400, 'Bad Request');

      const client = createClient();
      try {
        await client.request('GET', '/test');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      }
    });

    it('respects maxRetries limit', async () => {
      const delays: number[] = [];
      const restore = mockSetImmediateTimeout(delays);

      mockFetch.mockResolvedValue({
        status: 503,
        headers: new Map([['X-Error', 'Service Unavailable']]),
        text: async () => JSON.stringify({ error: 'Service Unavailable' }),
      });

      const client = createClient({ maxRetries: 2 });
      try {
        await client.request('GET', '/test');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(delays).toHaveLength(2);
        expect(delays[0]).toBe(BackoffBaseMs);
        expect(delays[1]).toBe(BackoffBaseMs * BackoffMultiplier);
      }

      restore();
    });

    it('uses Retry-After header for backoff', async () => {
      const delays: number[] = [];
      const restore = mockSetImmediateTimeout(delays);

      mockErrorWithHeaders(429, { 'X-Error': 'Rate limited', 'Retry-After': '1' });
      mockSuccess();

      const client = createClient();
      await client.request('GET', '/test');
      restore();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(delays).toHaveLength(1);
      expect(delays[0]).toBe(1000);
    });

    it('exceeding maxRetries returns error', async () => {
      const delays: number[] = [];
      const restore = mockSetImmediateTimeout(delays);

      mockFetch.mockResolvedValue({
        status: 503,
        headers: new Map([['X-Error', 'Service Unavailable']]),
        text: async () => JSON.stringify({ error: 'Service Unavailable' }),
      });

      const client = createClient({ maxRetries: 1 });
      try {
        await client.request('GET', '/test');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      }

      restore();
    });
  });
});