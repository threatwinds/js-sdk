import { ThreatWindsClient } from '../core/client';
import { SimpleSearchRequest, SimpleSearchOptions, EntityResults, AdvancedSearchBody, AdvancedSearchResponse } from './search-types';

type SimpleSearchParams = {
  query: string;
  source?: {
    includes?: string[];
    excludes?: string[];
  };
} & SimpleSearchOptions;

export class SearchClient {
  constructor(private client: ThreatWindsClient) {}

  async simpleSearch(params: SimpleSearchParams): Promise<EntityResults> {
    const body: SimpleSearchRequest = {
      query: params.query,
      source: {
        includes: params.source?.includes ?? [],
        excludes: params.source?.excludes ?? [],
      },
    };

    const queryParams: Record<string, string> = {};
    if (params.page !== undefined) {
      queryParams.page = String(params.page);
    }
    if (params.limit !== undefined) {
      queryParams.limit = String(params.limit);
    }

    return this.client.request('POST', '/api/search/v1/entities/simple', {
      body,
      queryParams,
    }) as Promise<EntityResults>;
  }

  async advancedSearch(body: AdvancedSearchBody): Promise<AdvancedSearchResponse> {
    return this.client.request('POST', '/api/search/v1/entities/advanced', {
      body,
    }) as Promise<AdvancedSearchResponse>;
  }
}