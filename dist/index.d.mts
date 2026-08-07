interface ClientConfig {
    baseUrl?: string;
    apiKey?: string;
    apiSecret?: string;
    bearer?: string;
    timeout?: number;
    maxRetries?: number;
}
interface RequestOptions {
    headers?: Record<string, string>;
    body?: unknown;
    queryParams?: Record<string, string>;
    /** Caller-controlled cancellation, combined with the client timeout. */
    signal?: AbortSignal;
    /**
     * Overrides the client timeout for this call. Streaming completions can run
     * far longer than the 30s default.
     */
    timeout?: number;
}
declare class ThreatWindsClient {
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly apiSecret: string;
    bearer: string;
    readonly timeout: number;
    readonly maxRetries: number;
    constructor(config?: ClientConfig);
    setBearerToken(token: string): void;
    request(method: string, path: string, options?: RequestOptions): Promise<unknown>;
    /**
     * Issues one request and returns the raw outcome without interpreting the
     * status.
     *
     * The AI generation endpoints run on pods that scale to zero and answer a
     * cold request with a 503 the caller must retry rather than surface. Those
     * callers need the status and headers (notably Retry-After) before any error
     * is thrown, which `request` cannot give them. Also accepts a body that is
     * already encoded — multipart audio uploads are not JSON.
     */
    rawRequest(method: string, path: string, options?: RequestOptions & {
        rawBody?: FormData | string | ArrayBuffer | Uint8Array;
        accept?: string;
    }): Promise<{
        status: number;
        headers: Headers;
        body: ArrayBuffer;
    }>;
    private requestOnce;
    /**
     * Issues a request and yields decoded server-sent events as they arrive.
     * Never retried: a partially consumed stream cannot be replayed safely.
     *
     * Yields the raw `data:` payload of each event, with the terminal `[DONE]`
     * sentinel already filtered out.
     */
    stream(method: string, path: string, options?: RequestOptions): AsyncGenerator<string, void, unknown>;
    private createError;
    private applyAuth;
}

declare const DefaultEndpoint = "https://api.threatwinds.com";
declare const DefaultTimeout = 30000;
declare const DefaultMaxRetries = 3;

declare class ThreatWindsError extends Error {
    constructor(message: string);
}
declare class APIError extends ThreatWindsError {
    readonly statusCode: number;
    readonly method: string;
    readonly path: string;
    readonly rawMessage: string;
    readonly errorId: string;
    readonly retryAfter: string;
    readonly body: unknown;
    constructor(statusCode: number, method: string, path: string, rawMessage: string, errorId?: string, retryAfter?: string, body?: unknown);
    isNotFound(): boolean;
    isUnauthorized(): boolean;
    isForbidden(): boolean;
    isRateLimited(): boolean;
    isValidationError(): boolean;
}
declare class AuthError extends APIError {
    constructor(statusCode: number, method: string, path: string, message: string, errorId?: string);
}
declare class RateLimitError extends APIError {
    readonly retryAfterSeconds: number;
    constructor(retryAfterSeconds: number, method: string, path: string, message?: string, errorId?: string);
}
declare class SDKError extends ThreatWindsError {
    constructor(message: string);
}

interface PaginationParams {
    page?: number;
    limit?: number;
}
interface APIResponse<T = unknown> {
    data: T;
    status: number;
}
interface PaginatedResponse<T> {
    results: T[];
    pages: number;
    next: number | null;
}

interface EntityObject {
    id: string;
    type: string;
    reputation: number;
    attributes: Record<string, string>;
}
/** Exact type+value lookup request. */
interface EntityLookupRequest {
    type: string;
    value: string;
}
/**
 * Full entity record returned by exact lookup. Unlike simple search — which
 * tokenizes the query and matches loosely — this resolves one specific
 * indicator.
 */
interface EntityRecord {
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
interface EntityResults {
    /** Total number of matching entities across all pages. */
    items: number;
    /** Total number of pages at the requested `limit`. */
    pages: number;
    results: EntityObject[];
    /** Always null for simple search; aggregations are advanced-search only. */
    aggregations: Record<string, AggregationResult> | null;
}
interface Source {
    includes: string[];
    excludes: string[];
}
interface SimpleSearchRequest {
    query: string;
    source: Source;
}
interface SimpleSearchOptions {
    /** 1-based. Defaults to 1. */
    page?: number;
    /** Defaults to 10 server-side, max 1000. */
    limit?: number;
    /** Field to sort on. Defaults to `@timestamp`. */
    sort?: string;
    order?: 'asc' | 'desc';
}
interface Terms {
    field: string;
    /**
     * Number of buckets to return. Defaults to 10 server-side, which silently
     * truncates results and undercounts totals — always set it explicitly.
     */
    size?: number;
}
interface Aggs {
    terms: Terms;
}
/** A single query clause, e.g. `{ terms: { 'type.keyword': [...] } }`. */
type QueryClause = Record<string, unknown>;
interface Bool {
    /**
     * Must be an ARRAY of clauses. Passing a bare object is rejected by the API
     * with HTTP 400 "incorrect json format".
     */
    must: QueryClause[];
}
interface AdvancedSearchBody {
    aggs: Record<string, Aggs>;
    query: Bool;
    source: Source;
}
interface AggregationBucket {
    key: string;
    doc_count: number;
}
interface AggregationResult {
    buckets: AggregationBucket[];
}
interface AdvancedSearchResponse {
    aggregations: Record<string, AggregationResult>;
}

type SimpleSearchParams = {
    query: string;
    source?: {
        includes?: string[];
        excludes?: string[];
    };
} & SimpleSearchOptions;
declare class SearchClient {
    private client;
    constructor(client: ThreatWindsClient);
    /**
     * Full-text search over entities.
     *
     * Paginate by incrementing `page` while it is `<= result.pages`; the API does
     * not return a cursor.
     */
    simpleSearch(params: SimpleSearchParams, options?: RequestOptions): Promise<EntityResults>;
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
    lookupEntity(type: string, value: string, options?: RequestOptions): Promise<EntityRecord | null>;
    /**
     * Structured search with aggregations.
     *
     * `body.query.must` must be an array of clauses, and every terms aggregation
     * should set an explicit `size` — the server default of 10 buckets silently
     * truncates results.
     */
    advancedSearch(body: AdvancedSearchBody, options?: RequestOptions): Promise<AdvancedSearchResponse>;
}

interface Geolocation {
    latitude: number;
    longitude: number;
    radius: number;
    ip: string | null;
}
interface Association {
    id: string;
    type: string;
    value: string;
    reputation: number | null;
}
interface Metadata {
    [key: string]: string;
}
interface ExtendedMetadata {
    [key: string]: Metadata;
}
interface EntityAttributes {
    id: string;
    type: string;
    value: string;
    description: string;
    reputationScore: number | null;
    reputation: string;
    accuracyScore: number | null;
    accuracy: string;
    worstReputationScore: number | null;
    worstReputation: string;
    bestReputationScore: number | null;
    bestReputation: string;
}
interface EntityDetails {
    attributes: EntityAttributes;
    metadata: Metadata | null;
    extendedMetadata: ExtendedMetadata | null;
    geolocations: Geolocation[] | null;
    latestAssociations: Association[] | null;
}
interface RelationNode {
    id: string;
    type: string;
    value: string;
    reputation: number | null;
}
interface RelationEdge {
    source: string;
    target: string;
    type: string;
}
interface RelationsResult {
    nodes: RelationNode[];
    edges: RelationEdge[];
    depth: number;
}
/** One term-aggregation bucket from the corpus analytics endpoints. */
interface AnalyticsBucket {
    key: string;
    count: number;
}
/** One date-histogram bucket. */
interface AnalyticsTimeBucket {
    timestamp: string;
    count: number;
}
/** Situational snapshot of the corpus visible to the caller. */
interface CorpusOverview {
    totalEntities: number;
    maliciousCount: number;
    /** Proportion in 0..1, not a percentage. */
    maliciousShare: number;
    trackedTypes: number;
    byType: AnalyticsBucket[];
    byReputation: AnalyticsBucket[];
    byAccuracy: AnalyticsBucket[];
    topTags: AnalyticsBucket[];
    timeline: AnalyticsTimeBucket[];
    windowDays: number;
}
/** One entity in the recent-activity feed. */
interface RecentEntity {
    id: string;
    type: string;
    value: string;
    reputation: number;
    reputationLabel: string;
    accuracy: number;
    accuracyLabel: string;
    tags: string[];
    firstSeen: string;
    lastSeen: string;
}
interface RecentFeed {
    items: RecentEntity[];
    windowHours: number;
    since: string;
}
/** Threat volume grouped by geographic and network origin. */
interface Attribution {
    byCountry: AnalyticsBucket[];
    byAsn: AnalyticsBucket[];
    byAso: AnalyticsBucket[];
    maliciousOnly: boolean;
}
type ThreatEventType = 'entity.created' | 'entity.malicious' | 'entity.linked';
/**
 * One message from the live threat feed.
 *
 * The server deliberately omits the entity's security groups, so there is no
 * `visibleBy` here — visibility is enforced before the event is sent.
 */
interface ThreatEvent {
    type: ThreatEventType;
    time: string;
    entityId: string;
    entityType: string;
    value: string;
    reputation: number;
    tags: string[];
    /** Present only on `entity.linked`. */
    toEntityId: string;
    /** Present only on `entity.linked`: `association` or `aggregation`. */
    mode: string;
}
interface LiveFeedHandlers {
    onEvent(event: ThreatEvent): void;
    onError?(error: Error): void;
    /** Called on every close, whether or not a reconnect follows. */
    onClose?(): void;
    /** Called when a reconnect attempt succeeds. */
    onOpen?(): void;
}
interface LiveFeedOptions extends LiveFeedHandlers {
    /** Reconnect automatically after an unexpected close. Defaults to true. */
    reconnect?: boolean;
}
/** Handle returned by subscribeLive; call close() to stop and stop reconnecting. */
interface LiveFeedSubscription {
    close(): void;
    readonly connected: boolean;
}

declare class AnalyticsClient {
    private client;
    constructor(client: ThreatWindsClient);
    /**
     * Full dossier for an entity.
     *
     * The endpoint returns snake_case at the top level (`latest_associations`,
     * `extended_metadata`) and geolocations keyed `accuracy_radius`/`object`, so
     * the whole payload is normalized — not just `attributes`.
     */
    getEntityDetails(id: string, options?: RequestOptions): Promise<EntityDetails>;
    /**
     * Relationship graph around an entity.
     *
     * The API returns the edge list under `relations`; earlier versions of this
     * method read `edges`, which does not exist in the response and so always
     * produced an empty graph. Both spellings are accepted now.
     */
    getEntityRelations(id: string, depth?: number, options?: RequestOptions): Promise<RelationsResult>;
    /**
     * Situational overview of the corpus the caller can see.
     *
     * Counts are computed server-side over group-filtered data, so two callers
     * with different group membership legitimately see different totals.
     */
    getOverview(days?: number, options?: RequestOptions): Promise<CorpusOverview>;
    /** Recently observed entities; malicious-only by default. */
    getRecent({ hours, limit, maliciousOnly }?: {
        hours?: number;
        limit?: number;
        maliciousOnly?: boolean;
    }, options?: RequestOptions): Promise<RecentFeed>;
    /** Threat volume grouped by country, ASN and ASO. */
    getAttribution({ size, maliciousOnly }?: {
        size?: number;
        maliciousOnly?: boolean;
    }, options?: RequestOptions): Promise<Attribution>;
    /**
     * Mints a single-use ticket for the live feed.
     *
     * Exposed mainly for callers driving their own socket; subscribeLive does
     * this for you.
     */
    mintLiveTicket(options?: RequestOptions): Promise<string>;
    /**
     * Subscribes to the live threat feed.
     *
     * A browser cannot set an Authorization header on a WebSocket handshake, so
     * the connection is authorised by a short-lived single-use ticket fetched
     * over ordinary authenticated HTTP. Because a ticket is consumed on use,
     * every reconnect mints a fresh one.
     */
    subscribeLive(options: LiveFeedOptions): LiveFeedSubscription;
}

/**
 * Warm-up handling for the self-hosted AI generation endpoints.
 *
 * Chat, embeddings, transcription and speech run on pods that scale to zero.
 * A request that arrives cold gets a 503 in one of two shapes:
 *
 *   - `model_warming_up` with a `Retry-After` header. The server is
 *     authoritative on timing: a cold boot can advertise ~1500s, a warm resume
 *     ~600s. Under-waiting just burns attempts on a pod that has not finished
 *     booting.
 *   - "no healthy backends" with **no** `Retry-After`. This is the first-touch
 *     response for a scaled-to-zero pod, before the scaler has registered it as
 *     warming. It is a warming signal in disguise, so it must be retried too —
 *     treating only `model_warming_up` as retryable fails immediately on the
 *     most common cold path.
 *
 * So any 503 is retryable here. Anything else — including a 500 — is a real
 * result the caller must see, not a warming state.
 */
/** Progress while a request waits for a cold model. */
interface WarmupProgress {
    /** 1 for the first retry. */
    attempt: number;
    /** Seconds this client will wait before the next attempt. */
    waitSeconds: number;
    /** Seconds waited so far across all attempts. */
    elapsedSeconds: number;
    /** True when the server explicitly said it is warming, rather than 503-ing. */
    advertised: boolean;
}
interface WarmupOptions {
    /**
     * Total wall-clock to spend retrying, in seconds.
     *
     * Defaults to 5 minutes rather than the ~30 the server's cold-start ceiling
     * would justify: a person is waiting on the other end of this, and a UI that
     * hangs silently for half an hour is indistinguishable from one that is
     * broken. Callers doing batch work should raise it.
     */
    budgetSeconds?: number;
    /** Called before each wait so a UI can show what is happening. */
    onWarming?(progress: WarmupProgress): void;
    signal?: AbortSignal;
}
declare const DEFAULT_WARMUP_BUDGET_SECONDS = 300;
/**
 * Back-off applied to a 503 that carries no Retry-After. The server is silent
 * on timing, so this is a guess — deliberately short, because the alternative
 * (a long fixed wait) makes a transient blip feel like an outage.
 */
declare const NO_BACKENDS_GRACE_SECONDS = 15;
/** One raw HTTP outcome. */
interface HttpOutcome {
    status: number;
    headers: Headers;
    body: ArrayBuffer;
}
/**
 * Decides whether an outcome should be retried and how long to wait first.
 * Exported so the policy can be unit-tested without issuing requests.
 */
declare function warmupDecision(status: number, headers: Headers | null): {
    retry: boolean;
    waitSeconds: number;
    advertised: boolean;
};
/**
 * Re-issues `attempt` until it yields a non-503 outcome or the budget runs out.
 *
 * The final outcome is returned unchanged — including a 503 if the budget
 * expired — so the caller decides how to report it.
 */
declare function withWarmup(attempt: () => Promise<HttpOutcome>, options?: WarmupOptions): Promise<HttpOutcome>;
/**
 * Retries a streaming call that failed its handshake with a 503.
 *
 * Only the handshake is retryable. `attempt` must not have emitted anything to
 * the caller before it throws, which holds for the chat stream: the SDK checks
 * the response status before yielding its first event, so a 503 always fails
 * ahead of any delta.
 */
declare function retryStreamWarmup<T>(attempt: () => Promise<T>, options?: WarmupOptions): Promise<T>;

/**
 * Types for the ThreatWinds AI API (`/api/ai/v1`), an OpenAI-compatible surface
 * over OpenAI, Gemini, Claude and ThreatWinds self-hosted models.
 */
type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
interface ToolFunctionDefinition {
    name: string;
    description: string;
    /** JSON Schema describing the function's arguments. */
    parameters: Record<string, unknown>;
}
interface ToolDefinition {
    type: 'function';
    function: ToolFunctionDefinition;
}
interface ToolCall$1 {
    id: string;
    type: 'function';
    function: {
        name: string;
        /** JSON-encoded arguments; may need parsing before use. */
        arguments: string;
    };
}
interface SystemMessage {
    role: 'system';
    content: string;
}
interface UserMessage {
    role: 'user';
    content: string;
}
interface AssistantMessage {
    role: 'assistant';
    content: string | null;
    tool_calls?: ToolCall$1[];
}
interface ToolMessage {
    role: 'tool';
    content: string;
    tool_call_id: string;
}
type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage;
interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    tool_choice?: 'auto' | 'none' | 'required';
    max_completion_tokens?: number;
    reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
    response_format?: {
        type: 'json_object' | 'json_schema';
        json_schema?: Record<string, unknown>;
    };
    temperature?: number;
    top_p?: number;
}
interface Usage {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
}
interface ChatCompletionChoice {
    index: number;
    message: AssistantMessage;
    finish_reason: string;
}
interface ChatCompletionResponse {
    id: string;
    object: string;
    model: string;
    choices: ChatCompletionChoice[];
    usage?: Usage;
}
/** Assembled result of a streamed completion. */
interface ChatCompletionResult {
    content: string;
    toolCalls: ToolCall$1[];
    finishReason: string;
    usage?: Usage;
}
interface ChatStreamDelta {
    /** Text fragment, empty when the chunk only carried tool-call data. */
    content: string;
    /** True once the stream has finished and `result` is populated. */
    done: boolean;
}
/**
 * Capabilities advertised per model. Sending a chat request to a model without
 * `chat` fails with HTTP 400, so callers should filter before dispatching —
 * `/models` mixes transcription, embedding and chat models in one list.
 */
type ModelCapability = 'chat' | 'tools-use' | 'reasoning' | 'text-generation' | 'code-generation' | 'image' | 'video' | 'audio' | 'transcription' | 'speech' | 'embedding' | (string & {});
interface ModelLimits {
    maxInputTokens?: number;
    maxTotalTokens?: number;
}
interface AIModel {
    id: string;
    object?: string;
    /** Human-readable label, e.g. "Silas 1.6 Pro". */
    name?: string;
    provider?: string;
    ownedBy?: string;
    capabilities: ModelCapability[];
    limits?: ModelLimits;
    /** Provider defaults and valid ranges for sampling parameters. */
    params?: Record<string, number>;
}
interface TokenCountRequest {
    model: string;
    messages: ChatMessage[];
}
interface TokenCountResponse {
    tokens: number;
}
interface EmbeddingsRequest {
    model: string;
    input: string | string[];
}
interface EmbeddingsResponse {
    data: Array<{
        embedding: number[];
        index: number;
    }>;
    model: string;
    usage?: Usage;
}
/** Speech-to-text request. */
interface TranscriptionRequest {
    /** Recorded audio. */
    audio: Blob;
    /** Filename sent in the multipart part; only the extension matters. */
    filename?: string;
    model?: string;
    /** ISO-639-1 hint. Improves accuracy and latency when known. */
    language?: string;
    /** Biases the decoder — useful for domain vocabulary and a wake word. */
    prompt?: string;
}
interface TranscriptionResponse {
    text: string;
}
type SpeechFormat = 'mp3' | 'wav' | 'flac' | 'pcm';
/** Text-to-speech request. */
interface SpeechRequest {
    input: string;
    model?: string;
    /** Kokoro voice id, e.g. `af_heart`. */
    voice?: string;
    responseFormat?: SpeechFormat;
    /** 0.5–2.0. */
    speed?: number;
}

/**
 * Client for the ThreatWinds AI API.
 *
 * Note this API is served from a different host than search/analytics, so it
 * usually needs its own `ThreatWindsClient` instance:
 *
 * ```ts
 * const ai = new AiClient(new ThreatWindsClient({
 *   baseUrl: 'https://apis.threatwinds.com',
 *   bearer: myKey,
 * }));
 * ```
 */
declare class AiClient {
    private client;
    constructor(client: ThreatWindsClient);
    /**
     * Full model catalogue, including transcription and embedding models. Use
     * `listChatModels` when you intend to call chat completions.
     */
    listModels(signal?: AbortSignal): Promise<AIModel[]>;
    /**
     * Models that accept chat completions. Pass `requireTools` when the caller
     * runs an agent loop — a model without `tools-use` will simply ignore the
     * tool definitions and answer from memory instead of querying the API.
     */
    listChatModels(opts?: {
        requireTools?: boolean;
        signal?: AbortSignal;
    }): Promise<AIModel[]>;
    /** Non-streaming completion. Prefer `streamChatCompletion` for interactive UI. */
    chatCompletion(req: ChatCompletionRequest, signal?: AbortSignal, warmup?: WarmupOptions): Promise<ChatCompletionResponse>;
    /**
     * Streams a completion, invoking `onDelta` with each text fragment.
     *
     * Tool calls arrive fragmented across chunks — keyed by index, with the
     * arguments JSON split arbitrarily — so they are reassembled here and only
     * returned once complete. That matters for agent loops, which cannot execute
     * a tool until its arguments parse.
     */
    streamChatCompletion(req: ChatCompletionRequest, onDelta?: (text: string) => void, signal?: AbortSignal, warmup?: WarmupOptions): Promise<ChatCompletionResult>;
    private streamOnce;
    countTokens(req: TokenCountRequest, signal?: AbortSignal, warmup?: WarmupOptions): Promise<TokenCountResponse>;
    embeddings(req: EmbeddingsRequest, signal?: AbortSignal, warmup?: WarmupOptions): Promise<EmbeddingsResponse>;
    /**
     * Issues a JSON request through the warm-up policy and decodes the result.
     *
     * Every generation endpoint on this client goes through here. The pods scale
     * to zero, so any of them can answer a cold request with a 503 that means
     * "wait, I am booting" rather than "this failed" — handling that in one place
     * keeps it from being forgotten on whichever method is added next.
     */
    private warmJson;
    /**
     * Transcribes recorded audio.
     *
     * `prompt` biases the decoder. Passing the vocabulary you expect — a wake
     * word, indicator types — measurably improves recognition of terms a general
     * model has no reason to favour.
     */
    transcribe(req: TranscriptionRequest, opts?: {
        signal?: AbortSignal;
    } & WarmupOptions): Promise<TranscriptionResponse>;
    /** Synthesises speech, returning the encoded audio. */
    speak(req: SpeechRequest, opts?: {
        signal?: AbortSignal;
    } & WarmupOptions): Promise<{
        audio: ArrayBuffer;
        contentType: string;
    }>;
}

/**
 * Types for the ThreatWinds Billing API (`/api/billing/v1`).
 *
 * Two related but distinct concepts:
 * - **Limits** are rate/volume ceilings per tier, scoped to a time window
 *   (e.g. 60 model listings per minute, N chat completions per month).
 * - **Quotas** are stateful resource caps with no window (e.g. 6 compute
 *   instances), where `currentUsage` is a live count rather than a rolling one.
 */
interface Customer {
    id: string;
    /** Payment-provider customer id (Stripe). */
    gcid?: string;
}
/**
 * Billing address for a customer.
 *
 * Every field is required by the API, and the whole address is forwarded to
 * Stripe as the customer's address — so these are real billing details, not
 * metadata that can be filled with placeholders.
 */
interface BillingAddress {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    /**
     * ISO 3166-1 alpha-2, uppercase. The API validates against its own table and
     * rejects anything else with a 400 naming the `country` field, so a spelled
     * out country name will not be accepted.
     */
    country: string;
}
interface CreateCustomerRequest {
    email: string;
    /** Billing entity name, e.g. "Acme Corp". Becomes the Stripe customer name. */
    name: string;
    billingAddress: BillingAddress;
}
/** `POST /customer` acknowledges; it does not return the created customer. */
interface CreateCustomerResponse {
    message: string;
}
interface LimitDefinition {
    value: number;
    /** e.g. "minute", "month". */
    window: string;
    description: string;
}
/** Limit definitions keyed by feature, grouped by service. */
interface TierLimits {
    customerId: string;
    tierName: string;
    limits: Record<string, Record<string, LimitDefinition>>;
}
interface ServiceLimits {
    customerId: string;
    tierName: string;
    serviceName: string;
    limits: Record<string, LimitDefinition>;
}
interface FeatureUsage {
    featureKey: string;
    currentUsage: number;
    limit: number;
    remaining: number;
    tierName?: string;
    window?: string;
    description?: string;
    /** Unix seconds; 0 when the window does not reset. */
    resetAt?: number;
    /** True once the limit is exhausted and requests are being rejected. */
    isLocked?: boolean;
    identifier?: string;
    identifierType?: string;
}
interface ServiceUsage {
    serviceName: string;
    features: FeatureUsage[];
}
interface UsageReport {
    identifier: string;
    /** "user" for an authenticated caller, "ip" for anonymous. */
    identifierType: string;
    services: Record<string, ServiceUsage>;
    totalFeatures: number;
    fetchedAt: number;
}
interface QuotaReport {
    customerId: string;
    services: Record<string, ServiceUsage>;
    totalFeatures: number;
    fetchedAt?: number;
}
interface AddMemberRequest {
    email: string;
}
interface TransferOwnershipRequest {
    email: string;
}

/**
 * Client for the ThreatWinds Billing API — tier limits, live consumption and
 * resource quotas.
 *
 * Useful beyond invoicing: `getUsage` is how a client can show an analyst how
 * close they are to a rate limit before the API starts rejecting calls.
 */
declare class BillingClient {
    private client;
    constructor(client: ThreatWindsClient);
    /** Returns `null` when the caller has no customer record yet. */
    getCustomer(options?: RequestOptions): Promise<Customer | null>;
    /**
     * Creates the caller's customer record.
     *
     * Signing a user up does not create one, so a new account has none until this
     * is called and its first metered request would otherwise fail. The request
     * body is mandatory — this previously sent none and the API answered
     * `400 invalid JSON body: EOF`.
     *
     * Fails with `412` when the caller already belongs to a customer, so this is
     * safe to call defensively: it cannot produce a duplicate.
     */
    createCustomer(request: CreateCustomerRequest, options?: RequestOptions): Promise<CreateCustomerResponse>;
    /** Limit definitions for every service on the caller's tier. */
    getLimits(options?: RequestOptions): Promise<TierLimits>;
    /** Limit definitions for one service, e.g. `ai-api`. */
    getServiceLimits(serviceName: string, options?: RequestOptions): Promise<ServiceLimits>;
    /** Live consumption for the authenticated user. */
    getUsage(options?: RequestOptions): Promise<UsageReport>;
    /** Live consumption attributed to the caller's IP, for anonymous access. */
    getIpUsage(options?: RequestOptions): Promise<UsageReport>;
    /** Stateful resource caps, e.g. concurrent compute instances. */
    getQuotas(options?: RequestOptions): Promise<QuotaReport>;
    addMember(request: AddMemberRequest, options?: RequestOptions): Promise<unknown>;
    transferOwnership(request: TransferOwnershipRequest, options?: RequestOptions): Promise<unknown>;
}

/**
 * Types for the ThreatWinds Auth API (`/api/auth/v2`).
 *
 * Authentication is a two-step email flow: create a session (or register a
 * user), which emails a one-time code, then verify that code. The bearer token
 * is issued up front but only becomes usable once verification succeeds.
 *
 * Note the API spells the field `verificationCodeID` (capital D); earlier SDK
 * versions declared `verificationCodeId`, which never matched the wire format.
 */
/** `standard` is the normal interactive session kind. */
type SessionKind = 'standard' | (string & {});
interface SessionCreationRequest {
    email: string;
    kind?: SessionKind;
}
interface SignUpRequest {
    email: string;
    fullName: string;
    alias: string;
}
/** Returned by both session creation and self-registration. */
interface SessionCreationResponse {
    bearer: string;
    sessionID: string;
    /** Unix seconds. */
    expireAt: number;
    /** Pair this with the emailed code to complete verification. */
    verificationCodeID: string;
    kind?: SessionKind;
    ip?: string;
    userAgent?: string;
}
interface SessionVerificationRequest {
    verificationCodeID: string;
    code: string;
}
interface Acknowledgement {
    message: string;
}
/** The authenticated user behind the current bearer token. */
interface SessionInfo {
    sessionID: string;
    userID: string;
    alias: string;
    fullName: string;
    expireAt: number;
    verified: boolean;
    kind?: SessionKind;
    ip?: string;
    roles: string[];
    groups: string[];
}
interface SessionSummary {
    sessionID: string;
    ip?: string;
    userAgent?: string;
    expireAt: number;
    current: boolean;
    kind?: SessionKind;
}
interface KeyPairRequest {
    name: string;
    /** Lifetime in days. */
    days: number;
}
/** `apiSecret` is only returned at creation time and cannot be retrieved later. */
interface KeyPair {
    apiKey: string;
    apiSecret?: string;
    keyID: string;
    keyName: string;
    expireAt: number;
    verified: boolean;
    verificationCodeID?: string;
}
interface UserLookupResponse {
    userID: string;
}
/**
 * Identity verification (KYC) state.
 *
 * `pending` means only that a verification session exists — NOT that a document
 * was submitted or that screening is running. Distinguishing the two requires
 * watching `attempts` increment.
 */
type VerificationStatus = 'passed' | 'pending' | 'failed' | 'expired' | (string & {});
interface VerificationAttempt {
    createdAt: string;
    status: string;
    failedReason?: string;
}
interface VerificationState {
    status: VerificationStatus;
    attempts: number;
    maxAttempts: number;
    /** Populated from the verified document once screening passes. */
    country?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    nationality?: string;
    attemptsLog?: VerificationAttempt[];
}
/** Result of starting verification; `url` points at the identity provider. */
interface VerificationSession extends Partial<VerificationState> {
    status: VerificationStatus;
    url?: string;
}

/**
 * Client for the ThreatWinds Auth API.
 *
 * Earlier versions targeted `/api/auth/v1` with `session/create` and
 * `session/verify`; the live API is v2 and uses different paths, methods and
 * field casing.
 *
 * Typical login:
 * ```ts
 * const started = await auth.createSession('analyst@example.com');
 * // user receives a one-time code by email
 * await auth.verifySession({ verificationCodeID: started.verificationCodeID, code });
 * auth.setBearerToken(started.bearer); // usable only after verification
 * ```
 */
declare class AuthClient {
    private client;
    constructor(client: ThreatWindsClient);
    /**
     * Starts an email login. Emails a one-time code and returns a bearer that
     * only becomes usable once `verifySession` succeeds.
     */
    createSession(email: string, opts?: {
        kind?: SessionCreationRequest['kind'];
    } & RequestOptions): Promise<SessionCreationResponse>;
    /**
     * Registers a new user. Throws a 403 APIError when self-registration is
     * disabled server-side.
     */
    signUp(request: SignUpRequest, options?: RequestOptions): Promise<SessionCreationResponse>;
    /** Completes login or signup with the emailed code. */
    verifySession(request: SessionVerificationRequest, options?: RequestOptions): Promise<Acknowledgement>;
    /**
     * Details of the session behind the current bearer token. Returns `null` for
     * an absent, expired or rejected token, so callers can treat "signed out" as
     * an ordinary state rather than an error.
     */
    getSession(options?: RequestOptions): Promise<SessionInfo | null>;
    extendSession(options?: RequestOptions): Promise<Acknowledgement>;
    closeSession(sessionID: string, options?: RequestOptions): Promise<Acknowledgement>;
    listSessions(options?: RequestOptions): Promise<SessionSummary[]>;
    /**
     * Creates a long-lived API key pair for programmatic access. `apiSecret` is
     * returned only here and cannot be recovered later.
     */
    createKeyPair(request: KeyPairRequest, options?: RequestOptions): Promise<KeyPair>;
    /** Returns full unredacted API keys — treat the result as a secret. */
    listKeyPairs(options?: RequestOptions): Promise<KeyPair[]>;
    deleteKeyPair(keyID: string, options?: RequestOptions): Promise<Acknowledgement>;
    findUserByEmail(email: string, options?: RequestOptions): Promise<string | null>;
    /**
     * Current identity-verification (KYC) state, including how many attempts
     * remain. Safe to poll.
     */
    getVerificationStatus(options?: RequestOptions): Promise<VerificationState>;
    /**
     * Starts identity verification and returns the provider URL the user must
     * visit to submit a document and selfie.
     *
     * Not idempotent in spirit — it consumes an attempt — so check
     * `getVerificationStatus` first and avoid calling it for an already-passed or
     * attempt-exhausted account.
     */
    initiateVerification(options?: RequestOptions): Promise<VerificationSession>;
    setBearerToken(token: string): void;
}

interface Feed {
    id: string;
    name: string;
    description: string;
    type: string;
    format: string;
    updatedAt: string;
}
interface FeedList {
    feeds: Feed[];
    pages: number;
    next: number | null;
}
interface Subscription {
    id: string;
    feedId: string;
    createdAt: string;
}
interface FeedListOptions {
    page?: number;
    limit?: number;
}

declare class FeedsClient {
    private client;
    private apiClient;
    constructor(client: ThreatWindsClient);
    listFeeds(_options?: FeedListOptions): Promise<FeedList>;
    getFeed(id: string): Promise<Feed>;
    subscribeToFeed(_id: string): Promise<Subscription>;
    unsubscribeFromFeed(_id: string): Promise<void>;
}

/**
 * Types for the ThreatWinds Ingest API (`/api/ingest/v1`).
 *
 * Note the entity payload does NOT carry a `value` field: an entity's value
 * lives in `attributes` under a key matching its own type, so an IP is
 * `{ type: 'ip', attributes: { ip: '203.0.113.1' } }`. Earlier SDK versions
 * declared a top-level `value`, which the API ignores — submissions built that
 * way are accepted but arrive without their indicator.
 *
 * Reputation here is -3..3, a narrower scale than the -5..+5 reported by search
 * and analytics.
 */
/** How a nested entity relates to its parent. */
type AssociationMode = 'aggregation' | 'association';
interface IngestAssociation {
    mode: AssociationMode;
    type: string;
    /** Must include a key matching `type`. */
    attributes: Record<string, string>;
    /** Associations nest recursively. */
    associations?: IngestAssociation[];
}
interface IngestEntity {
    type: string;
    /** Required. Must include a key matching `type` carrying the entity's value. */
    attributes: Record<string, string>;
    associations?: IngestAssociation[];
    /** -3 (malicious) to 3 (benign); 0 is neutral. */
    reputation?: number;
    /** Attribute names to spin out into linked child entities. */
    correlate?: string[];
    tags?: string[];
    /** Security groups that may see this entity. Defaults to the reporter's own. */
    visibleBy?: string[];
}
/** Ingestion is asynchronous — 202 with an acknowledgement, no entity id. */
interface IngestAck {
    message: string;
}
interface AssociationRequest {
    /** Source entity id, formatted `[type]-[hash]`. */
    entityID: string;
    relatedEntityID: string;
}
/** One attribute a given entity type may carry. */
interface EntityAttributeDefinition {
    type: string;
    label: string;
    description: string;
    dataType: string;
}
/** Schema for one of the supported entity types. */
interface EntityDefinition {
    type: string;
    label: string;
    description: string;
    dataType: string;
    attributes?: EntityAttributeDefinition[];
}
interface CommentRequest {
    entityId: string;
    content: string;
    parentId?: string | null;
}
interface Comment {
    id: string;
    entityId: string;
    content: string;
    author: string;
    authorName: string;
    createdAt: string;
    parentId: string | null;
}
interface ScanRequest {
    target: string;
    type: 'ip' | 'fqdn';
}
interface ScanResult {
    taskId: string;
    status: string;
    message: string;
}

/**
 * Client for the ThreatWinds Ingest API — reporting new indicators back into
 * the corpus.
 *
 * Authorization for entity, association and comment submission is identity
 * verification: any KYC-verified account may report. The former `reporter` role
 * is deprecated and no longer grants access. `well-known` still requires the
 * `trusted` role, and `scan` requires `user`.
 *
 * Ingestion is asynchronous: a 202 acknowledgement means accepted for
 * processing, not that the entity is queryable yet.
 *
 * Earlier SDK versions exposed a `/batch` endpoint and comment read/delete
 * routes that the API does not implement; they have been removed rather than
 * left to fail at runtime.
 */
declare class IngestClient {
    private client;
    constructor(client: ThreatWindsClient);
    /**
     * Reports a new entity, optionally with nested associations.
     *
     * The indicator's value belongs in `attributes` under a key matching `type`.
     * Requires a KYC-verified account.
     */
    submitEntity(entity: IngestEntity, options?: RequestOptions): Promise<IngestAck>;
    /** Links two existing entities. Both must share at least one security group. */
    submitAssociation(request: AssociationRequest, options?: RequestOptions): Promise<IngestAck>;
    /** Reports a well-known (trusted) entity. Requires the `trusted` role. */
    submitWellKnown(entity: IngestEntity, options?: RequestOptions): Promise<IngestAck>;
    /**
     * Schema for every supported entity type — the authoritative list of valid
     * `type` values and the attributes each accepts.
     */
    getDefinitions(options?: RequestOptions): Promise<EntityDefinition[]>;
    createComment(request: CommentRequest, options?: RequestOptions): Promise<Comment>;
    /** Schedules a scan of an IP or hostname. Requires the `user` role. */
    createScan(request: ScanRequest, options?: RequestOptions): Promise<ScanResult>;
    getScanStatus(taskId: string, options?: RequestOptions): Promise<ScanResult>;
}

/**
 * Casework: an analyst's own durable state — investigations, watchlists and
 * saved queries. Unlike search and analytics, these records belong to the
 * caller; the API scopes every read and write to the authenticated user.
 */
type CaseStatus = 'open' | 'in_progress' | 'closed';
/** 0 = informational … 4 = critical. Numeric so it sorts. */
type CaseSeverity = 0 | 1 | 2 | 3 | 4;
interface CaseNote {
    id: string;
    caseId: string;
    body: string;
    createdAt: string;
}
interface CaseEntity {
    id: string;
    caseId: string;
    entityId: string;
    entityType: string;
    entityValue: string;
    note: string;
    createdAt: string;
}
interface Case {
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
interface CaseInput {
    title?: string;
    summary?: string;
    status?: CaseStatus;
    severity?: CaseSeverity;
}
interface PinEntityInput {
    entityId: string;
    entityType?: string;
    entityValue?: string;
    note?: string;
}
/** How a watchlist rule is compared against incoming telemetry. */
type MatchKind = 'entity' | 'value' | 'tag' | 'type';
interface WatchlistItem {
    id: string;
    watchlistId: string;
    kind: MatchKind;
    value: string;
    /** Only fire for entities at or below this reputation. Absent = any. */
    maxReputation?: number;
    createdAt: string;
}
interface Watchlist {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
    items: WatchlistItem[];
}
interface WatchlistInput {
    name?: string;
    description?: string;
    enabled?: boolean;
}
interface WatchlistItemInput {
    kind: MatchKind;
    value: string;
    maxReputation?: number;
}
interface SavedSearch {
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
interface Alert {
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
interface AlertPage {
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
declare const UNFILED = "unfiled";
/**
 * One tool the assistant invoked while producing an answer.
 *
 * `args` stays an opaque string rather than a parsed object: the service records
 * verbatim what the model emitted, so a turn replays exactly as it happened even
 * after the tool's schema has moved on. Parse it at the point of display, and be
 * prepared for it not to parse.
 */
interface ToolCall {
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
interface Conversation {
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
interface ConversationInput {
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
interface Turn {
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

/**
 * Client for analyst-owned casework.
 *
 * Every route requires authentication — these records are private to the
 * caller, so an unauthenticated request has nothing to return.
 */
declare class CaseworkClient {
    private client;
    constructor(client: ThreatWindsClient);
    listCases(opts?: {
        status?: CaseStatus;
        limit?: number;
    }, options?: RequestOptions): Promise<Case[]>;
    /** Returns the case with its notes and pinned entities. */
    getCase(id: string, options?: RequestOptions): Promise<Case>;
    createCase(input: CaseInput, options?: RequestOptions): Promise<Case>;
    updateCase(id: string, input: CaseInput, options?: RequestOptions): Promise<Case>;
    deleteCase(id: string, options?: RequestOptions): Promise<void>;
    addNote(caseId: string, body: string, options?: RequestOptions): Promise<CaseNote>;
    /** Pinning the same entity twice is a no-op server-side, not an error. */
    pinEntity(caseId: string, input: PinEntityInput, options?: RequestOptions): Promise<CaseEntity>;
    unpinEntity(caseId: string, entityId: string, options?: RequestOptions): Promise<void>;
    listWatchlists(options?: RequestOptions): Promise<Watchlist[]>;
    createWatchlist(input: WatchlistInput, options?: RequestOptions): Promise<Watchlist>;
    updateWatchlist(id: string, input: WatchlistInput, options?: RequestOptions): Promise<Watchlist>;
    deleteWatchlist(id: string, options?: RequestOptions): Promise<void>;
    addWatchlistItem(watchlistId: string, input: WatchlistItemInput, options?: RequestOptions): Promise<WatchlistItem>;
    deleteWatchlistItem(watchlistId: string, itemId: string, options?: RequestOptions): Promise<void>;
    /**
     * Alerts newest first, with the caller's unread count.
     *
     * Unread is computed server-side from a read watermark, so it stays correct
     * regardless of what this page happens to contain.
     */
    listAlerts({ limit, unreadOnly }?: {
        limit?: number;
        unreadOnly?: boolean;
    }, options?: RequestOptions): Promise<AlertPage>;
    /** Advances the caller's read watermark to now. */
    markAlertsRead(options?: RequestOptions): Promise<void>;
    listSavedSearches(options?: RequestOptions): Promise<SavedSearch[]>;
    createSavedSearch(name: string, query: string, options?: RequestOptions): Promise<SavedSearch>;
    deleteSavedSearch(id: string, options?: RequestOptions): Promise<void>;
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
    listConversations(opts?: {
        caseId?: string;
        limit?: number;
    }, options?: RequestOptions): Promise<Conversation[]>;
    /** One conversation the caller owns. Returns the row only — see `listTurns`. */
    getConversation(id: string, options?: RequestOptions): Promise<Conversation>;
    /**
     * Starts a thread.
     *
     * `caseId` files it on creation; leaving it out starts it unfiled, which is a
     * normal durable state rather than a draft — the thread survives and can be
     * filed later. A title is required.
     *
     * Accounts are capped at 500 conversations, past which the API answers 400.
     */
    createConversation(input: ConversationInput, options?: RequestOptions): Promise<Conversation>;
    /**
     * Renames a conversation, files it into a case, or unfiles it.
     *
     * Pass `caseId: ''` to unfile. Filing and unfiling only move the pointer; no
     * messages are copied or deleted either way, and `''` is exactly what
     * `getConversation` hands back for an unfiled thread, so the round trip is
     * symmetric.
     */
    updateConversation(id: string, input: ConversationInput, options?: RequestOptions): Promise<Conversation>;
    /**
     * Deletes a conversation and every turn in it.
     *
     * This is the one destructive operation on conversations — deleting the *case*
     * a conversation is filed under only detaches it, leaving the thread unfiled
     * and intact.
     */
    deleteConversation(id: string, options?: RequestOptions): Promise<void>;
    /**
     * A conversation's turns in `seq` order, oldest first.
     *
     * One page holds at most 200 turns; that is a display ceiling, not the model's
     * context window. A conversation with nothing written yet returns an empty
     * array rather than erroring.
     */
    listTurns(conversationId: string, opts?: {
        limit?: number;
    }, options?: RequestOptions): Promise<Turn[]>;
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
    appendTurn(conversationId: string, input: {
        question: string;
        answer?: string;
        tools?: ToolCall[];
    }, options?: RequestOptions): Promise<Turn>;
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
    searchConversations(query: string, opts?: {
        limit?: number;
    }, options?: RequestOptions): Promise<Turn[]>;
}

/**
 * Indicator type detection.
 *
 * Exact lookup needs the entity type alongside the value, but analysts paste
 * bare indicators. Inferring the type from shape lets callers resolve
 * "8.8.8.8" or a SHA-256 without asking which kind it is.
 */
type IndicatorType = 'ip' | 'cidr' | 'domain' | 'hostname' | 'url' | 'md5' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512' | 'email';
/**
 * Best-guess ordering of candidate types for a raw indicator, most likely
 * first. Returns several because some shapes are genuinely ambiguous — a
 * two-label string is a domain, but a deeper one is usually a hostname.
 */
declare function detectIndicatorTypes(raw: string): IndicatorType[];
/** Convenience wrapper returning only the single most likely type. */
declare function detectIndicatorType(raw: string): IndicatorType | null;

export { type AIModel, APIError, type APIResponse, type Acknowledgement, type AddMemberRequest, type AdvancedSearchBody, type AdvancedSearchResponse, type AggregationBucket, type AggregationResult, type Aggs, AiClient, type Alert, type AlertPage, type AnalyticsBucket, AnalyticsClient, type AnalyticsTimeBucket, type AssistantMessage, type Association, type AssociationMode, type AssociationRequest, type Attribution, AuthClient, AuthError, type BillingAddress, BillingClient, type Bool, type Case, type CaseEntity, type CaseInput, type CaseNote, type CaseSeverity, type CaseStatus, CaseworkClient, type ChatCompletionChoice, type ChatCompletionRequest, type ChatCompletionResponse, type ChatCompletionResult, type ChatMessage, type ChatRole, type ChatStreamDelta, type ClientConfig, type Comment, type CommentRequest, type Conversation, type ConversationInput, type ToolCall as ConversationToolCall, type CorpusOverview, type CreateCustomerRequest, type CreateCustomerResponse, type Customer, DEFAULT_WARMUP_BUDGET_SECONDS, DefaultEndpoint, DefaultMaxRetries, DefaultTimeout, type EmbeddingsRequest, type EmbeddingsResponse, type EntityAttributeDefinition, type EntityAttributes, type EntityDefinition, type EntityDetails, type EntityLookupRequest, type EntityObject, type EntityRecord, type EntityResults, type ExtendedMetadata, type FeatureUsage, type Feed, type FeedList, type FeedListOptions, FeedsClient, type Geolocation, type IndicatorType, type IngestAck, type IngestAssociation, IngestClient, type IngestEntity, type KeyPair, type KeyPairRequest, type LimitDefinition, type LiveFeedHandlers, type LiveFeedOptions, type LiveFeedSubscription, type MatchKind, type Metadata, type ModelCapability, type ModelLimits, NO_BACKENDS_GRACE_SECONDS, type PaginatedResponse, type PaginationParams, type PinEntityInput, type QueryClause, type QuotaReport, RateLimitError, type RecentEntity, type RecentFeed, type RelationEdge, type RelationNode, type RelationsResult, type RequestOptions, SDKError, type SavedSearch, type ScanRequest, type ScanResult, SearchClient, type ServiceLimits, type ServiceUsage, type SessionCreationRequest, type SessionCreationResponse, type SessionInfo, type SessionKind, type SessionSummary, type SessionVerificationRequest, type SignUpRequest, type SimpleSearchOptions, type SimpleSearchRequest, type Source, type SpeechFormat, type SpeechRequest, type Subscription, type SystemMessage, type Terms, type ThreatEvent, type ThreatEventType, ThreatWindsClient, ThreatWindsError, type TierLimits, type TokenCountRequest, type TokenCountResponse, type ToolCall$1 as ToolCall, type ToolDefinition, type ToolFunctionDefinition, type ToolMessage, type TranscriptionRequest, type TranscriptionResponse, type TransferOwnershipRequest, type Turn, UNFILED, type Usage, type UsageReport, type UserLookupResponse, type UserMessage, type VerificationAttempt, type VerificationSession, type VerificationState, type VerificationStatus, type WarmupOptions, type WarmupProgress, type Watchlist, type WatchlistInput, type WatchlistItem, type WatchlistItemInput, detectIndicatorType, detectIndicatorTypes, retryStreamWarmup, warmupDecision, withWarmup };
