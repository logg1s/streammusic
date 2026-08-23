# `CHG-20260820-8a21f3de-web-seo-branding`

Change-ID: `CHG-20260820-8a21f3de`
Status: finalized
Lane: standard
Owner: `Vong maintainers`
Decision-Owner: `User / Vong maintainer`
Affected-Specs: `OPERATIONS-003`

## Intent

Make Vong recognizable in browser tabs, installed web apps, search results, and
shared links while keeping personal library and device-pairing URLs out of search.

## Behavior Change

- Before: web metadata had only a basic title, description, PWA icons, and
  manifest; it had no canonical URL, crawler policy, sitemap, or social preview.
- After: `/login` is the canonical public entry with Vietnamese search/social
  metadata, a 1200x630 share card, and a crisp multi-size favicon. Other routes
  remain noindex by default and are absent from the sitemap.

## Acceptance Criteria

- [x] `AC-CHG-20260820-8a21f3de-01`: Given Vong is opened in a browser, when tab and install metadata load, then the current rose-on-black mark is available at 16, 32, 48, 64, 192, and 512 pixels plus Apple and maskable variants.
- [x] `AC-CHG-20260820-8a21f3de-02`: Given `/login` is crawled or shared, when its head is rendered, then title, description, canonical URL, index/follow, Open Graph, Twitter, favicon, and manifest metadata resolve to production-safe values.
- [x] `AC-CHG-20260820-8a21f3de-03`: Given robots and sitemap are fetched, when their contents are inspected, then only `/login` is advertised as indexable and private/pairing/API routes are not advertised.
- [x] `AC-CHG-20260820-8a21f3de-04`: Given the production-style web build is served, when desktop and mobile login surfaces are inspected, then the page renders without framework or console errors and the SEO/brand assets return successfully.

## Impact

- Contracts: Adds public metadata-route outputs at `/robots.txt` and `/sitemap.xml`.
- Data/migration: None.
- Security/privacy: Uses a noindex-by-default root policy and excludes pairing codes,
  authenticated library paths, and APIs from discovery surfaces.

## Risks

- An overly broad crawler rule could hide the public page: keep `/login` as a more
  specific allow rule and verify the generated robots output.
- Metadata could drift from generated assets: share dimensions and favicon frames
  are regression-tested alongside the metadata constants.
- Cached favicons may remain stale briefly: replace the conventional `/favicon.ico`
  payload and keep explicit PNG alternatives for modern browsers.

## Rollout and Recovery

- Rollout: ship with the next web deployment; no app-store binary update is needed
  because Android, Android TV, and Windows already use the same Vong mark.
- Rollback/recovery: revert metadata routes/constants and restore the prior favicon;
  no persistent data recovery is required.

## Plan

- [x] Reconcile public discovery behavior with the operations spec.
- [x] Generate favicon/social assets and add canonical, robots, sitemap, and social metadata.
- [x] Run unit, SDD, production build, and rendered browser verification.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Metadata/assets unit tests | pass | 3 focused tests cover canonical/index boundaries, Open Graph/Twitter, four favicon frames, and 1200x630 social-card dimensions |
| Full repository verification | pass | `python scripts/verify.py`: SDD pass, 15 test files / 146 tests, production Next build, web/shared/mobile lint and typecheck, and Rust clippy |
| Rendered browser QA | pass | Production-style `/login` inspected at default desktop and 390x844 mobile viewports; title, canonical, index/follow, OG image, favicon links, meaningful DOM, loaded QR, and clean console confirmed |
| Metadata endpoints | pass | Favicon, social card, manifest, robots, and sitemap returned HTTP 200 with expected content types; sitemap advertises only production `/login` and `/pair` rendered noindex/nofollow/nocache |

## Open Questions

- None. The existing mobile, Android TV, and Windows assets already match the current
  Vong mark, so this change is intentionally web-scoped.
