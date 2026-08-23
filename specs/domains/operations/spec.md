# Product operations specification

Spec-ID: OPERATIONS
Owner: Vong maintainers
Status: current
Last-Reviewed: 2026-08-20

## Purpose

Collect privacy-bounded product telemetry, let native clients discover trusted
Vong releases, and publish a coherent public web identity without exposing private
application state to discovery surfaces.

## Invariants

- Anonymous telemetry records have no user ID or foreign key to identity tables.
- Telemetry delivery and storage failures never interrupt user playback.
- Native update links are accepted only from the Vong GitHub Releases namespace.
- Public discovery metadata never advertises personal library or device-pairing URLs.

## Requirements

## `OPERATIONS-001` — Anonymous, allowlisted telemetry

### Rule

Telemetry is enabled by default and can be disabled in settings. Clients use random
install/session UUIDs, a closed event-name allowlist, and a sanitizer that rejects
content-bearing keys, long strings, nested objects, invalid numbers, and excessive
properties. The unauthenticated ingestion route bounds body/batch size, validates
shell/UUID/time fields, sanitizes again, and stores no user ID.

### Acceptance criteria

- `AC-OPERATIONS-001-01`: Given an allowed event with safe properties, when telemetry is enabled and flushed, then an anonymous install/session batch is sent.
- `AC-OPERATIONS-001-02`: Given content-like, nested, oversized, or unknown properties/events, when sanitization and ingestion run, then unsafe data is discarded or the invalid batch is rejected within configured bounds.
- `AC-OPERATIONS-001-03`: Given telemetry is disabled or delivery fails, when application behavior continues, then no telemetry error interrupts playback or surfaces as a player failure.
- `AC-OPERATIONS-001-04`: Given a change to the analytics event allowlist, when preparing the next Android store submission, then the Google Play Data safety declaration is reviewed.

### Evidence

- Code/schema-confirmed: [shared analytics contract](../../../packages/shared/src/analytics.ts), [ingestion route](../../../src/app/api/events/route.ts), and analytics table without `userId`.
- Unit-test-confirmed: [analytics tests](../../../packages/shared/src/analytics.test.ts) cover sanitization, enablement, batching, stable install IDs, failure swallowing, and session identity; [playback analytics tests](../../../packages/shared/src/analytics-playback.test.ts) cover event semantics and content redaction.
- Operational assumption: retention, deletion schedule, alerting, and production dashboards are not defined by current code/tests.

## `OPERATIONS-002` — Trusted native update discovery

### Rule

The latest-release endpoint reads the `logg1s/streammusic` GitHub release, returns
version/page plus matching Android phone arm64, Android TV universal ARM, and Windows
x64 installer assets, and caches the upstream request for 15 minutes. Clients compare stable three-part semantic
versions and reject update URLs outside this repository's GitHub release paths.

### Acceptance criteria

- `AC-OPERATIONS-002-01`: Given a valid latest GitHub release, when the endpoint responds, then version, release page, phone, TV, and Windows asset URLs are returned when present.
- `AC-OPERATIONS-002-02`: Given invalid release metadata or an upstream failure, when the endpoint runs, then it returns a controlled 502 response.
- `AC-OPERATIONS-002-03`: Given malformed versions or a URL outside Vong GitHub Releases, when the client evaluates an update, then it does not prompt or open that target as a trusted update.

### Evidence

- Code-confirmed: [release endpoint](../../../src/app/api/releases/latest/route.ts) and [shared update contract](../../../packages/shared/src/update.ts).
- Unit-test-confirmed: [release route tests](../../../src/app/api/releases/latest/route.test.ts) cover metadata validation and phone/TV/Windows asset selection; [update tests](../../../packages/shared/src/update.test.ts) cover version ordering and URL allowlisting.
- Network test gap: live GitHub API behavior and installer integrity/signatures were not exercised during adoption.

## `OPERATIONS-003` — Public web discovery and install identity

### Rule

The signed-out login page is the single canonical, indexable web entry. Private
library routes, device-pairing state, legacy redirects, and APIs default to
`noindex`; robots and sitemap expose only the public entry and the brand assets
needed to render it. Browser, PWA, Apple, Open Graph, and social-card metadata use
the same Vong name, rose-on-black mark, Vietnamese description, and production URL.

### Acceptance criteria

- `AC-OPERATIONS-003-01`: Given a browser or installed PWA, when Vong loads, then its favicon, app icons, manifest name, colors, and description use the current Vong identity.
- `AC-OPERATIONS-003-02`: Given the public login URL is crawled or shared, when metadata is read, then it has one production canonical URL, Vietnamese title/description, large Open Graph and Twitter previews, and an index/follow directive.
- `AC-OPERATIONS-003-03`: Given a private app, API, pairing, or redirect URL, when metadata and crawler policy are read, then it is not advertised in the sitemap and inherits a noindex default.
- `AC-OPERATIONS-003-04`: Given robots and sitemap are fetched, when their generated output is inspected, then `/login` is the only page advertised for indexing and required public brand assets remain crawlable.

### Evidence

- Code-confirmed: [root and public metadata](../../../src/lib/site-metadata.ts), [robots policy](../../../src/app/robots.ts), [sitemap](../../../src/app/sitemap.ts), and [generated brand assets](../../../scripts/generate-brand-assets.mjs).
- Unit-test-confirmed: [metadata tests](../../../src/lib/site-metadata.test.ts) cover index boundaries, canonical/social metadata, favicon variants, and social-card dimensions.
- Render-confirmed: production-style Next output exposes the expected title, canonical, crawler directives, social preview, manifest, favicon, robots, and sitemap endpoints.

## Connections

- Receives player lifecycle signals from [playback](../playback/spec.md) without receiving user identity.
- Native release packaging and publication remain separate release workflows, not part of this domain's update-discovery behavior.
