import {
  DefaultEndpoint,
  DefaultTimeout,
  DefaultMaxRetries,
  UserAgent,
  RetryableStatusCodes,
  BackoffBaseMs,
  BackoffMultiplier,
} from './config';
import { APIError, AuthError, RateLimitError, SDKError, ThreatWindsError } from './errors';

export interface ClientConfig {
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  bearer?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  queryParams?: Record<string, string>;
  /** Caller-controlled cancellation, combined with the client timeout. */
  signal?: AbortSignal;
  /**
   * Overrides the client timeout for this call. Streaming completions can run
   * far longer than the 30s default.
   */
  timeout?: number;
}

/**
 * Combines the caller's signal with a timeout so either can abort the request.
 * `AbortSignal.any` is not available on every supported runtime, hence the
 * manual wiring.
 */
function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const active = signals.filter((s): s is AbortSignal => Boolean(s));
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];

  const controller = new AbortController();
  const abort = (reason: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  for (const signal of active) {
    if (signal.aborted) {
      abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number): number {
  return BackoffBaseMs * Math.pow(BackoffMultiplier, attempt);
}

function parseRetryAfter(raw: string | null | undefined): number {
  if (!raw) return 0;

  const seconds = parseInt(raw, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = new Date(raw);
  if (!isNaN(date.getTime())) {
    const until = date.getTime() - Date.now();
    return until > 0 ? until : 0;
  }

  return 0;
}

function isRetryableStatusCode(code: number): boolean {
  return RetryableStatusCodes.includes(code as (typeof RetryableStatusCodes)[number]);
}

function buildUrl(baseUrl: string, path: string, queryParams?: Record<string, string>): string {
  const url = new URL(`${path.startsWith('/') ? '' : '/'}${path}`, baseUrl);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

export class ThreatWindsClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  bearer: string;
  readonly timeout: number;
  readonly maxRetries: number;

  constructor(config: ClientConfig = {}) {
    const hasAPIKey = config.apiKey && config.apiSecret;
    const hasBearer = config.bearer;

    if (!hasAPIKey && !hasBearer) {
      throw new SDKError('authentication required: provide apiKey/apiSecret or bearer');
    }
    if (hasAPIKey && hasBearer) {
      throw new SDKError('conflicting authentication: use apiKey/apiSecret or bearer, not both');
    }

    this.baseUrl = config.baseUrl || DefaultEndpoint;
    this.apiKey = config.apiKey || '';
    this.apiSecret = config.apiSecret || '';
    this.bearer = config.bearer || '';
    this.timeout = config.timeout ?? DefaultTimeout;
    this.maxRetries = config.maxRetries ?? DefaultMaxRetries;
  }

  setBearerToken(token: string): void {
    this.bearer = token;
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<unknown> {
    const lastError: APIError[] = [];
    const maxAttempts = method === 'GET' ? this.maxRetries + 1 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let error: APIError | null = null;
      try {
        const result = await this.requestOnce(method, path, options);
        return result;
      } catch (err) {
        if (err instanceof APIError) {
          error = err;
          lastError.push(err);
        } else {
          throw err;
        }
      }

      if (method !== 'GET' || !isRetryableStatusCode(error!.statusCode)) {
        throw error;
      }

      // Only sleep if we have remaining retries
      if (attempt + 1 < maxAttempts) {
        const retryAfter = parseRetryAfter(error!.retryAfter);
        const delay = retryAfter > 0 ? retryAfter : backoff(attempt);
        await sleep(delay);
      }
    }

    throw lastError[lastError.length - 1];
  }

  private async requestOnce(method: string, path: string, options: RequestOptions = {}): Promise<unknown> {
    const url = buildUrl(this.baseUrl, path, options.queryParams);
    const headers: Record<string, string> = {
      'User-Agent': UserAgent,
      'Accept': 'application/json',
      ...options.headers,
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    this.applyAuth(headers);

    const init: RequestInit = {
      method,
      headers,
      signal: combineSignals([
        AbortSignal.timeout(options.timeout ?? this.timeout),
        options.signal,
      ]),
    };

    if (options.body) {
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, init);

    const respBody = await response.text();

    if (response.status >= 400) {
      const message = response.headers.get('X-Error') || respBody || '';
      const errorId = response.headers.get('X-Error-Id') || '';
      const retryAfter = response.headers.get('Retry-After') || '';

      try {
        const parsed = JSON.parse(respBody);
        return this.createError(response.status, method, path, message, errorId, retryAfter, parsed);
      } catch {
        return this.createError(response.status, method, path, message, errorId, retryAfter, respBody);
      }
    }

    if (response.status === 204) {
      return null;
    }

    try {
      return JSON.parse(respBody);
    } catch {
      return respBody;
    }
  }

  /**
   * Issues a request and yields decoded server-sent events as they arrive.
   * Never retried: a partially consumed stream cannot be replayed safely.
   *
   * Yields the raw `data:` payload of each event, with the terminal `[DONE]`
   * sentinel already filtered out.
   */
  async *stream(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): AsyncGenerator<string, void, unknown> {
    const url = buildUrl(this.baseUrl, path, options.queryParams);
    const headers: Record<string, string> = {
      'User-Agent': UserAgent,
      'Accept': 'text/event-stream',
      ...options.headers,
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    this.applyAuth(headers);

    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      // Streams are long-lived; the per-request timeout is opt-in here rather
      // than inheriting the short default.
      signal: combineSignals([
        options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
        options.signal,
      ]),
    });

    if (response.status >= 400) {
      const respBody = await response.text();
      const message = response.headers.get('X-Error') || respBody || '';
      const errorId = response.headers.get('X-Error-Id') || '';
      const retryAfter = response.headers.get('Retry-After') || '';
      try {
        this.createError(response.status, method, path, message, errorId, retryAfter, JSON.parse(respBody));
      } catch (err) {
        if (err instanceof ThreatWindsError) throw err;
        this.createError(response.status, method, path, message, errorId, retryAfter, respBody);
      }
    }

    if (!response.body) {
      throw new SDKError('server returned an empty response stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Keep the trailing fragment: an event may be split across chunks.
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          yield payload;
        }
      }
    } finally {
      reader.releaseLock();
      await response.body.cancel().catch(() => undefined);
    }
  }

  private createError(status: number, method: string, path: string, message: string, errorId: string, retryAfter: string, body: unknown): never {
    if (status === 429) {
      const seconds = parseInt(retryAfter, 10) || 0;
      throw new RateLimitError(seconds, method, path, message, errorId);
    }
    if (status === 401 || status === 403) {
      throw new AuthError(status, method, path, message, errorId);
    }
    throw new APIError(status, method, path, message, errorId, retryAfter, body);
  }

  private applyAuth(headers: Record<string, string>): void {
    if (this.apiKey && this.apiSecret) {
      headers['Api-Key'] = this.apiKey;
      headers['Api-Secret'] = this.apiSecret;
    } else if (this.bearer) {
      headers['Authorization'] = `Bearer ${this.bearer}`;
    }
  }
}