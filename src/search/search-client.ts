import { ThreatWindsClient, RequestOptions } from '../core/client';
import {
  SimpleSearchRequest,
  SimpleSearchOptions,
  EntityResults,
  EntityRecord,
  AdvancedSearchBody,
  AdvancedSearchResponse,
  CountedPage,
  Comment,
  EntityHistoryRecord,
  NO_PARENT,
} from './search-types';
import { APIError } from '../core/errors';

type SimpleSearchParams = {
  query: string;
  source?: {
    includes?: string[];
    excludes?: string[];
  };
} & SimpleSearchOptions;

/** Page options common to every paginated search read. */
export interface PageOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

const EMPTY_PAGE = { items: 0, pages: 0, results: [], next: null } as const;

/**
 * This API answers "no rows" with 404 rather than an empty list — see
 * search-api/controllers/comments.go, which returns ErrorCommentsNotFound
 * whenever total hits is zero. An empty result is not a failure, so every
 * paginated read here folds 404 back into an empty page.
 */
async function emptyOn404<T>(run: () => Promise<CountedPage<T>>): Promise<CountedPage<T>> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof APIError && err.statusCode === 404) {
      return { ...EMPTY_PAGE, results: [] as T[] };
    }
    throw err;
  }
}

function nextPage(page: number, pages: number): number | null {
  return page < pages ? page + 1 : null;
}

function pageQuery(opts: PageOptions): Record<string, string> {
  const q: Record<string, string> = {};
  if (opts.page !== undefined) q.page = String(opts.page);
  if (opts.limit !== undefined) q.limit = String(opts.limit);
  if (opts.sort !== undefined) q.sort = opts.sort;
  if (opts.order !== undefined) q.order = opts.order;
  return q;
}

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

  /**
   * Comments on an entity, newest first.
   *
   * The API returns the indexed document verbatim, so field names are the
   * document's (`comment`, `userID`, `@timestamp`) rather than the SDK's.
   * An entity with no comments answers 404; that is an empty page here.
   */
  async listComments(
    entityId: string,
    opts: PageOptions & { signal?: AbortSignal } = {},
  ): Promise<CountedPage<Comment>> {
    const page = opts.page ?? 1;
    return emptyOn404(async () => {
      const raw = (await this.client.request(
        'GET',
        `/api/search/v1/comments/${encodeURIComponent(entityId)}`,
        { signal: opts.signal, queryParams: pageQuery({ ...opts, page }) },
      )) as { items?: number; pages?: number; results?: Record<string, unknown>[] };

      const results = (raw.results ?? []).map((r) => ({
        id: String(r.id ?? ''),
        entityId: String(r.entityID ?? ''),
        content: String(r.comment ?? ''),
        author: String(r.userID ?? ''),
        createdAt: String(r['@timestamp'] ?? ''),
        parentId: String(r.parentID ?? NO_PARENT),
        visibleBy: Array.isArray(r.visibleBy) ? (r.visibleBy as string[]) : [],
      }));

      const pages = raw.pages ?? 0;
      return { items: raw.items ?? 0, pages, results, next: nextPage(page, pages) };
    });
  }

  /**
   * Every reported version of one entity, newest first.
   *
   * Note the `.keyword` subfield: `entityID` is mapped as text (go-sdk's
   * AddTextField attaches a keyword subfield to every text field for exactly
   * this reason), so a term on the bare field matches nothing and a `match`
   * tokenizes the id and returns thousands of unrelated rows. The advanced
   * endpoint passes `query.must` straight through to OpenSearch, which is why
   * a raw clause is the only way to filter by entity at all.
   *
   * This sits on the HEAVY rate-limit tier; call it lazily.
   */
  async getEntityHistory(
    entityId: string,
    opts: PageOptions & { signal?: AbortSignal } = {},
  ): Promise<CountedPage<EntityHistoryRecord>> {
    const page = opts.page ?? 1;
    return emptyOn404(async () => {
      const raw = (await this.client.request(
        'POST',
        '/api/search/v1/entities/history/advanced',
        {
          signal: opts.signal,
          queryParams: pageQuery({ ...opts, page }),
          body: { query: { must: [{ term: { 'entityID.keyword': { value: entityId } } }] } },
        },
      )) as { items?: number; pages?: number; results?: Record<string, unknown>[] };

      const results = (raw.results ?? []).map((r) => ({
        id: String(r.id ?? ''),
        entityId: String(r.entityID ?? ''),
        type: String(r.type ?? ''),
        author: String(r.userID ?? ''),
        timestamp: String(r['@timestamp'] ?? ''),
        reputation: typeof r.reputation === 'number' ? r.reputation : 0,
        accuracy: typeof r.accuracy === 'number' ? r.accuracy : 0,
        attributes: (r.attributes as Record<string, unknown>) ?? {},
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        visibleBy: Array.isArray(r.visibleBy) ? (r.visibleBy as string[]) : [],
        wellKnown: r.wellKnown === true,
      }));

      const pages = raw.pages ?? 0;
      return { items: raw.items ?? 0, pages, results, next: nextPage(page, pages) };
    });
  }
}
