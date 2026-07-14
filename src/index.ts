import {
  ThreatWindsClient,
  ClientConfig,
  APIError,
  AuthError,
  RateLimitError,
  SDKError,
  ThreatWindsError,
  DefaultEndpoint,
  DefaultTimeout,
  DefaultMaxRetries,
} from './core';
import { SearchClient } from './search/search-client';
import { AnalyticsClient } from './analytics/analytics-client';
import { AuthClient } from './auth/auth-client';
import { FeedsClient } from './feeds/feeds-client';
import { IngestClient } from './ingest/ingest-client';

// Core exports
export {
  ThreatWindsClient,
  ClientConfig,
  APIError,
  AuthError,
  RateLimitError,
  SDKError,
  ThreatWindsError,
  DefaultEndpoint,
  DefaultTimeout,
  DefaultMaxRetries,
  // Sub-clients
  SearchClient,
  AnalyticsClient,
  AuthClient,
  FeedsClient,
  IngestClient,
};

// Core types
export {
  RequestOptions,
  PaginationParams,
  APIResponse,
  PaginatedResponse,
} from './core';

// Search types
export {
  EntityObject,
  EntityResults,
  Source,
  SimpleSearchRequest,
  SimpleSearchOptions,
  Terms,
  Aggs,
  Bool,
  AdvancedSearchBody,
  AggregationBucket,
  AggregationResult,
  AdvancedSearchResponse,
} from './search/search-types';

// Analytics types
export {
  EntityAttributes,
  EntityDetails,
  Geolocation,
  Association,
  Metadata,
  ExtendedMetadata,
} from './analytics/analytics-types';

// Auth types
export {
  SessionCreationResponse,
  SessionVerificationRequest,
  SessionVerificationResponse,
} from './auth/auth-types';

// Feed types
export {
  Feed,
  FeedList,
  Subscription,
  FeedListOptions,
} from './feeds/feeds-types';

// Ingest types
export {
  IngestEntity,
  IngestResponse,
  BatchIngestResponse,
} from './ingest/ingest-types';