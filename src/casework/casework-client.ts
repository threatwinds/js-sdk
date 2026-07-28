import { ThreatWindsClient, RequestOptions } from '../core/client';
import {
  Alert,
  AlertPage,
  Case,
  CaseEntity,
  CaseInput,
  CaseNote,
  CaseStatus,
  MatchKind,
  PinEntityInput,
  SavedSearch,
  Watchlist,
  WatchlistInput,
  WatchlistItem,
  WatchlistItemInput,
} from './casework-types';

const BASE = '/api/casework/v1';

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw =>
  value && typeof value === 'object' ? (value as Raw) : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function str(src: Raw, ...keys: string[]): string {
  for (const key of keys) {
    const v = src[key];
    if (typeof v === 'string') return v;
  }
  return '';
}

function num(src: Raw, ...keys: string[]): number {
  for (const key of keys) {
    const v = src[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

/**
 * The API emits snake_case; the SDK exposes camelCase like every other client
 * here, so the mapping is explicit rather than leaking the wire format.
 */
function toNote(raw: unknown): CaseNote {
  const n = asRecord(raw);
  return {
    id: str(n, 'id'),
    caseId: str(n, 'case_id', 'caseId'),
    body: str(n, 'body'),
    createdAt: str(n, 'created_at', 'createdAt'),
  };
}

function toEntity(raw: unknown): CaseEntity {
  const e = asRecord(raw);
  return {
    id: str(e, 'id'),
    caseId: str(e, 'case_id', 'caseId'),
    entityId: str(e, 'entity_id', 'entityId'),
    entityType: str(e, 'entity_type', 'entityType'),
    entityValue: str(e, 'entity_value', 'entityValue'),
    note: str(e, 'note'),
    createdAt: str(e, 'created_at', 'createdAt'),
  };
}

function toCase(raw: unknown): Case {
  const c = asRecord(raw);
  const status = str(c, 'status');
  return {
    id: str(c, 'id'),
    title: str(c, 'title'),
    summary: str(c, 'summary'),
    status:
      status === 'open' || status === 'in_progress' || status === 'closed' ? status : 'open',
    severity: Math.min(4, Math.max(0, num(c, 'severity'))) as Case['severity'],
    createdAt: str(c, 'created_at', 'createdAt'),
    updatedAt: str(c, 'updated_at', 'updatedAt'),
    // Absent on list responses; only the detail endpoint preloads children.
    notes: asArray(c.notes).map(toNote),
    entities: asArray(c.entities).map(toEntity),
  };
}

function toItem(raw: unknown): WatchlistItem {
  const i = asRecord(raw);
  const kind = str(i, 'kind');
  const maxRep = i.max_reputation ?? i.maxReputation;
  return {
    id: str(i, 'id'),
    watchlistId: str(i, 'watchlist_id', 'watchlistId'),
    kind:
      kind === 'entity' || kind === 'value' || kind === 'tag' || kind === 'type'
        ? (kind as MatchKind)
        : 'value',
    value: str(i, 'value'),
    maxReputation: typeof maxRep === 'number' ? maxRep : undefined,
    createdAt: str(i, 'created_at', 'createdAt'),
  };
}

function toWatchlist(raw: unknown): Watchlist {
  const w = asRecord(raw);
  return {
    id: str(w, 'id'),
    name: str(w, 'name'),
    description: str(w, 'description'),
    enabled: w.enabled !== false,
    createdAt: str(w, 'created_at', 'createdAt'),
    updatedAt: str(w, 'updated_at', 'updatedAt'),
    items: asArray(w.items).map(toItem),
  };
}

function toAlert(raw: unknown): Alert {
  const a = asRecord(raw);
  const kind = str(a, 'matched_kind', 'matchedKind');
  return {
    id: num(a, 'id'),
    createdAt: str(a, 'created_at', 'createdAt'),
    watchlistId: str(a, 'watchlist_id', 'watchlistId'),
    itemId: str(a, 'item_id', 'itemId'),
    entityId: str(a, 'entity_id', 'entityId'),
    entityType: str(a, 'entity_type', 'entityType'),
    entityValue: str(a, 'entity_value', 'entityValue'),
    reputation: num(a, 'reputation'),
    matchedKind:
      kind === 'entity' || kind === 'value' || kind === 'tag' || kind === 'type'
        ? (kind as MatchKind)
        : 'value',
    matchedOn: str(a, 'matched_on', 'matchedOn'),
  };
}

function toSavedSearch(raw: unknown): SavedSearch {
  const s = asRecord(raw);
  return {
    id: str(s, 'id'),
    name: str(s, 'name'),
    query: str(s, 'query'),
    createdAt: str(s, 'created_at', 'createdAt'),
  };
}

/** Requests are sent in the API's snake_case shape. */
function caseBody(input: CaseInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.summary !== undefined) body.summary = input.summary;
  if (input.status !== undefined) body.status = input.status;
  if (input.severity !== undefined) body.severity = input.severity;
  return body;
}

/**
 * Client for analyst-owned casework.
 *
 * Every route requires authentication — these records are private to the
 * caller, so an unauthenticated request has nothing to return.
 */
export class CaseworkClient {
  constructor(private client: ThreatWindsClient) {}

  async listCases(
    opts: { status?: CaseStatus; limit?: number } = {},
    options: RequestOptions = {},
  ): Promise<Case[]> {
    const queryParams: Record<string, string> = { ...options.queryParams };
    if (opts.status) queryParams.status = opts.status;
    if (opts.limit) queryParams.limit = String(opts.limit);

    const raw = await this.client.request('GET', `${BASE}/cases`, { ...options, queryParams });
    return asArray(raw).map(toCase);
  }

  /** Returns the case with its notes and pinned entities. */
  async getCase(id: string, options: RequestOptions = {}): Promise<Case> {
    return toCase(
      await this.client.request('GET', `${BASE}/cases/${encodeURIComponent(id)}`, options),
    );
  }

  async createCase(input: CaseInput, options: RequestOptions = {}): Promise<Case> {
    return toCase(
      await this.client.request('POST', `${BASE}/cases`, { ...options, body: caseBody(input) }),
    );
  }

  async updateCase(id: string, input: CaseInput, options: RequestOptions = {}): Promise<Case> {
    return toCase(
      await this.client.request('PATCH', `${BASE}/cases/${encodeURIComponent(id)}`, {
        ...options,
        body: caseBody(input),
      }),
    );
  }

  async deleteCase(id: string, options: RequestOptions = {}): Promise<void> {
    await this.client.request('DELETE', `${BASE}/cases/${encodeURIComponent(id)}`, options);
  }

  async addNote(caseId: string, body: string, options: RequestOptions = {}): Promise<CaseNote> {
    return toNote(
      await this.client.request('POST', `${BASE}/cases/${encodeURIComponent(caseId)}/notes`, {
        ...options,
        body: { body },
      }),
    );
  }

  /** Pinning the same entity twice is a no-op server-side, not an error. */
  async pinEntity(
    caseId: string,
    input: PinEntityInput,
    options: RequestOptions = {},
  ): Promise<CaseEntity> {
    return toEntity(
      await this.client.request('POST', `${BASE}/cases/${encodeURIComponent(caseId)}/entities`, {
        ...options,
        body: {
          entity_id: input.entityId,
          entity_type: input.entityType ?? '',
          entity_value: input.entityValue ?? '',
          note: input.note ?? '',
        },
      }),
    );
  }

  async unpinEntity(caseId: string, entityId: string, options: RequestOptions = {}): Promise<void> {
    await this.client.request(
      'DELETE',
      `${BASE}/cases/${encodeURIComponent(caseId)}/entities/${encodeURIComponent(entityId)}`,
      options,
    );
  }

  async listWatchlists(options: RequestOptions = {}): Promise<Watchlist[]> {
    const raw = await this.client.request('GET', `${BASE}/watchlists`, options);
    return asArray(raw).map(toWatchlist);
  }

  async createWatchlist(input: WatchlistInput, options: RequestOptions = {}): Promise<Watchlist> {
    return toWatchlist(
      await this.client.request('POST', `${BASE}/watchlists`, { ...options, body: input }),
    );
  }

  async updateWatchlist(
    id: string,
    input: WatchlistInput,
    options: RequestOptions = {},
  ): Promise<Watchlist> {
    return toWatchlist(
      await this.client.request('PATCH', `${BASE}/watchlists/${encodeURIComponent(id)}`, {
        ...options,
        body: input,
      }),
    );
  }

  async deleteWatchlist(id: string, options: RequestOptions = {}): Promise<void> {
    await this.client.request('DELETE', `${BASE}/watchlists/${encodeURIComponent(id)}`, options);
  }

  async addWatchlistItem(
    watchlistId: string,
    input: WatchlistItemInput,
    options: RequestOptions = {},
  ): Promise<WatchlistItem> {
    return toItem(
      await this.client.request(
        'POST',
        `${BASE}/watchlists/${encodeURIComponent(watchlistId)}/items`,
        {
          ...options,
          body: {
            kind: input.kind,
            value: input.value,
            max_reputation: input.maxReputation,
          },
        },
      ),
    );
  }

  async deleteWatchlistItem(
    watchlistId: string,
    itemId: string,
    options: RequestOptions = {},
  ): Promise<void> {
    await this.client.request(
      'DELETE',
      `${BASE}/watchlists/${encodeURIComponent(watchlistId)}/items/${encodeURIComponent(itemId)}`,
      options,
    );
  }

  /**
   * Alerts newest first, with the caller's unread count.
   *
   * Unread is computed server-side from a read watermark, so it stays correct
   * regardless of what this page happens to contain.
   */
  async listAlerts(
    { limit = 50, unreadOnly = false }: { limit?: number; unreadOnly?: boolean } = {},
    options: RequestOptions = {},
  ): Promise<AlertPage> {
    const raw = asRecord(
      await this.client.request('GET', `${BASE}/alerts`, {
        ...options,
        queryParams: {
          ...options.queryParams,
          limit: String(limit),
          unread: String(unreadOnly),
        },
      }),
    );
    return {
      items: asArray(raw.items).map(toAlert),
      unread: num(raw, 'unread'),
    };
  }

  /** Advances the caller's read watermark to now. */
  async markAlertsRead(options: RequestOptions = {}): Promise<void> {
    await this.client.request('POST', `${BASE}/alerts/read`, options);
  }

  async listSavedSearches(options: RequestOptions = {}): Promise<SavedSearch[]> {
    const raw = await this.client.request('GET', `${BASE}/searches`, options);
    return asArray(raw).map(toSavedSearch);
  }

  async createSavedSearch(
    name: string,
    query: string,
    options: RequestOptions = {},
  ): Promise<SavedSearch> {
    return toSavedSearch(
      await this.client.request('POST', `${BASE}/searches`, {
        ...options,
        body: { name, query },
      }),
    );
  }

  async deleteSavedSearch(id: string, options: RequestOptions = {}): Promise<void> {
    await this.client.request('DELETE', `${BASE}/searches/${encodeURIComponent(id)}`, options);
  }
}
