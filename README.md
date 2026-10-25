# BINGE

React 19/Vite frontend, Express 5/GraphQL Yoga API and MongoDB/Mongoose persistence.

## Development

Use a currently patched Node.js 22 LTS release, at least 22.15 (`nvm use` selects the local version for the 22 branch).
Install with `npm ci`, configure a local `.env` using the keys in `.env.example`, then run `npm run dev`.
The frontend is served on port 8080 and proxies `/api` and `/graphql` to the API on port 4000.
Existing credentials belong only in the environment or a secret manager.

```sh
npm run typecheck
npm test
npm run build
npm run lint
```

`npm test` uses isolated HTTP servers and mocked session persistence. It does not create accounts or delete data in the configured MongoDB database.
The optional MongoDB regression test runs only when `TEST_MONGODB_URI` is explicitly set, with optional `TEST_MONGODB_DB`. It creates and removes its own randomly named temporary collection; it never writes to the application's ratings collection.
The older root-level `test-*.mjs` scripts are manual probes, some of which create real database records. They are deliberately not part of the automated test command; use a disposable database for them.

## Code Organization

- `shared/catalog.ts`: domain enums, Austrian market, provider catalog and release labels shared by frontend and backend.
- `shared/auth.ts`: shared registration validation and password policy.
- `server/config.ts`: validated runtime settings and production prerequisites.
- `server/db/models.ts`: Mongoose schemas, model types and indexes. Existing collection names are preserved.
- `server/auth.ts`: the single authentication service used by both REST and GraphQL.
- `server/http/app.ts`: HTTP middleware, origin checks, rate limits, error handling and Yoga setup.
- `server/graphql/schema.ts`: public GraphQL contract.
- `server/graphql/limits.ts`: request and query resource limits.
- `server/services/metadata.ts`: bounded, coalesced upstream requests and public metadata cache.
- `server/services/social-match.ts`: community aggregates and similar-user selection.
- `server/services/discover.ts`: shared discover/filter parameter construction.
- `server/server.ts`: application composition and existing title, viewing, release and recommendation resolvers.
- `src/hooks/use-media-suggestions.ts`: the shared autocomplete query with debounce, cancellation and query caching.
- `src/lib/query-invalidation.ts`: viewing changes invalidate related screens in one place.
- `src/lib/auth-provider.tsx` and `src/lib/auth-context.ts`: authentication provider and stable context/hooks, separated for reliable hot reload.
- `src/lib/media-assets.ts`: image URL helpers shared independently from React components.
- `src/App.tsx` and `src/components/RouteBoundary.tsx`: route-level code splitting with loading and recoverable error states.

Add tunable operational limits to `server/config.ts`; put stable domain choices in `shared/`.
Upstream URLs, protocol constants, enum values and recommendation policies are intentional domain definitions, not deployment secrets. Do not move every literal into environment variables.
Keep user-owned reads and writes behind `authorizeUser`; administrative writes require `requireAdmin`.
Cache only public metadata globally. Keep personalized results out of public/CDN caches, and invalidate viewing-dependent queries after mutations.
New backend modules should use concrete types or validate `unknown` at their boundaries. The remaining legacy resolvers still need a progressive type cleanup; see the audit report.

## Production

1. Replace the MongoDB password and TMDB/OMDb keys previously present in the tracked example file. Removing them does not remove them from Git history or copies.
2. Set `NODE_ENV=production`, exact HTTPS `APP_ORIGINS`, `MONGODB_URI`, `REDIS_URL` and `TMDB_API_KEY`. Configure `HOST` for your hosting environment. MongoDB and Redis must use private/authenticated connections in production.
3. Build with `npm run build`. Run `npm run db:indexes` once during deployment before starting traffic. This command creates declared indexes and migrates the obsolete title-only rating uniqueness constraint to the season-aware constraint. It verifies the replacement before removing only the obsolete rating index; it never calls `syncIndexes` or deletes records. Review any duplicate-index error rather than deleting existing data.
4. Start the compiled API with `npm start`. Serve `dist/` through the frontend host/CDN with SPA fallback and proxy `/api` and `/graphql` to the API. Apply CSP and HTTPS/security headers at the frontend host too; the Express middleware covers API responses.
5. Configure `TRUST_PROXY` only with the exact trusted proxy addresses/ranges used by your host. Do not enable trust for arbitrary forwarded headers.
6. Use `/health` for liveness and `/ready` for MongoDB/Redis readiness. Configure alerts, request logs without credentials, backups and tested restores.

Redis stores shared rate limits across API instances. Development uses a local in-memory rate-limit store when Redis is absent; production requires Redis and does not fail open on store errors.
Metadata and similar-user caches are bounded per process; they are not a distributed response cache.

The session migration creates a `sessions` collection with unique token hashes and a TTL index. Existing watchlists, ratings, episode progress and roles are preserved. Previous JWT cookies no longer authenticate; users sign in again. A valid session is revoked on logout, and privileges are read from the database rather than cookie claims.

For older databases that reject a second season rating, run `npm run db:migrate:ratings`. The idempotent migration creates and verifies unique `(userId, tmdbId, mediaType, seasonNumber)` keys before removing the obsolete unique `(userId, tmdbId, mediaType)` index. No ratings are changed or removed; per-season ratings and the series aggregate can coexist.

To assign a role to an existing account, use the controlled server-side maintenance command:

```sh
npm run user:role -- --email admin@example.com --role ADMIN
```

Public registration always creates `USER` accounts. `ADMIN_EMAILS` and an insecure fallback JWT secret are no longer authentication mechanisms.

Read [the security and scalability review](docs/security-review.md) before opening public registration.
