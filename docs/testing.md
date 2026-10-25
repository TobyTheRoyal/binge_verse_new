# Automated Quality Checks

## Quick Start

Use a patched Node.js 22 LTS release, at least 22.22.2. This minimum also satisfies the test DOM runtime.

```sh
npm ci --legacy-peer-deps
npx playwright install chromium firefox webkit
npm run test:all
```

On Linux, install the browser system dependencies with `npx playwright install --with-deps chromium firefox webkit`. GitHub Actions does this automatically.

No Atlas credentials, TMDB key, Render account or running development server are needed. The first database integration run downloads an official MongoDB binary. Test browsers are downloaded once into Playwright's cache.

## Commands

| Command                            | Purpose                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm test`                         | Fast backend unit and isolated HTTP tests; database integration cases skip unless `TEST_MONGODB_URI` is explicitly set. |
| `npm run test:integration`         | Build, start a disposable local MongoDB and execute all backend tests without database skips.                           |
| `npm run test:server:coverage`     | The full backend suite with V8/c8 HTML and LCOV coverage.                                                               |
| `npm run test:components`          | React component and hook regressions using Vitest, jsdom and Testing Library.                                           |
| `npm run test:components:coverage` | Component tests plus enforced coverage thresholds for the explicitly listed critical UI modules.                        |
| `npm run test:e2e`                 | Build and run the full browser/API matrix against a disposable local application.                                       |
| `npm run test:e2e:coverage`        | Run the browser/API matrix and append its real backend execution to the preceding backend coverage run.                 |
| `npm run test:e2e:ui`              | Build and open Playwright's interactive test runner.                                                                    |
| `npm run test:e2e:report`          | Open the most recent browser report with screenshots, traces and failure videos.                                        |
| `npm run test:all`                 | API-type freshness, lint, typecheck, test build, backend/UI/browser tests and coverage gates.                           |

`npm run test:coverage:check` enforces combined backend coverage after both backend and browser/API execution.

After an initial build, use `npx playwright test --project=webkit` or a file such as `npx playwright test tests/e2e/search.spec.ts --project=chromium` for focused debugging. Do not run a second build while browser tests are reading the current `dist/` directory.

## Isolation And Test Data

`scripts/e2e-server.ts` starts the actual built Express/GraphQL application with a new local MongoDB and a loopback metadata server. It never reads the application's `.env`. Database URI, database name, cookie name, upstream origin and API keys are explicitly replaced. Test-only admin credentials are seeded solely into this disposable database. There is no test-admin endpoint or authentication bypass in production.

The origin is always `http://127.0.0.1:4199`; `E2E_PORT` can select another local port. There is intentionally no remote base-URL option. An existing listener is not reused, so the suite cannot accidentally mutate a development or deployed database. Shutdown terminates the application and removes its temporary database.

Tests exercise real HTTP requests, authentication cookies, resolvers, MongoDB indexes and persistence. TMDB metadata is deterministic and local. External browser requests are blocked or fulfilled with a test image and a locally packaged Inter font. Main application requests are not intercepted except in explicit network-failure tests.

Every browser test receives a new browser context. Demo tests receive independent identities instead of sharing a mutable account. Registration is enabled in this isolated full-platform test instance; the separate backend portfolio integration test verifies the registration-disabled deployment configuration. Rate limits are increased for the test workload; their rejection behavior has dedicated backend HTTP tests.

## Browser And Workflow Matrix

The same functional cases run in desktop Chromium, Firefox and WebKit, an emulated Pixel/Chromium profile, and an emulated iPhone/WebKit profile. A separate API project avoids repeating browser-independent contract checks five times.

| Area                  | Automated checks                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search                | First pointer click, partial titles, movie/series routes, arrow keys, Enter, Escape, form submission and Browse suggestions. A component regression reproduces Safari's null-relatedTarget blur sequence before the original click fix. |
| Authentication        | Demo start, failed start and retry, refresh persistence, registration, invalid/valid login, logout revocation, private-route and admin denial.                                                                                          |
| Privacy               | Independent visitors, denied foreign-user reads/writes, private query-cache clearing and absent password/token hashes in public responses.                                                                                              |
| Watchlist and ratings | Unique additions, removal, half stars, persisted ratings, automatic completion/watchlist removal, watched-without-rated, separate season scores and one series average in History.                                                      |
| Episode tracking      | Individual and bulk operations, refresh persistence, next available episode, Continue Watching, season reset, hidden specials and disabled unaired episodes.                                                                            |
| Discovery             | Infinite scrolling across overlapping metadata pages, deduplication, language/provider filters, Romance option, refreshed URLs, back navigation and empty results.                                                                      |
| Calendar/admin        | Every day in list view, Austria-only selection, Paramount+ filtering, draft exclusion, first-click admin selection and published cinema releases.                                                                                       |
| TasteDNA              | Seeded profile rendering and recalculation. Existing backend tests verify that fictional demo ratings do not pollute community signals.                                                                                                 |
| Failure states        | Announced loading, missing metadata, recoverable Browse outages, failed demo requests and optimistic rating rollback.                                                                                                                   |
| Accessibility         | axe WCAG 2 A/AA and 2.1 A/AA scans on demo entry and six authenticated views in all five profiles; keyboard regressions, uncaught browser-error detection and horizontal-overflow assertions.                                           |
| API/security          | Readiness/404 contracts, security headers, JSON-only writes, foreign-origin rejection, user ownership and idempotent bulk writes.                                                                                                       |
| Performance smoke     | 40 real local API requests with concurrency 4 and a generous p95 regression budget. Results are attached to the report; this is not a production capacity benchmark.                                                                    |

## Coverage And Reports

- `coverage/server/index.html`: backend coverage, including the large existing resolver module. `test:server:coverage` resets the raw coverage; `test:e2e:coverage` appends actual backend execution from the browser/API workflows. Source maps merge the compiled server into its original TypeScript files. Transport-only TypeScript interfaces and test files are excluded.
- `coverage/components/index.html`: targeted UI coverage. Its scope is explicitly `Navbar`, `RatingStars`, navigation/context, authentication provider, rating formatting and the autocomplete hook, not the entire frontend. Every included file must meet 90% lines/statements/functions and 85% branches.
- `playwright-report/index.html`: browser/API report; use `npm run test:e2e:report` to serve it.
- `test-results/e2e.xml`: JUnit output for CI.

The GitHub Actions workflow runs the quality gates on pushes and pull requests. A retried browser failure still fails CI as a flaky test; retries collect diagnostic evidence instead of silently making the build green. Reports are uploaded for seven days even when a test fails. Browser traces and videos contain disposable test identities and test-only credentials; do not repoint these tests at real accounts or publish traces from production sessions.

Green tests demonstrate the listed behavior, not correctness of all possible inputs. Report backend and targeted frontend coverage separately; do not present the targeted UI percentage as whole-project coverage.

The combined backend gate requires 90% lines/statements, 85% functions and 70% branches. It runs only after both contributing suites; the backend unit/integration report alone is not expected to meet this combined gate. Raw V8 coverage files are excluded from CI uploads; the HTML/LCOV reports remain available.

### Verified Local Baseline

On 2026-10-25, `CI=true npm run test:all` passed on macOS with Node 22.22.3: 30 backend tests, 47 component/hook tests and all 161 browser/API project cases, without retries or skips. The previously intermittent WebKit authentication case also passed 20 focused repetitions. API-type freshness, zero-warning lint, typecheck, build and coverage gates passed; a separate `npm audit --audit-level=high` reported no known vulnerabilities.

Combined backend coverage was 92.78% lines/statements, 89% functions and 72.74% branches. The explicitly selected UI modules reached 98.85% lines, 98.48% statements, 98.21% functions and 93.49% branches. These are dated local measurements, not whole-frontend coverage or evidence of a completed remote GitHub Actions run.

## Visual References

Chromium compares the demo entry at 1440x1000 and 390x844 against committed PNG references under `tests/e2e/__screenshots__/`. The clock, locale, timezone and font responses are controlled. These are two targeted screenshot regressions, not pixel baselines for every page.

After an intentional visual change:

```sh
npm run build
npx playwright test tests/e2e/visual.spec.ts --project=chromium --update-snapshots
```

Inspect both resulting images before committing them, then run the suite without `--update-snapshots`. CI never updates baselines automatically. Small OS font-rasterization differences are tolerated; a new CI operating-system/browser version can require an explicitly reviewed baseline update.

## Adding Tests

Use user-visible roles, labels and text rather than implementation selectors where possible. Wait for observable states or specific API responses instead of fixed sleeps. Test failures and unauthenticated behavior alongside successful flows. Put a regression test around a reproduced bug before changing behavior.

For reload persistence checks, wait for saved server state rather than just an optimistic star selection. The suite retains uncaught browser-error assertions and shuts the test application down gracefully so V8 coverage and temporary database cleanup can finish.

Wait for the destination page's loaded content, not just its global navigation, before a subsequent hard navigation. [Playwright's WebKit issue #43120](https://github.com/microsoft/playwright/issues/43120) documents misclassified same-origin cancellation errors during document replacement. The suite does not suppress this error signature globally.

Add backend tests under `server/tests/`, UI tests beside their component or hook, and browser workflows under `tests/e2e/`. New metadata cases belong in `tests/fixtures/tmdb.ts`. Do not add production-only testing routes, shared session files, real account passwords, `.env` loading or external service dependencies to the harness.

## Remaining Limits

Automated axe scans are not a full accessibility audit; real screen-reader and assistive-technology evaluation remains necessary. Mobile profiles emulate devices and do not replace testing on physical phones. WebKit is the browser engine used by Safari, not a guarantee for every released Safari version.

The suite does not prove commercial-scale capacity, availability of Render/Atlas/TMDB, production Redis failover, backup restoration or resistance to every security attack. The broad browser tests use `NODE_ENV=test` and local in-memory rate-limit storage, not the production Redis/TLS topology. Production-only security configuration still requires a separate staging smoke test. External penetration testing and representative load testing remain commercial-launch work.

## Sources

- [Playwright projects and browser profiles](https://playwright.dev/docs/test-projects)
- [Playwright local web server lifecycle](https://playwright.dev/docs/test-webserver)
- [Playwright accessibility testing and its limits](https://playwright.dev/docs/accessibility-testing)
- [Vitest coverage](https://vitest.dev/guide/coverage.html)
