# js-sdk — AGENTS.md

The TypeScript SDK (`@threatwinds/sdk`) for the ThreatWinds API. Fully implemented;
it is what the `website` React app consumes as a local file dependency.

> Org-wide patterns: see [`../AGENTS.md`](../AGENTS.md).

## What It Does

A browser/Node client over the ThreatWinds OpenAI-compatible and platform REST
APIs. One `ThreatWindsClient` core (transport, auth headers, retry, timeouts,
error mapping) with a feature client per API area:

| Module | Client | Covers |
|--------|--------|--------|
| `core/` | `ThreatWindsClient` | fetch transport, `Api-Key`/`Api-Secret` or Bearer auth, GET retry on 429/502/503/504, SSE `stream()` |
| `search/` | `SearchClient` | entity search (simple/advanced), lookup, relations, comments, history, indicator-type detection |
| `analytics/` | `AnalyticsClient` | entity details, relation graph, overview, recent feed, attribution, live-feed WebSocket (ticket → socket) |
| `ingest/` | `IngestClient` | report indicators + associations, entity definitions (the correlate catalogue) |
| `auth/` | `AuthClient` | session, user, keypair |
| `billing/` | `BillingClient` | plan / usage / subscription |
| `ai/` | `AiClient` | chat, speech, warm-up; every AI call routes through `warmup.ts` |
| `casework/` | `CaseworkClient` | cases, watchlists, pinned entities, notes |
| `feeds/` | `FeedsClient` | TI feed subscription |

## Commands

```bash
npm install        # needs the sibling `website/`? No — js-sdk has no file: deps itself
npm run build      # tsup -> dist (cjs + esm + dts)
npm test           # jest
npm run type-check # tsc --noEmit
npm run lint       # eslint src --ext .ts
npm run format     # prettier src + tests
```

There is **no test framework config beyond Jest** (`jest.config.ts`, ts-jest). No CI
workflow in this repo (`.github/workflows` is absent) — tests run locally and in the
consumers' pipelines.

## Gotchas

- **The default base URL is `https://api.threatwinds.com`** (`core/config.ts`), but
  consumers almost never rely on it. `website` builds its own client with the
  hostname-derived base (`apis.threatwinds.com` prod / `apis.dev.threatwinds.com`
  dev — see `website/src/lib/environment.ts`). **`intelligence.threatwinds.com`
  is deprecated — never put it back.**
- **Unauthenticated construction is intentional.** `b91463b` removed the
  "must have credentials" constructor guard: `applyAuth` omits headers when
  credentials are empty, which is how public / `AuthOptional` endpoints are
  reached at the lower unauthenticated rate limit. Don't "fix" a no-auth client
  to throw — the constructor still rejects *conflicting* auth (key+secret AND
  bearer).
- **`dist/` is committed.** The `file:../js-sdk` dependency is served from
  `package.json` `main`/`module`/`types`, all pointing at `dist/`. After changing
  `src/`, run `npm run build` **and commit the regenerated `dist/`** — a source-only
  push ships nothing to consumers. `dist/` is tracked even though `.gitignore`
  lists it, so `git add dist` needs no `-f`; if git ever refuses, force-add.
- **Response normalization lives in the client.** The API mixes camelCase and
  snake_case across endpoints; the feature clients (e.g. `analytics-client.ts`)
  map and validate the raw shape into the typed exports. When you change the wire
  shape, update the mapper *and* its test in `tests/<area>-mapper.test.ts`.
- **Package name is `@threatwinds/sdk`**, version `1.0.0`, MIT-licensed. Node
  `>=18`.

## Consumers

- `website/` (`intelligence-app`) — `package.json` `"@threatwinds/sdk": "file:../js-sdk"`.
  In a git worktree this file link can resolve to a stale checkout; see the
  `website/AGENTS.md` worktree note if the SDK build suddenly "loses" exports.
