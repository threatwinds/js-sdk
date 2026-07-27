export interface EntityObject {
  id: string;
  type: string;
  reputation: number;
  attributes: Record<string, string>;
}

/** Exact type+value lookup request. */
export interface EntityLookupRequest {
  type: string;
  value: string;
}

/**
 * Full entity record returned by exact lookup. Unlike simple search — which
 * tokenizes the query and matches loosely — this resolves one specific
 * indicator.
 */
export interface EntityRecord {
  id: string;
  type: string;
  reputation: number;
  bestReputation: number;
  worstReputation: number;
  accuracy: number;
  attributes: Record<string, string>;
  tags: string[];
  wellKnown: boolean;
  visibleBy?: string[];
  lastSeen?: string;
}

/**
 * Documented response shape is `{ items, pages, results, aggregations }`.
 * There is no `next` cursor — paginate by incrementing `page` until `pages`.
 */
export interface EntityResults {
  /** Total number of matching entities across all pages. */
  items: number;
  /** Total number of pages at the requested `limit`. */
  pages: number;
  results: EntityObject[];
  /** Always null for simple search; aggregations are advanced-search only. */
  aggregations: Record<string, AggregationResult> | null;
}

export interface Source {
  includes: string[];
  excludes: string[];
}

export interface SimpleSearchRequest {
  query: string;
  source: Source;
}

export interface SimpleSearchOptions {
  /** 1-based. Defaults to 1. */
  page?: number;
  /** Defaults to 10 server-side, max 1000. */
  limit?: number;
  /** Field to sort on. Defaults to `@timestamp`. */
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface Terms {
  field: string;
  /**
   * Number of buckets to return. Defaults to 10 server-side, which silently
   * truncates results and undercounts totals — always set it explicitly.
   */
  size?: number;
}

export interface Aggs {
  terms: Terms;
}

/** A single query clause, e.g. `{ terms: { 'type.keyword': [...] } }`. */
export type QueryClause = Record<string, unknown>;

export interface Bool {
  /**
   * Must be an ARRAY of clauses. Passing a bare object is rejected by the API
   * with HTTP 400 "incorrect json format".
   */
  must: QueryClause[];
}

export interface AdvancedSearchBody {
  aggs: Record<string, Aggs>;
  query: Bool;
  source: Source;
}

export interface AggregationBucket {
  key: string;
  doc_count: number;
}

export interface AggregationResult {
  buckets: AggregationBucket[];
}

export interface AdvancedSearchResponse {
  aggregations: Record<string, AggregationResult>;
}