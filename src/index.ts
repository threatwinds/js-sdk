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
import { CaseworkClient } from './casework/casework-client';

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
  CaseworkClient,
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
  BillingAddress,
  CreateCustomerRequest,
  CreateCustomerResponse,
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

// Casework types
export {
  CaseStatus,
  CaseSeverity,
  Case,
  CaseNote,
  CaseEntity,
  CaseInput,
  PinEntityInput,
  MatchKind,
  Watchlist,
  WatchlistItem,
  WatchlistInput,
  WatchlistItemInput,
  SavedSearch,
  Alert,
  AlertPage,
  UNFILED,
  Conversation,
  ConversationInput,
  Turn,
  // The AI client already exports a `ToolCall`: a model's *request* to call a
  // tool, carrying an id and a `function.arguments` payload. This one is
  // casework's record of a call that already ran, stored on a turn as a bare
  // name and args. Different shapes at different points in the lifecycle, so
  // the casework type is aliased at the package root rather than merged.
  ToolCall as ConversationToolCall,
} from './casework/casework-types';

// AI warm-up policy — the self-hosted generation pods scale to zero, so any
// call can be answered with a retryable 503 while a model boots.
export {
  withWarmup,
  retryStreamWarmup,
  warmupDecision,
  DEFAULT_WARMUP_BUDGET_SECONDS,
  NO_BACKENDS_GRACE_SECONDS,
} from './ai/warmup';
export type { WarmupOptions, WarmupProgress } from './ai/warmup';
export type {
  TranscriptionRequest,
  TranscriptionResponse,
  SpeechRequest,
  SpeechFormat,
} from './ai/ai-types';
