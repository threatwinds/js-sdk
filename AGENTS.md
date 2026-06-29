# js-sdk — AGENTS.md

See `/mnt/d/Projects/github.com/threatwinds/AGENTS.md` for org-wide patterns.

## What It Does

**Placeholder repo.** Intended to be the JavaScript/TypeScript SDK (`@threatwinds/sdk`) for the ThreatWinds threat intelligence API. No implementation exists yet.

## Current State

- Only `README.md` (title only) and `LICENSE` (MIT, © 2022 Quantfall)
- Previous commit added `CLAUDE.md` with full implementation plan — has been since removed
- No `package.json`, `tsconfig.json`, or source code

## Planned Architecture (from CLAUDE.md)

- TypeScript, `tsup` bundler, Jest tests
- Module-based: core/client, auth, search, analytics, feeds, ingest
- Framework integrations: React hooks, Vue composables, Angular services
- Reference implementation: `dart-sdk` in this org
- Planned package: `@threatwinds/sdk` on npm

## Getting Started

If you are implementing this SDK from scratch:
1. Check the deleted `CLAUDE.md` in git history (`git show 92f1483:CLAUDE.md`) for the full spec
2. Use `dart-sdk` as the reference implementation for API coverage and architecture
3. Initialize with `npm init`, add TypeScript + tsup + Jest, mirror the module structure from CLAUDE.md

## Quirks

- License says "private license" in CLAUDE.md but LICENSE file is MIT — reconcile if publishing
- Target API base URL was `https://intelligence.threatwinds.com/api`
