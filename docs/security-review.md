# Security and Scalability Review

## Portfolio Readiness Update (2026-10-25)

The older audit below is retained as history. The explicit-`any` debt and Fast Refresh warnings identified there are now resolved: the repository has zero-warning lint, schema-generated GraphQL/resolver contracts and typed TMDB transport objects. Shared hooks/context and UI variants have separate modules. Registration validation loads only when required instead of adding its library to every page.

A one-click demo now creates a distinct, non-privileged temporary visitor identity and revocable session. Every demo personal record carries TTL expiry, including subsequent rating/episode/profile writes. Demo ratings are excluded from real community/neighbor aggregates. Production demo access is opt-in, public signup can be disabled, and separate per-IP and global daily demo limits bound new requests. The local scratch preview uses a different development cookie and never connects to the normal user database.

The deployment template serves frontend/API from one origin with CSP, hashed-asset caching, SPA fallback and explicit startup index preparation. Frontend entry links from external sites remain permitted; API origins still remain restricted. Missing API and asset paths do not return the SPA document.

Verification now covers 30 passing tests with a real, isolated local MongoDB instance and a stub metadata server. The two-visitor flow verifies cross-user/admin denial, saved half-star seasons, their aggregate, next episode, season deletion/recalculation, whole-series rating removal without deleting viewing progress, session persistence/revocation and exclusion of demo ratings from community scores. Browser QA verified desktop/mobile layout, loaded assets and persistence after refresh. History now shows one aggregate card per title instead of duplicate season cards, and touch/keyboard delete controls are accessible.

No public service was provisioned. A Render Free + Atlas Free guide and CI workflow are prepared; cloud deployment, provider account permissions, credential rotation and real Redis multi-instance/outage behavior are not claimed verified. At this update the existing configured MongoDB endpoint could not be reached, so the database regression tests and browser demo used a fresh local scratch database rather than changing existing user records. Commercial-launch work such as email ownership/recovery, transactions, large-library pagination and load testing remains open.

## Earlier Audit

Review dates: 2026-10-21 to 2026-10-22. Scope: local source, dependency audit, isolated automated tests and local application checks. This is a source-level review and hardening pass, not an independent penetration test or a measured capacity guarantee.

## Findings Addressed

| Priority | Finding                                                                                | Change                                                                                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Real database/API credentials in the tracked example environment                       | Replaced by placeholders and expanded environment ignore rules. Credential rotation remains required outside this repository.                                                             |
| Critical | Predictable fallback JWT signing key; logout did not invalidate copied tokens          | Replaced JWT sessions with cryptographically random opaque tokens. Only SHA-256 token hashes are persisted, with expiry and server-side revocation.                                       |
| High     | REST and GraphQL duplicated login/registration with different opportunities for bypass | One authentication service and shared IP/account rate limits. A mutation request executes at most one root mutation, including through fragments.                                         |
| High     | Arbitrary credentialed origins and no explicit write-origin/JSON guard                 | Exact origin allowlist, Fetch Metadata check and JSON-only POSTs. Yoga's separate CORS handler is disabled to avoid conflicting policies.                                                 |
| High     | Email allowlisting could automatically promote accounts                                | Public registration always creates a user. Roles are read from the stored account and changed with a server-side maintenance command.                                                     |
| High     | No meaningful GraphQL resource boundaries                                              | Bounded body/query size, token count, depth, aliases, cost, root fields, nested input depth and list sizes. Batching, multipart input and production introspection/GraphiQL are disabled. |
| High     | Vulnerable dependency versions                                                         | Compatible security updates applied; unused JWT dependencies removed. Repeat `npm audit` in CI and before deployment.                                                                     |
| Medium   | Upstream requests had no timeout, concurrency cap or bounded cache                     | A common metadata client with request coalescing, LRU entry/byte limits, finite queue and request timeout. Failed responses are not cached.                                               |
| Medium   | Four-character autocomplete could fan out to 19 upstream calls                         | Reduced to three coalesced/cacheable source queries. Frontend autocomplete shares debounce, cache and cancellation.                                                                       |
| Medium   | Homepage repeated personalized database work once per row                              | Scores are computed for one combined batch. Similar-user and community calculations return database aggregates, not all other users' ratings.                                             |
| Medium   | Episode counts queried separately for each item in a progress list                     | Counts are grouped in one database aggregation for the list.                                                                                                                              |
| Medium   | Authentication transitions could retain the previous account's query cache             | Pending queries are canceled and the cache is cleared after successful sign-in/sign-out. Logout failures retain authenticated UI state and display an error.                              |
| Medium   | Repeated providers, enums, region defaults and cache invalidation lists                | Shared domain catalog, common discover parameters and one viewing-data invalidation helper.                                                                                               |
| Medium   | No usable production build for an install without development dependencies             | Compiled Node backend, explicit supported Node version, strict production configuration, readiness and graceful shutdown.                                                                 |

Existing unique user/title/episode indexes are retained. New rating lookup indexes support aggregate queries; session indexes enforce token uniqueness and automatic expiration. Production index creation is explicit and non-destructive.

Page bundles are now loaded per route, with a loading state and a recoverable error boundary. Admin, title detail and TasteDNA code no longer ships eagerly with the initial page.

## Launch Blockers and Follow-Up Work

1. **Rotate the exposed credentials.** Repository edits cannot revoke credentials or erase existing copies. Review MongoDB access/network rules and inspect Git history; do not rewrite shared history without coordination.
2. **Finish account lifecycle protections before public signup.** Email ownership verification, password reset, session/account management and MFA for privileged accounts are not implemented in this pass. Do not use unverified email addresses for sensitive operations.
3. **Configure and verify hosting security.** HTTPS termination, trusted proxies, private MongoDB/Redis access, frontend CSP, WAF/DDOS protection, distributed operational monitoring, backups and restore tests depend on deployment infrastructure.
4. **Validate capacity with a dedicated environment.** No large-user load test was run against the live database. Measure cold/warm metadata, searches, profile rebuilds, bulk episodes and community aggregates with production-like data. Pool sizes and rate limits must be tuned from those measurements.
5. **Paginate large private libraries.** The existing ratings/watchlist/history contracts still read a user's complete library. Add cursor pagination and matching UI before targeting users with very large libraries. Public browse/release pagination is already present and request limits are bounded.
6. **Continue resolver typing and decomposition.** Models, HTTP, authentication, schema, external metadata and social matching are separated, but `server/server.ts` still contains substantial legacy domain/resolver logic and explicit `any` types. Do not claim the entire codebase is free of duplication or type debt. Repository-wide lint still reports these legacy types and existing refresh warnings; the new modules have a separate targeted check during this pass.
7. **Make multi-document viewing changes transactional.** Ratings, watchlist removal and viewing changes currently span multiple writes. Existing unique indexes prevent duplicate user/title rows, but a database/network failure between writes can leave state requiring reconciliation. Add MongoDB transaction support and failure-path integration tests on a replica-set test database.
8. **Close release-event concurrency races.** Release-event duplicate checks still happen before creation; the current compound release index is non-unique. Before multi-editor bulk ingestion, add a deterministic event identity and a non-destructive deduplication/index migration, with an explicit policy for existing duplicates and archived events.
9. **Move costly recommendations off the request path at scale.** Social similarity uses indexed, time-limited database aggregation and a short per-process cache. For large communities, schedule incremental neighbor/profile computations and store shared recommendation snapshots. Community contributions must also be monitored for coordinated manipulation.
10. **Expand verification.** Isolated tests cover security and request/cache boundaries; real MongoDB transactions, Redis outage/multi-instance behavior, complete viewing regression flows, security scanning and external penetration testing remain necessary before launch.

## Verification Results

- All 18 isolated automated tests pass. Coverage includes session hashing/expiry/revocation, current roles and ownership, production settings, input validation, GraphQL fragments/defaults/depth/batching, shared authentication throttling, HTTP origins/headers and metadata cache/concurrency/queue limits.
- Frontend typecheck and combined frontend/compiled-backend production build pass.
- Targeted ESLint checks pass for all new backend modules, tests, scripts, shared definitions, authentication modules, autocomplete hook and route boundary.
- Full-repository ESLint is **not green**: 207 explicit-`any` errors remain in the legacy resolver file (189) and frontend metadata functions (18), plus nine existing Fast Refresh warnings. No lint rules were disabled to hide this debt.
- Final `npm audit` reports zero known vulnerabilities in the installed dependency tree. This is a point-in-time dependency check, not proof of application security.
- Local browser checks verify persistent existing-account login, autocomplete/title navigation and existing ratings after reload. Detail and ratings pages rendered without visible errors; the ratings page has no horizontal overflow at 390 px. Existing account records were not edited by these checks.
- Route splitting reduces the main JavaScript bundle from approximately 501 kB to 390 kB before compression; route-specific bundles are loaded separately. This is not a load-test result.
- Safe index and role maintenance commands were added, but no manual production index migration, role change or data deletion was run. Real Redis/multi-instance verification and external penetration/load tests remain open.

## Season Rating Follow-Up (2026-10-22)

The configured database still contained the pre-season unique rating index `(userId, tmdbId, mediaType)` alongside the correct season-aware index. The old constraint rejected a second season and the aggregate series record; optimistic UI changes were then rolled back without an error message.

`db:migrate:ratings` now creates and verifies the season-aware unique constraint before removing only the obsolete title-only unique index. `db:indexes` runs the same migration for future deployments. The migration was applied to the configured local-development database and removed one obsolete index without editing rating documents. Rating failures now display an accessible message beside the rating controls.

Verification: 23 isolated tests pass, including five new schema/migration tests. The separately enabled MongoDB regression test reproduced the duplicate-key failure in its own temporary collection, then verified independent half-star season ratings, an aggregate series rating, duplicate prevention and repeatable migration after the fix. The test collection was removed. Typecheck, changed-file lint and production build also pass.

## References

- [GraphQL security guidance](https://www.graphql.org/learn/security/)
- [OWASP GraphQL Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html)
- [GraphQL Yoga production guidance](https://the-guild.dev/graphql/yoga-server/docs/prepare-for-production)
- [Redis store for express-rate-limit](https://github.com/express-rate-limit/rate-limit-redis)
