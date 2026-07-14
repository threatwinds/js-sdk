export interface EntityObject {
  id: string;
  type: string;
  reputation: number;
  attributes: Record<string, string>;
}

export interface EntityResults {
  results: EntityObject[];
  pages: number;
  next: number | null;
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
  page?: number;
  limit?: number;
}

export interface Terms {
  field: string;
}

export interface Aggs {
  terms: Terms;
}

export interface Bool {
  must: Record<string, unknown>;
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