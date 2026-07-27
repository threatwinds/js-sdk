import { ThreatWindsClient } from '../core/client';
import { RequestOptions } from '../core/client';
import {
  AnalyticsBucket,
  AnalyticsTimeBucket,
  Association,
  Attribution,
  CorpusOverview,
  LiveFeedOptions,
  LiveFeedSubscription,
  RecentEntity,
  RecentFeed,
  ThreatEvent,
  EntityAttributes,
  EntityDetails,
  ExtendedMetadata,
  Geolocation,
  Metadata,
  RelationEdge,
  RelationNode,
  RelationsResult,
} from './analytics-types';

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw =>
  value && typeof value === 'object' ? (value as Raw) : {};

/**
 * Reads the first present key. The API mixes camelCase and snake_case across
 * endpoints, so every field is looked up under both spellings; this also makes
 * the mapping idempotent if the API is normalized later.
 */
function pick(src: Raw, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = src[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function pickNumber(src: Raw, ...keys: string[]): number | null {
  const value = pick(src, ...keys);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickString(src: Raw, ...keys: string[]): string {
  const value = pick(src, ...keys);
  return typeof value === 'string' ? value : '';
}

/** Entities carry their value under a key named after their own type. */
function entityValue(raw: Raw): string {
  const direct = pickString(raw, 'value');
  if (direct) return direct;
  const type = pickString(raw, 'type');
  const attributes = asRecord(raw.attributes);
  const byType = attributes[type];
  if (typeof byType === 'string') return byType;
  const first = Object.values(attributes).find((v) => typeof v === 'string');
  return typeof first === 'string' ? first : '';
}

function toAttributes(raw: Raw): EntityAttributes {
  return {
    id: pickString(raw, 'id'),
    type: pickString(raw, 'type'),
    value: entityValue(raw),
    description: pickString(raw, 'description'),
    reputationScore: pickNumber(raw, 'reputationScore', 'reputation_score'),
    reputation: pickString(raw, 'reputation'),
    accuracyScore: pickNumber(raw, 'accuracyScore', 'accuracy_score'),
    accuracy: pickString(raw, 'accuracy'),
    worstReputationScore: pickNumber(raw, 'worstReputationScore', 'worst_reputation_score'),
    worstReputation: pickString(raw, 'worstReputation', 'worst_reputation'),
    bestReputationScore: pickNumber(raw, 'bestReputationScore', 'best_reputation_score'),
    bestReputation: pickString(raw, 'bestReputation', 'best_reputation'),
  };
}

function toAssociations(raw: unknown): Association[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((entry) => {
    const a = asRecord(entry);
    return {
      id: pickString(a, 'id'),
      type: pickString(a, 'type'),
      value: entityValue(a),
      // `reputation` is a human label ("Indefinable"); the numeric signal
      // consumers colour-code by lives in `reputation_score`.
      reputation: pickNumber(a, 'reputationScore', 'reputation_score'),
    };
  });
}

function toGeolocations(raw: unknown): Geolocation[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const locations = raw
    .map((entry) => {
      const g = asRecord(entry);
      return {
        latitude: pickNumber(g, 'latitude') ?? 0,
        longitude: pickNumber(g, 'longitude') ?? 0,
        radius: pickNumber(g, 'radius', 'accuracy_radius') ?? 0,
        // The API labels the network a location belongs to as `object`.
        ip: (pick(g, 'ip', 'object') as string | undefined) ?? null,
      };
    })
    // Unresolved locations come back as 0,0 — not a real position.
    .filter((g) => g.latitude !== 0 || g.longitude !== 0);
  return locations.length > 0 ? locations : null;
}

function toMetadata(raw: unknown): Metadata | null {
  // Sent as `[]` when empty and as an object when populated.
  if (Array.isArray(raw)) return null;
  const record = asRecord(raw);
  return Object.keys(record).length > 0 ? (record as Metadata) : null;
}

function toExtendedMetadata(raw: unknown): ExtendedMetadata | null {
  if (Array.isArray(raw)) return null;
  const record = asRecord(raw);
  return Object.keys(record).length > 0 ? (record as ExtendedMetadata) : null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toBuckets(value: unknown): AnalyticsBucket[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((b) => {
      const bucket = asRecord(b);
      return { key: pickString(bucket, 'key'), count: pickNumber(bucket, 'count') ?? 0 };
    })
    .filter((b) => b.key !== '');
}

function toTimeBuckets(value: unknown): AnalyticsTimeBucket[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((b) => {
      const bucket = asRecord(b);
      return {
        timestamp: pickString(bucket, 'timestamp'),
        count: pickNumber(bucket, 'count') ?? 0,
      };
    })
    .filter((b) => b.timestamp !== '');
}

/**
 * Narrows a live-feed frame. The socket is a remote input, so every field is
 * validated rather than trusted — a malformed frame yields harmless defaults
 * instead of propagating `undefined` into the UI.
 */
function toThreatEvent(value: unknown): ThreatEvent {
  const raw = asRecord(value);
  const type = pickString(raw, 'type');
  return {
    type:
      type === 'entity.created' || type === 'entity.malicious' || type === 'entity.linked'
        ? type
        : 'entity.created',
    time: pickString(raw, 'time'),
    entityId: pickString(raw, 'entityId', 'entity_id'),
    entityType: pickString(raw, 'entityType', 'entity_type'),
    value: pickString(raw, 'value'),
    reputation: pickNumber(raw, 'reputation') ?? 0,
    tags: toStringArray(raw.tags),
    toEntityId: pickString(raw, 'toEntityId', 'to_entity_id'),
    mode: pickString(raw, 'mode'),
  };
}

export class AnalyticsClient {
  constructor(private client: ThreatWindsClient) {}

  /**
   * Full dossier for an entity.
   *
   * The endpoint returns snake_case at the top level (`latest_associations`,
   * `extended_metadata`) and geolocations keyed `accuracy_radius`/`object`, so
   * the whole payload is normalized — not just `attributes`.
   */
  async getEntityDetails(id: string, options: RequestOptions = {}): Promise<EntityDetails> {
    const raw = asRecord(
      await this.client.request(
        'GET',
        `/api/analytics/v1/entity/${encodeURIComponent(id)}/details`,
        options,
      ),
    );

    return {
      attributes: toAttributes(asRecord(raw.attributes)),
      metadata: toMetadata(raw.metadata),
      extendedMetadata: toExtendedMetadata(pick(raw, 'extendedMetadata', 'extended_metadata')),
      geolocations: toGeolocations(raw.geolocations),
      latestAssociations: toAssociations(pick(raw, 'latestAssociations', 'latest_associations')),
    };
  }

  /**
   * Relationship graph around an entity.
   *
   * The API returns the edge list under `relations`; earlier versions of this
   * method read `edges`, which does not exist in the response and so always
   * produced an empty graph. Both spellings are accepted now.
   */
  async getEntityRelations(
    id: string,
    depth: number = 2,
    options: RequestOptions = {},
  ): Promise<RelationsResult> {
    const raw = asRecord(
      await this.client.request(
        'GET',
        `/api/analytics/v1/entity/${encodeURIComponent(id)}/relations`,
        { ...options, queryParams: { ...options.queryParams, depth: String(depth) } },
      ),
    );

    const data = asRecord(raw.data ?? raw);

    const rawEdges = Array.isArray(data.relations)
      ? data.relations
      : Array.isArray(data.edges)
        ? data.edges
        : [];

    const nodes: RelationNode[] = (Array.isArray(data.nodes) ? data.nodes : []).map((n) => {
      const node = asRecord(n);
      return {
        id: pickString(node, 'id', 'entityId'),
        type: pickString(node, 'type', 'entity_type') || 'unknown',
        value: entityValue(node),
        reputation: pickNumber(node, 'reputation', 'reputation_score'),
      };
    });

    const edges: RelationEdge[] = rawEdges
      .map((e) => {
        const edge = asRecord(e);
        return {
          source: pickString(edge, 'source'),
          target: pickString(edge, 'target'),
          type: pickString(edge, 'type', 'edge_type'),
        };
      })
      .filter((e) => e.source && e.target);

    return { nodes, edges, depth: pickNumber(data, 'depth') ?? depth };
  }

  /**
   * Situational overview of the corpus the caller can see.
   *
   * Counts are computed server-side over group-filtered data, so two callers
   * with different group membership legitimately see different totals.
   */
  async getOverview(days = 30, options: RequestOptions = {}): Promise<CorpusOverview> {
    const raw = asRecord(
      await this.client.request('GET', '/api/analytics/v1/overview', {
        ...options,
        queryParams: { ...options.queryParams, days: String(days) },
      }),
    );

    const window = asRecord(raw.window);

    return {
      totalEntities: pickNumber(raw, 'total_entities', 'totalEntities') ?? 0,
      maliciousCount: pickNumber(raw, 'malicious_count', 'maliciousCount') ?? 0,
      maliciousShare: pickNumber(raw, 'malicious_share', 'maliciousShare') ?? 0,
      trackedTypes: pickNumber(raw, 'tracked_types', 'trackedTypes') ?? 0,
      byType: toBuckets(pick(raw, 'by_type', 'byType')),
      byReputation: toBuckets(pick(raw, 'by_reputation', 'byReputation')),
      byAccuracy: toBuckets(pick(raw, 'by_accuracy', 'byAccuracy')),
      topTags: toBuckets(pick(raw, 'top_tags', 'topTags')),
      timeline: toTimeBuckets(raw.timeline),
      windowDays: pickNumber(window, 'days') ?? days,
    };
  }

  /** Recently observed entities; malicious-only by default. */
  async getRecent(
    { hours = 24, limit = 50, maliciousOnly = true }: {
      hours?: number;
      limit?: number;
      maliciousOnly?: boolean;
    } = {},
    options: RequestOptions = {},
  ): Promise<RecentFeed> {
    const raw = asRecord(
      await this.client.request('GET', '/api/analytics/v1/recent', {
        ...options,
        queryParams: {
          ...options.queryParams,
          hours: String(hours),
          limit: String(limit),
          malicious_only: String(maliciousOnly),
        },
      }),
    );

    const window = asRecord(raw.window);
    const items: RecentEntity[] = (Array.isArray(raw.items) ? raw.items : []).map((i) => {
      const item = asRecord(i);
      return {
        id: pickString(item, 'id'),
        type: pickString(item, 'type'),
        value: entityValue(item),
        reputation: pickNumber(item, 'reputation') ?? 0,
        reputationLabel: pickString(item, 'reputation_label', 'reputationLabel'),
        accuracy: pickNumber(item, 'accuracy') ?? 0,
        accuracyLabel: pickString(item, 'accuracy_label', 'accuracyLabel'),
        tags: toStringArray(item.tags),
        firstSeen: pickString(item, 'first_seen', 'firstSeen'),
        lastSeen: pickString(item, 'last_seen', 'lastSeen'),
      };
    });

    return {
      items,
      windowHours: pickNumber(window, 'hours') ?? hours,
      since: pickString(window, 'since'),
    };
  }

  /** Threat volume grouped by country, ASN and ASO. */
  async getAttribution(
    { size = 20, maliciousOnly = true }: { size?: number; maliciousOnly?: boolean } = {},
    options: RequestOptions = {},
  ): Promise<Attribution> {
    const raw = asRecord(
      await this.client.request('GET', '/api/analytics/v1/attribution', {
        ...options,
        queryParams: {
          ...options.queryParams,
          size: String(size),
          malicious_only: String(maliciousOnly),
        },
      }),
    );

    return {
      byCountry: toBuckets(pick(raw, 'by_country', 'byCountry')),
      byAsn: toBuckets(pick(raw, 'by_asn', 'byAsn')),
      byAso: toBuckets(pick(raw, 'by_aso', 'byAso')),
      maliciousOnly: raw.malicious_only === true || raw.maliciousOnly === true,
    };
  }

  /**
   * Mints a single-use ticket for the live feed.
   *
   * Exposed mainly for callers driving their own socket; subscribeLive does
   * this for you.
   */
  async mintLiveTicket(options: RequestOptions = {}): Promise<string> {
    const raw = asRecord(
      await this.client.request('GET', '/api/analytics/v1/live/ticket', options),
    );
    return pickString(raw, 'ticket');
  }

  /**
   * Subscribes to the live threat feed.
   *
   * A browser cannot set an Authorization header on a WebSocket handshake, so
   * the connection is authorised by a short-lived single-use ticket fetched
   * over ordinary authenticated HTTP. Because a ticket is consumed on use,
   * every reconnect mints a fresh one.
   */
  subscribeLive(options: LiveFeedOptions): LiveFeedSubscription {
    const { onEvent, onError, onClose, onOpen, reconnect = true } = options;

    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const subscription: LiveFeedSubscription = {
      close() {
        stopped = true;
        if (retryTimer !== null) clearTimeout(retryTimer);
        retryTimer = null;
        socket?.close();
        socket = null;
      },
      get connected() {
        return socket?.readyState === 1;
      },
    };

    const scheduleRetry = () => {
      if (stopped || !reconnect) return;
      // Exponential backoff, capped, so a service outage does not turn every
      // open tab into a reconnect storm.
      const delay = Math.min(30_000, 1_000 * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(() => void connect(), delay);
    };

    const connect = async (): Promise<void> => {
      if (stopped) return;
      try {
        const ticket = await this.mintLiveTicket();
        if (!ticket) throw new Error('live feed ticket was empty');
        if (stopped) return;

        const url = new URL('/api/analytics/v1/live', this.client.baseUrl);
        url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
        url.searchParams.set('ticket', ticket);

        const ws = new WebSocket(url.toString());
        socket = ws;

        ws.onopen = () => {
          attempt = 0;
          onOpen?.();
        };

        ws.onmessage = (message: MessageEvent) => {
          if (typeof message.data !== 'string') return;
          try {
            onEvent(toThreatEvent(JSON.parse(message.data)));
          } catch (err) {
            onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        };

        // `onerror` carries no detail by design in browsers; the close that
        // follows is what drives reconnection.
        ws.onerror = () => onError?.(new Error('live feed connection error'));

        ws.onclose = () => {
          socket = null;
          onClose?.();
          scheduleRetry();
        };
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        scheduleRetry();
      }
    };

    void connect();

    return subscription;
  }
}
