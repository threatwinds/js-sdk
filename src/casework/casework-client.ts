import { ThreatWindsClient, RequestOptions } from '../core/client';
import {
  Alert,
  AlertPage,
  Case,
  CaseEntity,
  CaseInput,
  CaseNote,
  CaseStatus,
  Conversation,
  ConversationInput,
  MatchKind,
  PinEntityInput,
  SavedSearch,
  ToolCall,
  Turn,
  Watchlist,
  WatchlistInput,
  WatchlistItem,
  WatchlistItemInput,
} from './casework-types';

const BASE = '/api/casework/v1';

/**
 * The API's way of spelling "no case". See `conversationBody` for why a plain
 * JSON null will not do.
 */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

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
  const kind = str(a, 'matchedKind', 'matched_kind');
  return {
    id: str(a, 'id'),
    createdAt: str(a, '@timestamp', 'created_at', 'createdAt'),
    watchlistId: str(a, 'watchlistID', 'watchlist_id', 'watchlistId'),
    itemId: str(a, 'itemID', 'item_id', 'itemId'),
    entityId: str(a, 'entityID', 'entity_id', 'entityId'),
    entityType: str(a, 'entityType', 'entity_type'),
    entityValue: str(a, 'entityValue', 'entity_value'),
    reputation: num(a, 'reputation'),
    matchedKind:
      kind === 'entity' || kind === 'value' || kind === 'tag' || kind === 'type'
        ? (kind as MatchKind)
        : 'value',
    matchedOn: str(a, 'matchedOn', 'matched_on'),
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

/**
 * Conversations come from PostgreSQL, so their fields arrive snake_case — but
 * every key is read in both spellings anyway. The casework service genuinely
 * serves two stores through one API, and a field that moves between them (or a
 * proxy that rewrites casing) should not turn a populated value into `undefined`
 * halfway down a component tree.
 */
function toConversation(raw: unknown): Conversation {
  const c = asRecord(raw);
  return {
    id: str(c, 'id'),
    title: str(c, 'title'),
    /* Omitted from the response entirely when the thread is unfiled: the server
       field is a nullable pointer tagged `omitempty`, so there is no `null` to
       tell apart from an absent key. Either way it reads as '' here, which is
       the one representation of "unfiled" this SDK exposes. */
    caseId: str(c, 'case_id', 'caseID', 'caseId'),
    messageCount: num(c, 'message_count', 'messageCount'),
    lastMessageAt: str(c, 'last_message_at', 'lastMessageAt'),
    createdAt: str(c, 'created_at', 'createdAt'),
    updatedAt: str(c, 'updated_at', 'updatedAt'),
  };
}

/**
 * Tool arguments are a string on the wire, but a value that arrives as an object
 * is re-encoded rather than dropped: narrowing it away to '' would hide from the
 * analyst that the tool ran at all, which is worse than showing raw JSON.
 */
function toolArgs(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw === undefined || raw === null) return '';
  try {
    return JSON.stringify(raw) ?? '';
  } catch {
    return '';
  }
}

function toToolCall(raw: unknown): ToolCall {
  const t = asRecord(raw);
  return {
    name: str(t, 'name'),
    args: toolArgs(t.args),
  };
}

/**
 * Turns come from OpenSearch, so their fields arrive camelCase with the
 * timestamp under `@timestamp` — the opposite convention to the conversation
 * row they belong to. Both spellings are accepted here for the same reason as
 * `toConversation`, and the public shape is camelCase either way.
 */
function toTurn(raw: unknown): Turn {
  const t = asRecord(raw);
  return {
    id: str(t, 'id'),
    conversationId: str(t, 'conversationID', 'conversation_id', 'conversationId'),
    caseId: str(t, 'caseID', 'case_id', 'caseId'),
    userId: str(t, 'userID', 'user_id', 'userId'),
    createdAt: str(t, '@timestamp', 'created_at', 'createdAt'),
    question: str(t, 'question'),
    answer: str(t, 'answer'),
    tools: asArray(t.tools).map(toToolCall),
    seq: num(t, 'seq'),
  };
}

/**
 * Requests are sent in the API's snake_case shape.
 *
 * `unfilable` is what separates PATCH from POST. On update, the nil UUID is the
 * only way the wire can say "clear this field": the server decodes `case_id`
 * into a pointer, where an explicit JSON `null` and an omitted key both arrive
 * as nil and cannot be told apart from "leave it alone". On create there is
 * nothing to clear, and the nil UUID would instead be read as a real case id —
 * one the caller does not own, so a 404 — which is why create omits the key.
 */
function conversationBody(
  input: ConversationInput,
  unfilable: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.caseId) {
    body.case_id = input.caseId;
  } else if (unfilable && input.caseId === '') {
    body.case_id = NIL_UUID;
  }
  return body;
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

  /**
   * The caller's conversations, most recently active first.
   *
   * `caseId` narrows to one case; pass `UNFILED` for threads attached to none,
   * which is how an analyst finds a conversation they started before it was
   * clear it mattered. Omit it entirely for every thread the caller owns,
   * filed or not.
   *
   * The server caps `limit` at 200 and falls back to 50 for anything outside
   * 1-200, so an over-large value quietly returns fewer rows rather than more.
   */
  async listConversations(
    opts: { caseId?: string; limit?: number } = {},
    options: RequestOptions = {},
  ): Promise<Conversation[]> {
    const queryParams: Record<string, string> = { ...options.queryParams };
    if (opts.caseId) queryParams.case_id = opts.caseId;
    if (opts.limit) queryParams.limit = String(opts.limit);

    const raw = await this.client.request('GET', `${BASE}/conversations`, {
      ...options,
      queryParams,
    });
    return asArray(raw).map(toConversation);
  }

  /** One conversation the caller owns. Returns the row only — see `listTurns`. */
  async getConversation(id: string, options: RequestOptions = {}): Promise<Conversation> {
    return toConversation(
      await this.client.request('GET', `${BASE}/conversations/${encodeURIComponent(id)}`, options),
    );
  }

  /**
   * Starts a thread.
   *
   * `caseId` files it on creation; leaving it out starts it unfiled, which is a
   * normal durable state rather than a draft — the thread survives and can be
   * filed later. A title is required.
   *
   * Accounts are capped at 500 conversations, past which the API answers 400.
   */
  async createConversation(
    input: ConversationInput,
    options: RequestOptions = {},
  ): Promise<Conversation> {
    return toConversation(
      await this.client.request('POST', `${BASE}/conversations`, {
        ...options,
        body: conversationBody(input, false),
      }),
    );
  }

  /**
   * Renames a conversation, files it into a case, or unfiles it.
   *
   * Pass `caseId: ''` to unfile. Filing and unfiling only move the pointer; no
   * messages are copied or deleted either way, and `''` is exactly what
   * `getConversation` hands back for an unfiled thread, so the round trip is
   * symmetric.
   */
  async updateConversation(
    id: string,
    input: ConversationInput,
    options: RequestOptions = {},
  ): Promise<Conversation> {
    return toConversation(
      await this.client.request('PATCH', `${BASE}/conversations/${encodeURIComponent(id)}`, {
        ...options,
        body: conversationBody(input, true),
      }),
    );
  }

  /**
   * Deletes a conversation and every turn in it.
   *
   * This is the one destructive operation on conversations — deleting the *case*
   * a conversation is filed under only detaches it, leaving the thread unfiled
   * and intact.
   */
  async deleteConversation(id: string, options: RequestOptions = {}): Promise<void> {
    await this.client.request('DELETE', `${BASE}/conversations/${encodeURIComponent(id)}`, options);
  }

  /**
   * A conversation's turns in `seq` order, oldest first.
   *
   * One page holds at most 200 turns; that is a display ceiling, not the model's
   * context window. A conversation with nothing written yet returns an empty
   * array rather than erroring.
   */
  async listTurns(
    conversationId: string,
    opts: { limit?: number } = {},
    options: RequestOptions = {},
  ): Promise<Turn[]> {
    const queryParams: Record<string, string> = { ...options.queryParams };
    if (opts.limit) queryParams.limit = String(opts.limit);

    const raw = await this.client.request(
      'GET',
      `${BASE}/conversations/${encodeURIComponent(conversationId)}/turns`,
      { ...options, queryParams },
    );
    return asArray(raw).map(toTurn);
  }

  /**
   * Records one exchange and returns it as stored.
   *
   * Safe to retry: the document id is derived from the conversation and the
   * turn's ordinal, so re-sending after a failed or lost response overwrites the
   * same document rather than leaving the thread with the exchange twice.
   *
   * A question is required; an answer is not, so a turn can be written before
   * generation finishes.
   */
  async appendTurn(
    conversationId: string,
    input: { question: string; answer?: string; tools?: ToolCall[] },
    options: RequestOptions = {},
  ): Promise<Turn> {
    return toTurn(
      await this.client.request(
        'POST',
        `${BASE}/conversations/${encodeURIComponent(conversationId)}/turns`,
        {
          ...options,
          body: {
            question: input.question,
            answer: input.answer ?? '',
            tools: input.tools ?? [],
          },
        },
      ),
    );
  }

  /**
   * Full-text search across every conversation the caller owns — "which
   * investigation did I see this hash in?".
   *
   * Hits come back as turns, not conversations, because the match is an
   * exchange; each carries `conversationId` so a UI can open the thread it came
   * from. Ordered newest first, unlike `listTurns`, which reads a single thread
   * in order.
   *
   * The server caps `limit` at 50 and defaults to 25. A blank query returns
   * nothing rather than everything.
   */
  async searchConversations(
    query: string,
    opts: { limit?: number } = {},
    options: RequestOptions = {},
  ): Promise<Turn[]> {
    const queryParams: Record<string, string> = { ...options.queryParams, q: query };
    if (opts.limit) queryParams.limit = String(opts.limit);

    const raw = await this.client.request('GET', `${BASE}/conversations/search`, {
      ...options,
      queryParams,
    });
    return asArray(raw).map(toTurn);
  }
}
