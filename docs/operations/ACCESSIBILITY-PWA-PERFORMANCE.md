# Accessibility, PWA, and Performance Gate

## Accessibility Baseline

The shared application shell provides a visible-on-focus skip link, a programmatic main-content target, high-contrast `:focus-visible` outlines, reduced-motion support, labeled navigation, current-page state, and polite offline announcements. Form controls inherit the application font and remain native keyboard controls.

Before v1, complete this manual matrix on the production candidate:

- Keyboard-only navigation at 200% zoom on login, household, rides, driver, safety, settings, events admin, and Platform Health.
- VoiceOver on current iOS Safari and TalkBack on current Android Chrome.
- Error, loading, confirmation, disabled-control, modal/confirmation, and table-reading behavior.
- Light/dark forced-color or high-contrast mode as supported by the target browser.

Record defects and rerun the matrix after fixes. The shared-shell regression test is a guardrail, not a substitute for assistive-technology testing.

## Offline and Install Behavior

The service worker caches only the manifest, icons, and public offline document. It never caches API responses or authenticated pages. Offline navigation displays a privacy-safe explanation rather than stale household, ride, location, or account data. The manifest starts installed users at `/app` and provides Rides and Household shortcuts.

Test install, update, offline navigation, reconnect, push permission, notification click-through, and service-worker removal on current iOS Safari and Android Chrome.

## Performance Gate

`npm run perf:smoke` uses Node's built-in HTTP client to exercise the public page and liveness endpoint. CI runs 300 requests at concurrency 20 and fails on any error or p95 latency over 1,000 ms. This catches severe regressions without requiring an external load-testing product.

Before launch, run the same command against staging with representative infrastructure and increase `LOAD_REQUESTS` and `LOAD_CONCURRENCY`. Separately test authenticated ride-list and organization-event traffic with synthetic accounts; never run load tests against production without an approved window.
