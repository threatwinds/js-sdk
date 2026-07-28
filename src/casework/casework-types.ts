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
  /** Deterministic document id, derived from rule + entity + dedup bucket. */
  id: string;
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

/**
 * Filter sentinel for `listConversations`: only threads attached to no case.
 *
 * The API takes this literal word where a case UUID would otherwise go, because
 * "has no case" cannot be expressed as a value of the column being filtered on.
 */
export const UNFILED = 'unfiled';

/**
 * One tool the assistant invoked while producing an answer.
 *
 * `args` stays an opaque string rather than a parsed object: the service records
 * verbatim what the model emitted, so a turn replays exactly as it happened even
 * after the tool's schema has moved on. Parse it at the point of display, and be
 * prepared for it not to parse.
 */
export interface ToolCall {
  name: string;
  args: string;
}

/**
 * A durable question-and-answer thread.
 *
 * A case owns its conversations, but ownership is one nullable column rather
 * than a separate kind of record. `caseId === ''` means the thread is unfiled;
 * filing it later sets the field and moves no data. Deleting a case detaches its
 * conversations instead of destroying them, so an unfiled thread may be one that
 * was never filed or one whose case is gone — both are equally durable and
 * equally readable. There is no such thing as a draft conversation.
 *
 * The row lives in PostgreSQL and arrives snake_case; its messages live in
 * OpenSearch and arrive camelCase (see `Turn`). That split is deliberate — a
 * single turn can carry a relation graph of hundreds of nodes, and keeping those
 * out of the relational store is what stops a case list from joining against
 * unbounded blobs. Both halves are normalised to camelCase here.
 */
export interface Conversation {
  id: string;
  title: string;
  /** Owning case, or `''` when unfiled. Never null or undefined on this surface. */
  caseId: string;
  /**
   * Turns recorded so far, denormalised server-side so a conversation list can
   * sort by recency without querying the message store per row. It is also the
   * `seq` the next appended turn will be given.
   */
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields to set on a conversation. Anything left `undefined` is unchanged. */
export interface ConversationInput {
  title?: string;
  /**
   * The case to file this conversation into.
   *
   * On update, `''` unfiles it. The SDK translates that to the nil UUID the API
   * requires: the server decodes `case_id` into a pointer, where an explicit
   * JSON `null` and an absent key are indistinguishable once decoded, so "clear
   * this field" needs a value of its own. On create there is nothing to clear,
   * and `''` simply means the thread starts unfiled.
   *
   * Filing into a case you do not own returns 404, like every other
   * cross-account access in this service — not 403, which would confirm that
   * the case exists.
   */
  caseId?: string;
}

/**
 * One exchange within a conversation: a question, its answer, and the tools
 * called along the way.
 *
 * Turn documents are append-only, and the document id is derived from
 * (conversation, seq). A client that retries a write after a failed response
 * therefore overwrites the same document instead of leaving the thread with the
 * same exchange twice.
 *
 * Unlike `Conversation`, turns come from OpenSearch: they arrive camelCase with
 * the timestamp under `@timestamp`. The mapper accepts both spellings of every
 * field so neither store's convention leaks past the SDK.
 */
export interface Turn {
  /** Deterministic, derived from the conversation id and `seq`. */
  id: string;
  conversationId: string;
  /** The owning case when the turn was written, or `''` if the thread was unfiled. */
  caseId: string;
  userId: string;
  /** Wire field is `@timestamp`. */
  createdAt: string;
  question: string;
  answer: string;
  tools: ToolCall[];
  /**
   * Ordinal within the conversation. Turns sort on this rather than on time, so
   * ordering does not depend on clock resolution when two land in the same
   * millisecond.
   */
  seq: number;
}
