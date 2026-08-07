// src/core/config.ts
var DefaultEndpoint = "https://api.threatwinds.com";
var DefaultTimeout = 3e4;
var DefaultMaxRetries = 3;
var UserAgent = "threatwinds-js-sdk/1.0.0";
var RetryableStatusCodes = [429, 502, 503, 504];
var BackoffBaseMs = 100;
var BackoffMultiplier = 4;

// src/core/errors.ts
var ThreatWindsError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ThreatWindsError";
  }
};
var APIError = class extends ThreatWindsError {
  constructor(statusCode, method, path, rawMessage, errorId = "", retryAfter = "", body = null) {
    super(`${statusCode}: ${method} ${path}: ${rawMessage}`);
    this.statusCode = statusCode;
    this.method = method;
    this.path = path;
    this.rawMessage = rawMessage;
    this.errorId = errorId;
    this.retryAfter = retryAfter;
    this.body = body;
    this.name = "APIError";
  }
  isNotFound() {
    return this.statusCode === 404;
  }
  isUnauthorized() {
    return this.statusCode === 401;
  }
  isForbidden() {
    return this.statusCode === 403;
  }
  isRateLimited() {
    return this.statusCode === 429;
  }
  isValidationError() {
    return this.statusCode === 400;
  }
};
var AuthError = class extends APIError {
  constructor(statusCode, method, path, message, errorId = "") {
    super(statusCode, method, path, message, errorId);
    this.name = "AuthError";
  }
};
var RateLimitError = class extends APIError {
  constructor(retryAfterSeconds, method, path, message = "Rate limit exceeded", errorId = "") {
    super(429, method, path, message, errorId, String(retryAfterSeconds));
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = "RateLimitError";
  }
};
var SDKError = class extends ThreatWindsError {
  constructor(message) {
    super(`client: ${message}`);
    this.name = "SDKError";
  }
};

// src/core/client.ts
function combineSignals(signals) {
  const active = signals.filter((s) => Boolean(s));
  if (active.length === 0) return void 0;
  if (active.length === 1) return active[0];
  const controller = new AbortController();
  const abort = (reason) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  for (const signal of active) {
    if (signal.aborted) {
      abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => abort(signal.reason), { once: true });
  }
  return controller.signal;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function backoff(attempt) {
  return BackoffBaseMs * Math.pow(BackoffMultiplier, attempt);
}
function parseRetryAfter(raw) {
  if (!raw) return 0;
  const seconds = parseInt(raw, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    return seconds * 1e3;
  }
  const date = new Date(raw);
  if (!isNaN(date.getTime())) {
    const until = date.getTime() - Date.now();
    return until > 0 ? until : 0;
  }
  return 0;
}
function isRetryableStatusCode(code) {
  return RetryableStatusCodes.includes(code);
}
function buildUrl(baseUrl, path, queryParams) {
  const url = new URL(`${path.startsWith("/") ? "" : "/"}${path}`, baseUrl);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}
var ThreatWindsClient = class {
  constructor(config = {}) {
    const hasAPIKey = config.apiKey && config.apiSecret;
    const hasBearer = config.bearer;
    if (hasAPIKey && hasBearer) {
      throw new SDKError("conflicting authentication: use apiKey/apiSecret or bearer, not both");
    }
    this.baseUrl = config.baseUrl || DefaultEndpoint;
    this.apiKey = config.apiKey || "";
    this.apiSecret = config.apiSecret || "";
    this.bearer = config.bearer || "";
    this.timeout = config.timeout ?? DefaultTimeout;
    this.maxRetries = config.maxRetries ?? DefaultMaxRetries;
  }
  setBearerToken(token) {
    this.bearer = token;
  }
  async request(method, path, options = {}) {
    const lastError = [];
    const maxAttempts = method === "GET" ? this.maxRetries + 1 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let error = null;
      try {
        const result = await this.requestOnce(method, path, options);
        return result;
      } catch (err) {
        if (err instanceof APIError) {
          error = err;
          lastError.push(err);
        } else {
          throw err;
        }
      }
      if (method !== "GET" || !isRetryableStatusCode(error.statusCode)) {
        throw error;
      }
      if (attempt + 1 < maxAttempts) {
        const retryAfter = parseRetryAfter(error.retryAfter);
        const delay = retryAfter > 0 ? retryAfter : backoff(attempt);
        await sleep(delay);
      }
    }
    throw lastError[lastError.length - 1];
  }
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
  async rawRequest(method, path, options = {}) {
    const url = buildUrl(this.baseUrl, path, options.queryParams);
    const headers = {
      "User-Agent": UserAgent,
      Accept: options.accept ?? "application/json",
      ...options.headers
    };
    if (options.body !== void 0 && options.rawBody === void 0) {
      headers["Content-Type"] = "application/json";
    }
    this.applyAuth(headers);
    const response = await fetch(url, {
      method,
      headers,
      body: options.rawBody !== void 0 ? options.rawBody : options.body !== void 0 ? JSON.stringify(options.body) : void 0,
      signal: combineSignals([
        AbortSignal.timeout(options.timeout ?? this.timeout),
        options.signal
      ])
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.arrayBuffer()
    };
  }
  async requestOnce(method, path, options = {}) {
    const url = buildUrl(this.baseUrl, path, options.queryParams);
    const headers = {
      "User-Agent": UserAgent,
      "Accept": "application/json",
      ...options.headers
    };
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }
    this.applyAuth(headers);
    const init = {
      method,
      headers,
      signal: combineSignals([
        AbortSignal.timeout(options.timeout ?? this.timeout),
        options.signal
      ])
    };
    if (options.body) {
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(url, init);
    const respBody = await response.text();
    if (response.status >= 400) {
      const message = response.headers.get("X-Error") || respBody || "";
      const errorId = response.headers.get("X-Error-Id") || "";
      const retryAfter = response.headers.get("Retry-After") || "";
      try {
        const parsed = JSON.parse(respBody);
        return this.createError(response.status, method, path, message, errorId, retryAfter, parsed);
      } catch {
        return this.createError(response.status, method, path, message, errorId, retryAfter, respBody);
      }
    }
    if (response.status === 204) {
      return null;
    }
    try {
      return JSON.parse(respBody);
    } catch {
      return respBody;
    }
  }
  /**
   * Issues a request and yields decoded server-sent events as they arrive.
   * Never retried: a partially consumed stream cannot be replayed safely.
   *
   * Yields the raw `data:` payload of each event, with the terminal `[DONE]`
   * sentinel already filtered out.
   */
  async *stream(method, path, options = {}) {
    const url = buildUrl(this.baseUrl, path, options.queryParams);
    const headers = {
      "User-Agent": UserAgent,
      "Accept": "text/event-stream",
      ...options.headers
    };
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }
    this.applyAuth(headers);
    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : void 0,
      // Streams are long-lived; the per-request timeout is opt-in here rather
      // than inheriting the short default.
      signal: combineSignals([
        options.timeout ? AbortSignal.timeout(options.timeout) : void 0,
        options.signal
      ])
    });
    if (response.status >= 400) {
      const respBody = await response.text();
      const message = response.headers.get("X-Error") || respBody || "";
      const errorId = response.headers.get("X-Error-Id") || "";
      const retryAfter = response.headers.get("Retry-After") || "";
      try {
        this.createError(response.status, method, path, message, errorId, retryAfter, JSON.parse(respBody));
      } catch (err) {
        if (err instanceof ThreatWindsError) throw err;
        this.createError(response.status, method, path, message, errorId, retryAfter, respBody);
      }
    }
    if (!response.body) {
      throw new SDKError("server returned an empty response stream");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          yield payload;
        }
      }
    } finally {
      reader.releaseLock();
      await response.body.cancel().catch(() => void 0);
    }
  }
  createError(status, method, path, message, errorId, retryAfter, body) {
    if (status === 429) {
      const seconds = parseInt(retryAfter, 10) || 0;
      throw new RateLimitError(seconds, method, path, message, errorId);
    }
    if (status === 401 || status === 403) {
      throw new AuthError(status, method, path, message, errorId);
    }
    throw new APIError(status, method, path, message, errorId, retryAfter, body);
  }
  applyAuth(headers) {
    if (this.apiKey && this.apiSecret) {
      headers["Api-Key"] = this.apiKey;
      headers["Api-Secret"] = this.apiSecret;
    } else if (this.bearer) {
      headers["Authorization"] = `Bearer ${this.bearer}`;
    }
  }
};

// src/search/search-client.ts
var SearchClient = class {
  constructor(client) {
    this.client = client;
  }
  /**
   * Full-text search over entities.
   *
   * Paginate by incrementing `page` while it is `<= result.pages`; the API does
   * not return a cursor.
   */
  async simpleSearch(params, options = {}) {
    const body = {
      query: params.query,
      source: {
        includes: params.source?.includes ?? [],
        excludes: params.source?.excludes ?? []
      }
    };
    const queryParams = { ...options.queryParams };
    if (params.page !== void 0) queryParams.page = String(params.page);
    if (params.limit !== void 0) queryParams.limit = String(params.limit);
    if (params.sort !== void 0) queryParams.sort = params.sort;
    if (params.order !== void 0) queryParams.order = params.order;
    return this.client.request("POST", "/api/search/v1/entities/simple", {
      ...options,
      body,
      queryParams
    });
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
  async lookupEntity(type, value, options = {}) {
    try {
      return await this.client.request("POST", "/api/search/v1/entity", {
        ...options,
        body: { type, value }
      });
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
  async advancedSearch(body, options = {}) {
    return this.client.request("POST", "/api/search/v1/entities/advanced", {
      ...options,
      body
    });
  }
};

// src/analytics/analytics-client.ts
var asRecord = (value) => value && typeof value === "object" ? value : {};
function pick(src, ...keys) {
  for (const key of keys) {
    const value = src[key];
    if (value !== void 0 && value !== null) return value;
  }
  return void 0;
}
function pickNumber(src, ...keys) {
  const value = pick(src, ...keys);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function pickString(src, ...keys) {
  const value = pick(src, ...keys);
  return typeof value === "string" ? value : "";
}
function entityValue(raw) {
  const direct = pickString(raw, "value");
  if (direct) return direct;
  const type = pickString(raw, "type");
  const attributes = asRecord(raw.attributes);
  const byType = attributes[type];
  if (typeof byType === "string") return byType;
  const first = Object.values(attributes).find((v) => typeof v === "string");
  return typeof first === "string" ? first : "";
}
function toAttributes(raw) {
  return {
    id: pickString(raw, "id"),
    type: pickString(raw, "type"),
    value: entityValue(raw),
    description: pickString(raw, "description"),
    reputationScore: pickNumber(raw, "reputationScore", "reputation_score"),
    reputation: pickString(raw, "reputation"),
    accuracyScore: pickNumber(raw, "accuracyScore", "accuracy_score"),
    accuracy: pickString(raw, "accuracy"),
    worstReputationScore: pickNumber(raw, "worstReputationScore", "worst_reputation_score"),
    worstReputation: pickString(raw, "worstReputation", "worst_reputation"),
    bestReputationScore: pickNumber(raw, "bestReputationScore", "best_reputation_score"),
    bestReputation: pickString(raw, "bestReputation", "best_reputation")
  };
}
function toAssociations(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((entry) => {
    const a = asRecord(entry);
    return {
      id: pickString(a, "id"),
      type: pickString(a, "type"),
      value: entityValue(a),
      // `reputation` is a human label ("Indefinable"); the numeric signal
      // consumers colour-code by lives in `reputation_score`.
      reputation: pickNumber(a, "reputationScore", "reputation_score")
    };
  });
}
function toGeolocations(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const locations = raw.map((entry) => {
    const g = asRecord(entry);
    return {
      latitude: pickNumber(g, "latitude") ?? 0,
      longitude: pickNumber(g, "longitude") ?? 0,
      radius: pickNumber(g, "radius", "accuracy_radius") ?? 0,
      // The API labels the network a location belongs to as `object`.
      ip: pick(g, "ip", "object") ?? null
    };
  }).filter((g) => g.latitude !== 0 || g.longitude !== 0);
  return locations.length > 0 ? locations : null;
}
function toMetadata(raw) {
  if (Array.isArray(raw)) return null;
  const record = asRecord(raw);
  return Object.keys(record).length > 0 ? record : null;
}
function toExtendedMetadata(raw) {
  if (Array.isArray(raw)) return null;
  const record = asRecord(raw);
  return Object.keys(record).length > 0 ? record : null;
}
function toStringArray(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}
function toBuckets(value) {
  if (!Array.isArray(value)) return [];
  return value.map((b) => {
    const bucket = asRecord(b);
    return { key: pickString(bucket, "key"), count: pickNumber(bucket, "count") ?? 0 };
  }).filter((b) => b.key !== "");
}
function toTimeBuckets(value) {
  if (!Array.isArray(value)) return [];
  return value.map((b) => {
    const bucket = asRecord(b);
    return {
      timestamp: pickString(bucket, "timestamp"),
      count: pickNumber(bucket, "count") ?? 0
    };
  }).filter((b) => b.timestamp !== "");
}
function toThreatEvent(value) {
  const raw = asRecord(value);
  const type = pickString(raw, "type");
  return {
    type: type === "entity.created" || type === "entity.malicious" || type === "entity.linked" ? type : "entity.created",
    time: pickString(raw, "time"),
    entityId: pickString(raw, "entityId", "entity_id"),
    entityType: pickString(raw, "entityType", "entity_type"),
    value: pickString(raw, "value"),
    reputation: pickNumber(raw, "reputation") ?? 0,
    tags: toStringArray(raw.tags),
    toEntityId: pickString(raw, "toEntityId", "to_entity_id"),
    mode: pickString(raw, "mode")
  };
}
var AnalyticsClient = class {
  constructor(client) {
    this.client = client;
  }
  /**
   * Full dossier for an entity.
   *
   * The endpoint returns snake_case at the top level (`latest_associations`,
   * `extended_metadata`) and geolocations keyed `accuracy_radius`/`object`, so
   * the whole payload is normalized — not just `attributes`.
   */
  async getEntityDetails(id, options = {}) {
    const raw = asRecord(
      await this.client.request(
        "GET",
        `/api/analytics/v1/entity/${encodeURIComponent(id)}/details`,
        options
      )
    );
    return {
      attributes: toAttributes(asRecord(raw.attributes)),
      metadata: toMetadata(raw.metadata),
      extendedMetadata: toExtendedMetadata(pick(raw, "extendedMetadata", "extended_metadata")),
      geolocations: toGeolocations(raw.geolocations),
      latestAssociations: toAssociations(pick(raw, "latestAssociations", "latest_associations"))
    };
  }
  /**
   * Relationship graph around an entity.
   *
   * The API returns the edge list under `relations`; earlier versions of this
   * method read `edges`, which does not exist in the response and so always
   * produced an empty graph. Both spellings are accepted now.
   */
  async getEntityRelations(id, depth = 2, options = {}) {
    const raw = asRecord(
      await this.client.request(
        "GET",
        `/api/analytics/v1/entity/${encodeURIComponent(id)}/relations`,
        { ...options, queryParams: { ...options.queryParams, depth: String(depth) } }
      )
    );
    const data = asRecord(raw.data ?? raw);
    const rawEdges = Array.isArray(data.relations) ? data.relations : Array.isArray(data.edges) ? data.edges : [];
    const nodes = (Array.isArray(data.nodes) ? data.nodes : []).map((n) => {
      const node = asRecord(n);
      return {
        id: pickString(node, "id", "entityId"),
        type: pickString(node, "type", "entity_type") || "unknown",
        value: entityValue(node),
        reputation: pickNumber(node, "reputation", "reputation_score")
      };
    });
    const edges = rawEdges.map((e) => {
      const edge = asRecord(e);
      return {
        source: pickString(edge, "source"),
        target: pickString(edge, "target"),
        type: pickString(edge, "type", "edge_type")
      };
    }).filter((e) => e.source && e.target);
    return { nodes, edges, depth: pickNumber(data, "depth") ?? depth };
  }
  /**
   * Situational overview of the corpus the caller can see.
   *
   * Counts are computed server-side over group-filtered data, so two callers
   * with different group membership legitimately see different totals.
   */
  async getOverview(days = 30, options = {}) {
    const raw = asRecord(
      await this.client.request("GET", "/api/analytics/v1/overview", {
        ...options,
        queryParams: { ...options.queryParams, days: String(days) }
      })
    );
    const window = asRecord(raw.window);
    return {
      totalEntities: pickNumber(raw, "total_entities", "totalEntities") ?? 0,
      maliciousCount: pickNumber(raw, "malicious_count", "maliciousCount") ?? 0,
      maliciousShare: pickNumber(raw, "malicious_share", "maliciousShare") ?? 0,
      trackedTypes: pickNumber(raw, "tracked_types", "trackedTypes") ?? 0,
      byType: toBuckets(pick(raw, "by_type", "byType")),
      byReputation: toBuckets(pick(raw, "by_reputation", "byReputation")),
      byAccuracy: toBuckets(pick(raw, "by_accuracy", "byAccuracy")),
      topTags: toBuckets(pick(raw, "top_tags", "topTags")),
      timeline: toTimeBuckets(raw.timeline),
      windowDays: pickNumber(window, "days") ?? days
    };
  }
  /** Recently observed entities; malicious-only by default. */
  async getRecent({ hours = 24, limit = 50, maliciousOnly = true } = {}, options = {}) {
    const raw = asRecord(
      await this.client.request("GET", "/api/analytics/v1/recent", {
        ...options,
        queryParams: {
          ...options.queryParams,
          hours: String(hours),
          limit: String(limit),
          malicious_only: String(maliciousOnly)
        }
      })
    );
    const window = asRecord(raw.window);
    const items = (Array.isArray(raw.items) ? raw.items : []).map((i) => {
      const item = asRecord(i);
      return {
        id: pickString(item, "id"),
        type: pickString(item, "type"),
        value: entityValue(item),
        reputation: pickNumber(item, "reputation") ?? 0,
        reputationLabel: pickString(item, "reputation_label", "reputationLabel"),
        accuracy: pickNumber(item, "accuracy") ?? 0,
        accuracyLabel: pickString(item, "accuracy_label", "accuracyLabel"),
        tags: toStringArray(item.tags),
        firstSeen: pickString(item, "first_seen", "firstSeen"),
        lastSeen: pickString(item, "last_seen", "lastSeen")
      };
    });
    return {
      items,
      windowHours: pickNumber(window, "hours") ?? hours,
      since: pickString(window, "since")
    };
  }
  /** Threat volume grouped by country, ASN and ASO. */
  async getAttribution({ size = 20, maliciousOnly = true } = {}, options = {}) {
    const raw = asRecord(
      await this.client.request("GET", "/api/analytics/v1/attribution", {
        ...options,
        queryParams: {
          ...options.queryParams,
          size: String(size),
          malicious_only: String(maliciousOnly)
        }
      })
    );
    return {
      byCountry: toBuckets(pick(raw, "by_country", "byCountry")),
      byAsn: toBuckets(pick(raw, "by_asn", "byAsn")),
      byAso: toBuckets(pick(raw, "by_aso", "byAso")),
      maliciousOnly: raw.malicious_only === true || raw.maliciousOnly === true
    };
  }
  /**
   * Mints a single-use ticket for the live feed.
   *
   * Exposed mainly for callers driving their own socket; subscribeLive does
   * this for you.
   */
  async mintLiveTicket(options = {}) {
    const raw = asRecord(
      await this.client.request("GET", "/api/analytics/v1/live/ticket", options)
    );
    return pickString(raw, "ticket");
  }
  /**
   * Subscribes to the live threat feed.
   *
   * A browser cannot set an Authorization header on a WebSocket handshake, so
   * the connection is authorised by a short-lived single-use ticket fetched
   * over ordinary authenticated HTTP. Because a ticket is consumed on use,
   * every reconnect mints a fresh one.
   */
  subscribeLive(options) {
    const { onEvent, onError, onClose, onOpen, reconnect = true } = options;
    let socket = null;
    let stopped = false;
    let attempt = 0;
    let retryTimer = null;
    const subscription = {
      close() {
        stopped = true;
        if (retryTimer !== null) clearTimeout(retryTimer);
        retryTimer = null;
        socket?.close();
        socket = null;
      },
      get connected() {
        return socket?.readyState === 1;
      }
    };
    const scheduleRetry = () => {
      if (stopped || !reconnect) return;
      const delay = Math.min(3e4, 1e3 * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(() => void connect(), delay);
    };
    const connect = async () => {
      if (stopped) return;
      try {
        const ticket = await this.mintLiveTicket();
        if (!ticket) throw new Error("live feed ticket was empty");
        if (stopped) return;
        const url = new URL("/api/analytics/v1/live", this.client.baseUrl);
        url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
        url.searchParams.set("ticket", ticket);
        const ws = new WebSocket(url.toString());
        socket = ws;
        ws.onopen = () => {
          attempt = 0;
          onOpen?.();
        };
        ws.onmessage = (message) => {
          if (typeof message.data !== "string") return;
          try {
            onEvent(toThreatEvent(JSON.parse(message.data)));
          } catch (err) {
            onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        };
        ws.onerror = () => onError?.(new Error("live feed connection error"));
        ws.onclose = () => {
          socket = null;
          onClose?.();
          scheduleRetry();
        };
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        scheduleRetry();
      }
    };
    void connect();
    return subscription;
  }
};

// src/ai/warmup.ts
var DEFAULT_WARMUP_BUDGET_SECONDS = 300;
var NO_BACKENDS_GRACE_SECONDS = 15;
function warmupDecision(status, headers) {
  if (status !== 503) return { retry: false, waitSeconds: 0, advertised: false };
  const raw = headers?.get("Retry-After");
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return { retry: true, waitSeconds: parsed, advertised: true };
  }
  return { retry: true, waitSeconds: NO_BACKENDS_GRACE_SECONDS, advertised: false };
}
function sleep2(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
async function withWarmup(attempt, options = {}) {
  const budget = (options.budgetSeconds ?? DEFAULT_WARMUP_BUDGET_SECONDS) * 1e3;
  const started = Date.now();
  let tries = 0;
  for (; ; ) {
    const outcome = await attempt();
    const decision = warmupDecision(outcome.status, outcome.headers);
    if (!decision.retry) return outcome;
    const elapsed = Date.now() - started;
    const wait = decision.waitSeconds * 1e3;
    if (elapsed + wait > budget) return outcome;
    tries += 1;
    options.onWarming?.({
      attempt: tries,
      waitSeconds: decision.waitSeconds,
      elapsedSeconds: Math.round(elapsed / 1e3),
      advertised: decision.advertised
    });
    await sleep2(wait, options.signal);
  }
}
async function retryStreamWarmup(attempt, options = {}) {
  const budget = (options.budgetSeconds ?? DEFAULT_WARMUP_BUDGET_SECONDS) * 1e3;
  const started = Date.now();
  let tries = 0;
  for (; ; ) {
    try {
      return await attempt();
    } catch (err) {
      const status = err?.statusCode;
      if (status !== 503) throw err;
      const header = err?.retryAfter ?? "";
      const parsed = Number.parseInt(header, 10);
      const waitSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : NO_BACKENDS_GRACE_SECONDS;
      const elapsed = Date.now() - started;
      if (elapsed + waitSeconds * 1e3 > budget) throw err;
      tries += 1;
      options.onWarming?.({
        attempt: tries,
        waitSeconds,
        elapsedSeconds: Math.round(elapsed / 1e3),
        advertised: Number.isFinite(parsed) && parsed > 0
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, waitSeconds * 1e3);
        options.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      });
    }
  }
}

// src/ai/ai-client.ts
var BASE = "/api/ai/v1";
var DEFAULT_TRANSCRIPTION_MODEL = "whisper-large-v3";
var DEFAULT_SPEECH_MODEL = "kokoro-82m";
var DEFAULT_VOICE = "af_heart";
var AUDIO_TIMEOUT_MS = 12e4;
var STREAM_TIMEOUT_MS = 3e5;
var AiClient = class {
  constructor(client) {
    this.client = client;
  }
  /**
   * Full model catalogue, including transcription and embedding models. Use
   * `listChatModels` when you intend to call chat completions.
   */
  async listModels(signal) {
    const raw = await this.client.request("GET", `${BASE}/models`, { signal });
    return (raw?.data ?? []).filter((m) => typeof m?.id === "string").map((m) => {
      const limits = m.limits ?? {};
      return {
        id: m.id,
        object: typeof m.object === "string" ? m.object : void 0,
        name: typeof m.name === "string" ? m.name : void 0,
        provider: typeof m.provider === "string" ? m.provider : void 0,
        ownedBy: typeof m.owned_by === "string" ? m.owned_by : void 0,
        capabilities: Array.isArray(m.capabilities) ? m.capabilities.filter((c) => typeof c === "string") : [],
        limits: {
          maxInputTokens: typeof limits.max_input_tokens === "number" ? limits.max_input_tokens : void 0,
          maxTotalTokens: typeof limits.max_total_tokens === "number" ? limits.max_total_tokens : void 0
        },
        params: m.params ?? void 0
      };
    });
  }
  /**
   * Models that accept chat completions. Pass `requireTools` when the caller
   * runs an agent loop — a model without `tools-use` will simply ignore the
   * tool definitions and answer from memory instead of querying the API.
   */
  async listChatModels(opts = {}) {
    const models = await this.listModels(opts.signal);
    return models.filter(
      (m) => m.capabilities.includes("chat") && (!opts.requireTools || m.capabilities.includes("tools-use"))
    );
  }
  /** Non-streaming completion. Prefer `streamChatCompletion` for interactive UI. */
  async chatCompletion(req, signal, warmup = {}) {
    return this.warmJson(
      "POST",
      `${BASE}/chat/completions`,
      { ...req, stream: false },
      { signal, timeout: STREAM_TIMEOUT_MS, ...warmup }
    );
  }
  /**
   * Streams a completion, invoking `onDelta` with each text fragment.
   *
   * Tool calls arrive fragmented across chunks — keyed by index, with the
   * arguments JSON split arbitrarily — so they are reassembled here and only
   * returned once complete. That matters for agent loops, which cannot execute
   * a tool until its arguments parse.
   */
  async streamChatCompletion(req, onDelta, signal, warmup = {}) {
    return retryStreamWarmup(
      () => this.streamOnce(req, onDelta, signal),
      { signal, ...warmup }
    );
  }
  async streamOnce(req, onDelta, signal) {
    let content = "";
    let finishReason = "";
    let usage;
    const partial = /* @__PURE__ */ new Map();
    const events = this.client.stream("POST", `${BASE}/chat/completions`, {
      body: { ...req, stream: true, stream_options: { include_usage: true } },
      signal,
      timeout: STREAM_TIMEOUT_MS
    });
    for await (const payload of events) {
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed.usage) usage = parsed.usage;
      const choice = parsed.choices?.[0];
      if (!choice) continue;
      if (typeof choice.finish_reason === "string") finishReason = choice.finish_reason;
      const delta = choice.delta;
      if (!delta) continue;
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        onDelta?.(delta.content);
      }
      for (const fragment of delta.tool_calls ?? []) {
        const index = typeof fragment.index === "number" ? fragment.index : 0;
        const call = partial.get(index) ?? { id: "", type: "function", function: { name: "", arguments: "" } };
        if (fragment.id) call.id = fragment.id;
        if (fragment.function?.name) call.function.name = fragment.function.name;
        if (typeof fragment.function?.arguments === "string") {
          call.function.arguments += fragment.function.arguments;
        }
        partial.set(index, call);
      }
    }
    const toolCalls = [...partial.entries()].sort(([a], [b]) => a - b).map(([index, call]) => ({ ...call, id: call.id || `call_${index}` })).filter((call) => call.function.name);
    return {
      content,
      toolCalls,
      finishReason: finishReason || (toolCalls.length > 0 ? "tool_calls" : "stop"),
      usage
    };
  }
  async countTokens(req, signal, warmup = {}) {
    const raw = await this.warmJson(
      "POST",
      `${BASE}/chat/count`,
      req,
      { signal, ...warmup }
    );
    const tokens = raw?.tokens ?? raw?.count;
    if (typeof tokens !== "number") {
      throw new SDKError("token count endpoint returned no usable count");
    }
    return { tokens };
  }
  async embeddings(req, signal, warmup = {}) {
    return this.warmJson("POST", `${BASE}/embeddings`, req, {
      signal,
      ...warmup
    });
  }
  /**
   * Issues a JSON request through the warm-up policy and decodes the result.
   *
   * Every generation endpoint on this client goes through here. The pods scale
   * to zero, so any of them can answer a cold request with a 503 that means
   * "wait, I am booting" rather than "this failed" — handling that in one place
   * keeps it from being forgotten on whichever method is added next.
   */
  async warmJson(method, path, body, opts = {}) {
    const outcome = await withWarmup(
      () => this.client.rawRequest(method, path, {
        body,
        signal: opts.signal,
        timeout: opts.timeout
      }),
      opts
    );
    const text = new TextDecoder().decode(outcome.body);
    if (outcome.status >= 400) {
      throw new SDKError(
        `${outcome.status} ${method} ${path}: ${text.slice(0, 300) || "request failed"}`
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new SDKError(`${method} ${path}: response was not JSON`);
    }
  }
  /**
   * Transcribes recorded audio.
   *
   * `prompt` biases the decoder. Passing the vocabulary you expect — a wake
   * word, indicator types — measurably improves recognition of terms a general
   * model has no reason to favour.
   */
  async transcribe(req, opts = {}) {
    const form = new FormData();
    form.append("file", req.audio, req.filename ?? "audio.webm");
    form.append("model", req.model ?? DEFAULT_TRANSCRIPTION_MODEL);
    if (req.language) form.append("language", req.language);
    if (req.prompt) form.append("prompt", req.prompt);
    const outcome = await withWarmup(
      () => this.client.rawRequest("POST", `${BASE}/audio/transcriptions`, {
        rawBody: form,
        signal: opts.signal,
        timeout: AUDIO_TIMEOUT_MS
      }),
      opts
    );
    const text = new TextDecoder().decode(outcome.body);
    if (outcome.status >= 400) {
      throw new SDKError(`transcription failed (${outcome.status}): ${text.slice(0, 300)}`);
    }
    try {
      const parsed = JSON.parse(text);
      return { text: typeof parsed.text === "string" ? parsed.text : "" };
    } catch {
      return { text };
    }
  }
  /** Synthesises speech, returning the encoded audio. */
  async speak(req, opts = {}) {
    const format = req.responseFormat ?? "mp3";
    const outcome = await withWarmup(
      () => this.client.rawRequest("POST", `${BASE}/audio/speech`, {
        body: {
          model: req.model ?? DEFAULT_SPEECH_MODEL,
          input: req.input,
          voice: req.voice ?? DEFAULT_VOICE,
          response_format: format,
          speed: req.speed ?? 1
        },
        accept: "audio/*",
        signal: opts.signal,
        timeout: AUDIO_TIMEOUT_MS
      }),
      opts
    );
    if (outcome.status >= 400) {
      const text = new TextDecoder().decode(outcome.body);
      throw new SDKError(`speech failed (${outcome.status}): ${text.slice(0, 300)}`);
    }
    return {
      audio: outcome.body,
      contentType: outcome.headers.get("Content-Type") ?? `audio/${format}`
    };
  }
};

// src/billing/billing-client.ts
var BASE2 = "/api/billing/v1";
var BillingClient = class {
  constructor(client) {
    this.client = client;
  }
  /** Returns `null` when the caller has no customer record yet. */
  async getCustomer(options = {}) {
    try {
      return await this.client.request("GET", `${BASE2}/customer`, options);
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 404) return null;
      throw err;
    }
  }
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
  async createCustomer(request, options = {}) {
    return this.client.request("POST", `${BASE2}/customer`, {
      ...options,
      body: request
    });
  }
  /** Limit definitions for every service on the caller's tier. */
  async getLimits(options = {}) {
    return this.client.request("GET", `${BASE2}/limits`, options);
  }
  /** Limit definitions for one service, e.g. `ai-api`. */
  async getServiceLimits(serviceName, options = {}) {
    return this.client.request(
      "GET",
      `${BASE2}/limits/${encodeURIComponent(serviceName)}`,
      options
    );
  }
  /** Live consumption for the authenticated user. */
  async getUsage(options = {}) {
    return this.client.request("GET", `${BASE2}/limits/usage`, options);
  }
  /** Live consumption attributed to the caller's IP, for anonymous access. */
  async getIpUsage(options = {}) {
    return this.client.request("GET", `${BASE2}/limits/usage/ip`, options);
  }
  /** Stateful resource caps, e.g. concurrent compute instances. */
  async getQuotas(options = {}) {
    return this.client.request("GET", `${BASE2}/quotas/usage`, options);
  }
  async addMember(request, options = {}) {
    return this.client.request("POST", `${BASE2}/customer/member`, {
      ...options,
      body: request
    });
  }
  async transferOwnership(request, options = {}) {
    return this.client.request("POST", `${BASE2}/customer/transfer-ownership`, {
      ...options,
      body: request
    });
  }
};

// src/auth/auth-client.ts
var BASE3 = "/api/auth/v2";
var AuthClient = class {
  constructor(client) {
    this.client = client;
  }
  /**
   * Starts an email login. Emails a one-time code and returns a bearer that
   * only becomes usable once `verifySession` succeeds.
   */
  async createSession(email, opts = {}) {
    const { kind = "standard", ...options } = opts;
    return this.client.request("POST", `${BASE3}/session`, {
      ...options,
      body: { email, kind }
    });
  }
  /**
   * Registers a new user. Throws a 403 APIError when self-registration is
   * disabled server-side.
   */
  async signUp(request, options = {}) {
    return this.client.request("POST", `${BASE3}/user`, {
      ...options,
      body: request
    });
  }
  /** Completes login or signup with the emailed code. */
  async verifySession(request, options = {}) {
    return this.client.request("PUT", `${BASE3}/session/verification`, {
      ...options,
      body: request
    });
  }
  /**
   * Details of the session behind the current bearer token. Returns `null` for
   * an absent, expired or rejected token, so callers can treat "signed out" as
   * an ordinary state rather than an error.
   */
  async getSession(options = {}) {
    try {
      return await this.client.request("GET", `${BASE3}/session`, options);
    } catch (err) {
      if (err instanceof APIError && (err.statusCode === 401 || err.statusCode === 403)) {
        return null;
      }
      throw err;
    }
  }
  async extendSession(options = {}) {
    return this.client.request("PUT", `${BASE3}/session/extend`, options);
  }
  async closeSession(sessionID, options = {}) {
    return this.client.request(
      "DELETE",
      `${BASE3}/session/${encodeURIComponent(sessionID)}`,
      options
    );
  }
  async listSessions(options = {}) {
    const raw = await this.client.request("GET", `${BASE3}/sessions`, options);
    return raw?.sessions ?? [];
  }
  /**
   * Creates a long-lived API key pair for programmatic access. `apiSecret` is
   * returned only here and cannot be recovered later.
   */
  async createKeyPair(request, options = {}) {
    return this.client.request("POST", `${BASE3}/keypair`, {
      ...options,
      body: request
    });
  }
  /** Returns full unredacted API keys — treat the result as a secret. */
  async listKeyPairs(options = {}) {
    const raw = await this.client.request("GET", `${BASE3}/keypairs`, options);
    return raw?.keys ?? [];
  }
  async deleteKeyPair(keyID, options = {}) {
    return this.client.request(
      "DELETE",
      `${BASE3}/keypair/${encodeURIComponent(keyID)}`,
      options
    );
  }
  async findUserByEmail(email, options = {}) {
    try {
      const raw = await this.client.request("GET", `${BASE3}/user/by-email`, {
        ...options,
        queryParams: { ...options.queryParams, email }
      });
      return raw?.userID ?? null;
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 404) return null;
      throw err;
    }
  }
  /**
   * Current identity-verification (KYC) state, including how many attempts
   * remain. Safe to poll.
   */
  async getVerificationStatus(options = {}) {
    return this.client.request(
      "GET",
      `${BASE3}/verify/status`,
      options
    );
  }
  /**
   * Starts identity verification and returns the provider URL the user must
   * visit to submit a document and selfie.
   *
   * Not idempotent in spirit — it consumes an attempt — so check
   * `getVerificationStatus` first and avoid calling it for an already-passed or
   * attempt-exhausted account.
   */
  async initiateVerification(options = {}) {
    return this.client.request("POST", `${BASE3}/verify`, options);
  }
  setBearerToken(token) {
    this.client.setBearerToken(token);
  }
};

// src/feeds/feeds-client.ts
var FEEDS_BASE_URL = "https://apis.threatwinds.com";
var feedsClientInstance = /* @__PURE__ */ new WeakMap();
function getFeedsApiClient(client) {
  let apiClient = feedsClientInstance.get(client);
  if (!apiClient) {
    apiClient = new ThreatWindsClient({
      baseUrl: FEEDS_BASE_URL,
      bearer: client.bearer || "public",
      timeout: client.timeout,
      maxRetries: client.maxRetries
    });
    feedsClientInstance.set(client, apiClient);
  }
  return apiClient;
}
var FeedsClient = class {
  constructor(client) {
    this.client = client;
    this.apiClient = getFeedsApiClient(client);
  }
  async listFeeds(_options) {
    const raw = await this.apiClient.request("GET", "/api/feeds/v1/list");
    const feeds = (Array.isArray(raw) ? raw : []).map((item, i) => ({
      id: `${item.name}-${item.accuracy}-${item.type}`,
      name: item.name || `feed-${i}`,
      description: `Threat intelligence feed for ${item.name || "unknown"} indicators (${item.type || "accumulative"}, ${item.accuracy || "level1"})`,
      type: item.type || "accumulative",
      format: "TXT",
      updatedAt: ""
    }));
    return { feeds, pages: 1, next: null };
  }
  async getFeed(id) {
    const raw = await this.apiClient.request("GET", `/api/feeds/v1/list`);
    const list = Array.isArray(raw) ? raw : [];
    id.split("-");
    const item = list.find((f) => `${f.name}-${f.accuracy}-${f.type}` === id);
    return {
      id,
      name: item?.name || id,
      description: "",
      type: item?.type || "",
      format: "TXT",
      updatedAt: ""
    };
  }
  async subscribeToFeed(_id) {
    return { id: "", feedId: _id, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
  }
  async unsubscribeFromFeed(_id) {
    return;
  }
};

// src/ingest/ingest-client.ts
var BASE4 = "/api/ingest/v1";
var IngestClient = class {
  constructor(client) {
    this.client = client;
  }
  /**
   * Reports a new entity, optionally with nested associations.
   *
   * The indicator's value belongs in `attributes` under a key matching `type`.
   * Requires a KYC-verified account.
   */
  async submitEntity(entity, options = {}) {
    return this.client.request("POST", `${BASE4}/entity`, {
      ...options,
      body: entity
    });
  }
  /** Links two existing entities. Both must share at least one security group. */
  async submitAssociation(request, options = {}) {
    return this.client.request("POST", `${BASE4}/association`, {
      ...options,
      body: request
    });
  }
  /** Reports a well-known (trusted) entity. Requires the `trusted` role. */
  async submitWellKnown(entity, options = {}) {
    return this.client.request("POST", `${BASE4}/well-known`, {
      ...options,
      body: entity
    });
  }
  /**
   * Schema for every supported entity type — the authoritative list of valid
   * `type` values and the attributes each accepts.
   */
  async getDefinitions(options = {}) {
    const raw = await this.client.request("GET", `${BASE4}/definitions`, options);
    return Array.isArray(raw) ? raw : [];
  }
  async createComment(request, options = {}) {
    return this.client.request("POST", `${BASE4}/comment`, {
      ...options,
      body: {
        entityId: request.entityId,
        content: request.content,
        parentId: request.parentId ?? null
      }
    });
  }
  /** Schedules a scan of an IP or hostname. Requires the `user` role. */
  async createScan(request, options = {}) {
    return this.client.request("POST", `${BASE4}/scan`, {
      ...options,
      body: { target: request.target, type: request.type }
    });
  }
  async getScanStatus(taskId, options = {}) {
    return this.client.request(
      "GET",
      `${BASE4}/scan/${encodeURIComponent(taskId)}`,
      options
    );
  }
};

// src/casework/casework-client.ts
var BASE5 = "/api/casework/v1";
var NIL_UUID = "00000000-0000-0000-0000-000000000000";
var asRecord2 = (value) => value && typeof value === "object" ? value : {};
var asArray = (value) => Array.isArray(value) ? value : [];
function str(src, ...keys) {
  for (const key of keys) {
    const v = src[key];
    if (typeof v === "string") return v;
  }
  return "";
}
function num(src, ...keys) {
  for (const key of keys) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}
function toNote(raw) {
  const n = asRecord2(raw);
  return {
    id: str(n, "id"),
    caseId: str(n, "case_id", "caseId"),
    body: str(n, "body"),
    createdAt: str(n, "created_at", "createdAt")
  };
}
function toEntity(raw) {
  const e = asRecord2(raw);
  return {
    id: str(e, "id"),
    caseId: str(e, "case_id", "caseId"),
    entityId: str(e, "entity_id", "entityId"),
    entityType: str(e, "entity_type", "entityType"),
    entityValue: str(e, "entity_value", "entityValue"),
    note: str(e, "note"),
    createdAt: str(e, "created_at", "createdAt")
  };
}
function toCase(raw) {
  const c = asRecord2(raw);
  const status = str(c, "status");
  return {
    id: str(c, "id"),
    title: str(c, "title"),
    summary: str(c, "summary"),
    status: status === "open" || status === "in_progress" || status === "closed" ? status : "open",
    severity: Math.min(4, Math.max(0, num(c, "severity"))),
    createdAt: str(c, "created_at", "createdAt"),
    updatedAt: str(c, "updated_at", "updatedAt"),
    // Absent on list responses; only the detail endpoint preloads children.
    notes: asArray(c.notes).map(toNote),
    entities: asArray(c.entities).map(toEntity)
  };
}
function toItem(raw) {
  const i = asRecord2(raw);
  const kind = str(i, "kind");
  const maxRep = i.max_reputation ?? i.maxReputation;
  return {
    id: str(i, "id"),
    watchlistId: str(i, "watchlist_id", "watchlistId"),
    kind: kind === "entity" || kind === "value" || kind === "tag" || kind === "type" ? kind : "value",
    value: str(i, "value"),
    maxReputation: typeof maxRep === "number" ? maxRep : void 0,
    createdAt: str(i, "created_at", "createdAt")
  };
}
function toWatchlist(raw) {
  const w = asRecord2(raw);
  return {
    id: str(w, "id"),
    name: str(w, "name"),
    description: str(w, "description"),
    enabled: w.enabled !== false,
    createdAt: str(w, "created_at", "createdAt"),
    updatedAt: str(w, "updated_at", "updatedAt"),
    items: asArray(w.items).map(toItem)
  };
}
function toAlert(raw) {
  const a = asRecord2(raw);
  const kind = str(a, "matchedKind", "matched_kind");
  return {
    id: str(a, "id"),
    createdAt: str(a, "@timestamp", "created_at", "createdAt"),
    watchlistId: str(a, "watchlistID", "watchlist_id", "watchlistId"),
    itemId: str(a, "itemID", "item_id", "itemId"),
    entityId: str(a, "entityID", "entity_id", "entityId"),
    entityType: str(a, "entityType", "entity_type"),
    entityValue: str(a, "entityValue", "entity_value"),
    reputation: num(a, "reputation"),
    matchedKind: kind === "entity" || kind === "value" || kind === "tag" || kind === "type" ? kind : "value",
    matchedOn: str(a, "matchedOn", "matched_on")
  };
}
function toSavedSearch(raw) {
  const s = asRecord2(raw);
  return {
    id: str(s, "id"),
    name: str(s, "name"),
    query: str(s, "query"),
    createdAt: str(s, "created_at", "createdAt")
  };
}
function toConversation(raw) {
  const c = asRecord2(raw);
  return {
    id: str(c, "id"),
    title: str(c, "title"),
    /* Omitted from the response entirely when the thread is unfiled: the server
       field is a nullable pointer tagged `omitempty`, so there is no `null` to
       tell apart from an absent key. Either way it reads as '' here, which is
       the one representation of "unfiled" this SDK exposes. */
    caseId: str(c, "case_id", "caseID", "caseId"),
    messageCount: num(c, "message_count", "messageCount"),
    lastMessageAt: str(c, "last_message_at", "lastMessageAt"),
    createdAt: str(c, "created_at", "createdAt"),
    updatedAt: str(c, "updated_at", "updatedAt")
  };
}
function toolArgs(raw) {
  if (typeof raw === "string") return raw;
  if (raw === void 0 || raw === null) return "";
  try {
    return JSON.stringify(raw) ?? "";
  } catch {
    return "";
  }
}
function toToolCall(raw) {
  const t = asRecord2(raw);
  return {
    name: str(t, "name"),
    args: toolArgs(t.args)
  };
}
function toTurn(raw) {
  const t = asRecord2(raw);
  return {
    id: str(t, "id"),
    conversationId: str(t, "conversationID", "conversation_id", "conversationId"),
    caseId: str(t, "caseID", "case_id", "caseId"),
    userId: str(t, "userID", "user_id", "userId"),
    createdAt: str(t, "@timestamp", "created_at", "createdAt"),
    question: str(t, "question"),
    answer: str(t, "answer"),
    tools: asArray(t.tools).map(toToolCall),
    seq: num(t, "seq")
  };
}
function conversationBody(input, unfilable) {
  const body = {};
  if (input.title !== void 0) body.title = input.title;
  if (input.caseId) {
    body.case_id = input.caseId;
  } else if (unfilable && input.caseId === "") {
    body.case_id = NIL_UUID;
  }
  return body;
}
function caseBody(input) {
  const body = {};
  if (input.title !== void 0) body.title = input.title;
  if (input.summary !== void 0) body.summary = input.summary;
  if (input.status !== void 0) body.status = input.status;
  if (input.severity !== void 0) body.severity = input.severity;
  return body;
}
var CaseworkClient = class {
  constructor(client) {
    this.client = client;
  }
  async listCases(opts = {}, options = {}) {
    const queryParams = { ...options.queryParams };
    if (opts.status) queryParams.status = opts.status;
    if (opts.limit) queryParams.limit = String(opts.limit);
    const raw = await this.client.request("GET", `${BASE5}/cases`, { ...options, queryParams });
    return asArray(raw).map(toCase);
  }
  /** Returns the case with its notes and pinned entities. */
  async getCase(id, options = {}) {
    return toCase(
      await this.client.request("GET", `${BASE5}/cases/${encodeURIComponent(id)}`, options)
    );
  }
  async createCase(input, options = {}) {
    return toCase(
      await this.client.request("POST", `${BASE5}/cases`, { ...options, body: caseBody(input) })
    );
  }
  async updateCase(id, input, options = {}) {
    return toCase(
      await this.client.request("PATCH", `${BASE5}/cases/${encodeURIComponent(id)}`, {
        ...options,
        body: caseBody(input)
      })
    );
  }
  async deleteCase(id, options = {}) {
    await this.client.request("DELETE", `${BASE5}/cases/${encodeURIComponent(id)}`, options);
  }
  async addNote(caseId, body, options = {}) {
    return toNote(
      await this.client.request("POST", `${BASE5}/cases/${encodeURIComponent(caseId)}/notes`, {
        ...options,
        body: { body }
      })
    );
  }
  /** Pinning the same entity twice is a no-op server-side, not an error. */
  async pinEntity(caseId, input, options = {}) {
    return toEntity(
      await this.client.request("POST", `${BASE5}/cases/${encodeURIComponent(caseId)}/entities`, {
        ...options,
        body: {
          entity_id: input.entityId,
          entity_type: input.entityType ?? "",
          entity_value: input.entityValue ?? "",
          note: input.note ?? ""
        }
      })
    );
  }
  async unpinEntity(caseId, entityId, options = {}) {
    await this.client.request(
      "DELETE",
      `${BASE5}/cases/${encodeURIComponent(caseId)}/entities/${encodeURIComponent(entityId)}`,
      options
    );
  }
  async listWatchlists(options = {}) {
    const raw = await this.client.request("GET", `${BASE5}/watchlists`, options);
    return asArray(raw).map(toWatchlist);
  }
  async createWatchlist(input, options = {}) {
    return toWatchlist(
      await this.client.request("POST", `${BASE5}/watchlists`, { ...options, body: input })
    );
  }
  async updateWatchlist(id, input, options = {}) {
    return toWatchlist(
      await this.client.request("PATCH", `${BASE5}/watchlists/${encodeURIComponent(id)}`, {
        ...options,
        body: input
      })
    );
  }
  async deleteWatchlist(id, options = {}) {
    await this.client.request("DELETE", `${BASE5}/watchlists/${encodeURIComponent(id)}`, options);
  }
  async addWatchlistItem(watchlistId, input, options = {}) {
    return toItem(
      await this.client.request(
        "POST",
        `${BASE5}/watchlists/${encodeURIComponent(watchlistId)}/items`,
        {
          ...options,
          body: {
            kind: input.kind,
            value: input.value,
            max_reputation: input.maxReputation
          }
        }
      )
    );
  }
  async deleteWatchlistItem(watchlistId, itemId, options = {}) {
    await this.client.request(
      "DELETE",
      `${BASE5}/watchlists/${encodeURIComponent(watchlistId)}/items/${encodeURIComponent(itemId)}`,
      options
    );
  }
  /**
   * Alerts newest first, with the caller's unread count.
   *
   * Unread is computed server-side from a read watermark, so it stays correct
   * regardless of what this page happens to contain.
   */
  async listAlerts({ limit = 50, unreadOnly = false } = {}, options = {}) {
    const raw = asRecord2(
      await this.client.request("GET", `${BASE5}/alerts`, {
        ...options,
        queryParams: {
          ...options.queryParams,
          limit: String(limit),
          unread: String(unreadOnly)
        }
      })
    );
    return {
      items: asArray(raw.items).map(toAlert),
      unread: num(raw, "unread")
    };
  }
  /** Advances the caller's read watermark to now. */
  async markAlertsRead(options = {}) {
    await this.client.request("POST", `${BASE5}/alerts/read`, options);
  }
  async listSavedSearches(options = {}) {
    const raw = await this.client.request("GET", `${BASE5}/searches`, options);
    return asArray(raw).map(toSavedSearch);
  }
  async createSavedSearch(name, query, options = {}) {
    return toSavedSearch(
      await this.client.request("POST", `${BASE5}/searches`, {
        ...options,
        body: { name, query }
      })
    );
  }
  async deleteSavedSearch(id, options = {}) {
    await this.client.request("DELETE", `${BASE5}/searches/${encodeURIComponent(id)}`, options);
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
  async listConversations(opts = {}, options = {}) {
    const queryParams = { ...options.queryParams };
    if (opts.caseId) queryParams.case_id = opts.caseId;
    if (opts.limit) queryParams.limit = String(opts.limit);
    const raw = await this.client.request("GET", `${BASE5}/conversations`, {
      ...options,
      queryParams
    });
    return asArray(raw).map(toConversation);
  }
  /** One conversation the caller owns. Returns the row only — see `listTurns`. */
  async getConversation(id, options = {}) {
    return toConversation(
      await this.client.request("GET", `${BASE5}/conversations/${encodeURIComponent(id)}`, options)
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
  async createConversation(input, options = {}) {
    return toConversation(
      await this.client.request("POST", `${BASE5}/conversations`, {
        ...options,
        body: conversationBody(input, false)
      })
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
  async updateConversation(id, input, options = {}) {
    return toConversation(
      await this.client.request("PATCH", `${BASE5}/conversations/${encodeURIComponent(id)}`, {
        ...options,
        body: conversationBody(input, true)
      })
    );
  }
  /**
   * Deletes a conversation and every turn in it.
   *
   * This is the one destructive operation on conversations — deleting the *case*
   * a conversation is filed under only detaches it, leaving the thread unfiled
   * and intact.
   */
  async deleteConversation(id, options = {}) {
    await this.client.request("DELETE", `${BASE5}/conversations/${encodeURIComponent(id)}`, options);
  }
  /**
   * A conversation's turns in `seq` order, oldest first.
   *
   * One page holds at most 200 turns; that is a display ceiling, not the model's
   * context window. A conversation with nothing written yet returns an empty
   * array rather than erroring.
   */
  async listTurns(conversationId, opts = {}, options = {}) {
    const queryParams = { ...options.queryParams };
    if (opts.limit) queryParams.limit = String(opts.limit);
    const raw = await this.client.request(
      "GET",
      `${BASE5}/conversations/${encodeURIComponent(conversationId)}/turns`,
      { ...options, queryParams }
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
  async appendTurn(conversationId, input, options = {}) {
    return toTurn(
      await this.client.request(
        "POST",
        `${BASE5}/conversations/${encodeURIComponent(conversationId)}/turns`,
        {
          ...options,
          body: {
            question: input.question,
            answer: input.answer ?? "",
            tools: input.tools ?? []
          }
        }
      )
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
  async searchConversations(query, opts = {}, options = {}) {
    const queryParams = { ...options.queryParams, q: query };
    if (opts.limit) queryParams.limit = String(opts.limit);
    const raw = await this.client.request("GET", `${BASE5}/conversations/search`, {
      ...options,
      queryParams
    });
    return asArray(raw).map(toTurn);
  }
};

// src/search/indicators.ts
var IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
var IPV6 = /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|::|([0-9a-f]{1,4}:){1,7}:|(:[0-9a-f]{1,4}){1,7})$/i;
var CIDR = /^\S+\/\d{1,3}$/;
var EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
var HEX = /^[a-f0-9]+$/i;
var DOMAIN_LIKE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
var HASH_BY_LENGTH = {
  32: "md5",
  40: "sha1",
  56: "sha224",
  64: "sha256",
  96: "sha384",
  128: "sha512"
};
function detectIndicatorTypes(raw) {
  const value = raw.trim();
  if (!value) return [];
  if (CIDR.test(value)) return ["cidr"];
  if (IPV4.test(value) || IPV6.test(value)) return ["ip"];
  if (EMAIL.test(value)) return ["email"];
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return ["url"];
  if (HEX.test(value) && HASH_BY_LENGTH[value.length]) {
    return [HASH_BY_LENGTH[value.length]];
  }
  if (DOMAIN_LIKE.test(value)) {
    const labels = value.split(".");
    return labels.length > 2 ? ["hostname", "domain"] : ["domain", "hostname"];
  }
  return [];
}
function detectIndicatorType(raw) {
  return detectIndicatorTypes(raw)[0] ?? null;
}

// src/casework/casework-types.ts
var UNFILED = "unfiled";

export { APIError, AiClient, AnalyticsClient, AuthClient, AuthError, BillingClient, CaseworkClient, DEFAULT_WARMUP_BUDGET_SECONDS, DefaultEndpoint, DefaultMaxRetries, DefaultTimeout, FeedsClient, IngestClient, NO_BACKENDS_GRACE_SECONDS, RateLimitError, SDKError, SearchClient, ThreatWindsClient, ThreatWindsError, UNFILED, detectIndicatorType, detectIndicatorTypes, retryStreamWarmup, warmupDecision, withWarmup };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map