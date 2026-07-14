export const DefaultEndpoint = 'https://api.threatwinds.com';

export const DefaultTimeout = 30_000;
export const DefaultMaxRetries = 3;

export const UserAgent = 'threatwinds-js-sdk/1.0.0';

export const RetryableStatusCodes = [429, 502, 503, 504] as const;

export const BackoffBaseMs = 100;
export const BackoffMultiplier = 4;