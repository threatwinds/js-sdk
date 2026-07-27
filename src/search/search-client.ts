import { ThreatWindsClient, RequestOptions } from '../core/client';
import {
  SimpleSearchRequest,
  SimpleSearchOptions,
  EntityResults,
  EntityRecord,
  AdvancedSearchBody,
  AdvancedSearchResponse,
} from './search-types';
import { APIError } from '../core/errors';

type SimpleSearchParams = {
  query: string;
  source?: {
    includes?: string[];
    excludes?: string[];
  };
} & SimpleSearchOptions;

export class SearchClient {
  constructor(private client: ThreatWindsClient) {}

  /**
   * Full-text search over entities.
   *
   * Paginate by incrementing `page` while it is `<= result.pages`; the API does
   * not return a cursor.
   */
  async simpleSearch(
    params: SimpleSearchParams,
    options: RequestOptions = {},
  ): Promise<EntityResults> {
    const body: SimpleSearchRequest = {
      query: params.query,
      source: {
        includes: params.source?.includes ?? [],
        excludes: params.source?.excludes ?? [],
      },
    };

    const queryParams: Record<string, string> = { ...options.queryParams };
    if (params.page !== undefined) queryParams.page = String(params.page);
    if (params.limit !== undefined) queryParams.limit = String(params.limit);
    if (params.sort !== undefined) queryParams.sort = params.sort;
    if (params.order !== undefined) queryParams.order = params.order;

    return this.client.request('POST', '/api/search/v1/entities/simple', {
      ...options,
      body,
      queryParams,
    }) as Promise<EntityResults>;
  }

  /**
   * Resolves one exact indicator to its entity record.
   *
   * Prefer this over `simpleSearch` when you already know the indicator:
   * simple search tokenizes the query, so searching "8.8.8.8" returns thousands
   * of loosely-matching addresses rather than that specific IP.
   *
   * Returns `null` when the indicator is not in the corpus, rather than
   * throwing — "not found" is an ordinary outcome for a lookup.
   */
  async lookupEntity(
    type: string,
    value: string,
    options: RequestOptions = {},
  ): Promise<EntityRecord | null> {
    try {
      return (await this.client.request('POST', '/api/search/v1/entity', {
        ...options,
        body: { type, value },
      })) as EntityRecord;
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 404) return null;
      throw err;
    }
  }

  /**
   * Structured search with aggregations.
   *
   * `body.query.must` must be an array of clauses, and every terms aggregation
   * should set an explicit `size` — the server default of 10 buckets silently
   * truncates results.
   */
  async advancedSearch(
    body: AdvancedSearchBody,
    options: RequestOptions = {},
  ): Promise<AdvancedSearchResponse> {
    return this.client.request('POST', '/api/search/v1/entities/advanced', {
      ...options,
      body,
    }) as Promise<AdvancedSearchResponse>;
  }
}
