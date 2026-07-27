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
import { AiClient } from './ai/ai-client';
import { BillingClient } from './billing/billing-client';
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
  AiClient,
  AuthClient,
  BillingClient,
  FeedsClient,
  IngestClient,
};

// Billing types
export type {
  Customer,
  LimitDefinition,
  TierLimits,
  ServiceLimits,
  FeatureUsage,
  ServiceUsage,
  UsageReport,
  QuotaReport,
  AddMemberRequest,
  TransferOwnershipRequest,
} from './billing/billing-types';

// AI types
export type {
  ChatRole,
  ChatMessage,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  ToolCall,
  ToolDefinition,
  ToolFunctionDefinition,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChoice,
  ChatCompletionResult,
  ChatStreamDelta,
  AIModel,
  ModelCapability,
  ModelLimits,
  TokenCountRequest,
  TokenCountResponse,
  EmbeddingsRequest,
  EmbeddingsResponse,
  Usage,
} from './ai/ai-types';

// Core types
export {
  RequestOptions,
  PaginationParams,
  APIResponse,
  PaginatedResponse,
} from './core';

// Indicator helpers
export { detectIndicatorType, detectIndicatorTypes } from './search/indicators';
export type { IndicatorType } from './search/indicators';

// Search types
export {
  EntityObject,
  EntityResults,
  EntityRecord,
  EntityLookupRequest,
  Source,
  SimpleSearchRequest,
  SimpleSearchOptions,
  Terms,
  Aggs,
  Bool,
  QueryClause,
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
export type {
  SessionKind,
  SessionCreationRequest,
  SessionCreationResponse,
  SessionVerificationRequest,
  SessionInfo,
  SessionSummary,
  SignUpRequest,
  Acknowledgement,
  KeyPair,
  KeyPairRequest,
  UserLookupResponse,
  VerificationStatus,
  VerificationState,
  VerificationSession,
  VerificationAttempt,
} from './auth/auth-types';

// Feed types
export {
  Feed,
  FeedList,
  Subscription,
  FeedListOptions,
} from './feeds/feeds-types';

// Ingest types
export type {
  IngestEntity,
  IngestAssociation,
  AssociationMode,
  IngestAck,
  AssociationRequest,
  EntityDefinition,
  EntityAttributeDefinition,
  Comment,
  CommentRequest,
  ScanRequest,
  ScanResult,
} from './ingest/ingest-types';

// Analytics types
export {
  RelationNode,
  RelationEdge,
  RelationsResult,
  AnalyticsBucket,
  AnalyticsTimeBucket,
  CorpusOverview,
  RecentEntity,
  RecentFeed,
  Attribution,
  ThreatEventType,
  ThreatEvent,
  LiveFeedHandlers,
  LiveFeedOptions,
  LiveFeedSubscription,
} from './analytics/analytics-types';