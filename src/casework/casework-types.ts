/**
 * Casework: an analyst's own durable state — investigations, watchlists and
 * saved queries. Unlike search and analytics, these records belong to the
 * caller; the API scopes every read and write to the authenticated user.
 */

export type CaseStatus = 'open' | 'in_progress' | 'closed';

/** 0 = informational … 4 = critical. Numeric so it sorts. */
export type CaseSeverity = 0 | 1 | 2 | 3 | 4;

export interface CaseNote {
  id: string;
  caseId: string;
  body: string;
  createdAt: string;
}

export interface CaseEntity {
  id: string;
  caseId: string;
  entityId: string;
  entityType: string;
  entityValue: string;
  note: string;
  createdAt: string;
}

export interface Case {
  id: string;
  title: string;
  summary: string;
  status: CaseStatus;
  severity: CaseSeverity;
  createdAt: string;
  updatedAt: string;
  notes: CaseNote[];
  entities: CaseEntity[];
}

export interface CaseInput {
  title?: string;
  summary?: string;
  status?: CaseStatus;
  severity?: CaseSeverity;
}

export interface PinEntityInput {
  entityId: string;
  entityType?: string;
  entityValue?: string;
  note?: string;
}

/** How a watchlist rule is compared against incoming telemetry. */
export type MatchKind = 'entity' | 'value' | 'tag' | 'type';

export interface WatchlistItem {
  id: string;
  watchlistId: string;
  kind: MatchKind;
  value: string;
  /** Only fire for entities at or below this reputation. Absent = any. */
  maxReputation?: number;
  createdAt: string;
}

export interface Watchlist {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  items: WatchlistItem[];
}

export interface WatchlistInput {
  name?: string;
  description?: string;
  enabled?: boolean;
}

export interface WatchlistItemInput {
  kind: MatchKind;
  value: string;
  maxReputation?: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

/**
 * One watchlist rule firing on one entity.
 *
 * Written by the alerting worker, never by a client. Entity type and value are
 * denormalised so an alert still reads if the entity later stops resolving —
 * the worker has already checked that the recipient is permitted to see it.
 */
export interface Alert {
  id: number;
  createdAt: string;
  watchlistId: string;
  itemId: string;
  entityId: string;
  entityType: string;
  entityValue: string;
  reputation: number;
  /** Which rule kind fired: entity, value, tag or type. */
  matchedKind: MatchKind;
  /** The specific key that matched. */
  matchedOn: string;
}

export interface AlertPage {
  items: Alert[];
  /**
   * Alerts newer than the caller's read watermark. Independent of `items`,
   * which may be filtered or truncated.
   */
  unread: number;
}
