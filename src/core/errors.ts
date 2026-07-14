export class ThreatWindsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThreatWindsError';
  }
}

export class APIError extends ThreatWindsError {
  constructor(
    public readonly statusCode: number,
    public readonly method: string,
    public readonly path: string,
    public readonly rawMessage: string,
    public readonly errorId: string = '',
    public readonly retryAfter: string = '',
    public readonly body: unknown = null,
  ) {
    super(`${statusCode}: ${method} ${path}: ${rawMessage}`);
    this.name = 'APIError';
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }

  isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  isForbidden(): boolean {
    return this.statusCode === 403;
  }

  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  isValidationError(): boolean {
    return this.statusCode === 400;
  }
}

export class AuthError extends APIError {
  constructor(
    statusCode: number,
    method: string,
    path: string,
    message: string,
    errorId: string = '',
  ) {
    super(statusCode, method, path, message, errorId);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends APIError {
  constructor(
    public readonly retryAfterSeconds: number,
    method: string,
    path: string,
    message: string = 'Rate limit exceeded',
    errorId: string = '',
  ) {
    super(429, method, path, message, errorId, String(retryAfterSeconds));
    this.name = 'RateLimitError';
  }
}

export class SDKError extends ThreatWindsError {
  constructor(message: string) {
    super(`client: ${message}`);
    this.name = 'SDKError';
  }
}