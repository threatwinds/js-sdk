export interface Geolocation {
  latitude: number;
  longitude: number;
  radius: number;
  ip: string | null;
}

export interface Association {
  id: string;
  type: string;
  value: string;
  reputation: number | null;
}

export interface Metadata {
  [key: string]: string;
}

export interface ExtendedMetadata {
  [key: string]: Metadata;
}

export interface EntityAttributes {
  id: string;
  type: string;
  value: string;
  description: string;
  reputationScore: number | null;
  reputation: string;
  accuracyScore: number | null;
  accuracy: string;
  worstReputationScore: number | null;
  worstReputation: string;
  bestReputationScore: number | null;
  bestReputation: string;
}

export interface EntityDetails {
  attributes: EntityAttributes;
  metadata: Metadata | null;
  extendedMetadata: ExtendedMetadata | null;
  geolocations: Geolocation[] | null;
  latestAssociations: Association[] | null;
}

export interface RelationNode {
  id: string;
  type: string;
  value: string;
  reputation: number | null;
}

export interface RelationEdge {
  source: string;
  target: string;
  type: string;
}

export interface RelationsResult {
  nodes: RelationNode[];
  edges: RelationEdge[];
  depth: number;
}

export interface Comment {
  id: string;
  entityId: string;
  content: string;
  author: string;
  authorName: string;
  createdAt: string;
  parentId: string | null;
}

export interface ScanResult {
  taskId: string;
  status: string;
  message: string;
}
/** One term-aggregation bucket from the corpus analytics endpoints. */
export interface AnalyticsBucket {
  key: string;
  count: number;
}

/** One date-histogram bucket. */
export interface AnalyticsTimeBucket {
  timestamp: string;
  count: number;
}

/** Situational snapshot of the corpus visible to the caller. */
export interface CorpusOverview {
  totalEntities: number;
  maliciousCount: number;
  /** Proportion in 0..1, not a percentage. */
  maliciousShare: number;
  trackedTypes: number;
  byType: AnalyticsBucket[];
  byReputation: AnalyticsBucket[];
  byAccuracy: AnalyticsBucket[];
  topTags: AnalyticsBucket[];
  timeline: AnalyticsTimeBucket[];
  windowDays: number;
}

/** One entity in the recent-activity feed. */
export interface RecentEntity {
  id: string;
  type: string;
  value: string;
  reputation: number;
  reputationLabel: string;
  accuracy: number;
  accuracyLabel: string;
  tags: string[];
  firstSeen: string;
  lastSeen: string;
}

export interface RecentFeed {
  items: RecentEntity[];
  windowHours: number;
  since: string;
}

/** Threat volume grouped by geographic and network origin. */
export interface Attribution {
  byCountry: AnalyticsBucket[];
  byAsn: AnalyticsBucket[];
  byAso: AnalyticsBucket[];
  maliciousOnly: boolean;
}

export type ThreatEventType = 'entity.created' | 'entity.malicious' | 'entity.linked';

/**
 * One message from the live threat feed.
 *
 * The server deliberately omits the entity's security groups, so there is no
 * `visibleBy` here — visibility is enforced before the event is sent.
 */
export interface ThreatEvent {
  type: ThreatEventType;
  time: string;
  entityId: string;
  entityType: string;
  value: string;
  reputation: number;
  tags: string[];
  /** Present only on `entity.linked`. */
  toEntityId: string;
  /** Present only on `entity.linked`: `association` or `aggregation`. */
  mode: string;
}

export interface LiveFeedHandlers {
  onEvent(event: ThreatEvent): void;
  onError?(error: Error): void;
  /** Called on every close, whether or not a reconnect follows. */
  onClose?(): void;
  /** Called when a reconnect attempt succeeds. */
  onOpen?(): void;
}

export interface LiveFeedOptions extends LiveFeedHandlers {
  /** Reconnect automatically after an unexpected close. Defaults to true. */
  reconnect?: boolean;
}

/** Handle returned by subscribeLive; call close() to stop and stop reconnecting. */
export interface LiveFeedSubscription {
  close(): void;
  readonly connected: boolean;
}
