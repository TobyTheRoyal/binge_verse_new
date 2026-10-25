import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config.js";
import { registrationSchema, loginSchema } from "../../shared/auth.js";
import { inspectGraphqlRequest } from "../graphql/limits.js";

test("production fails closed without storage and exact HTTPS origins", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production" }));
  const production = {
    NODE_ENV: "production",
    APP_ORIGINS: "https://binge.example",
    MONGODB_URI: "mongodb://localhost/test",
    REDIS_URL: "redis://localhost:6379",
    TMDB_API_KEY: "test-only",
  };
  assert.equal(loadConfig(production).isProduction, true);
  assert.throws(() => loadConfig({ ...production, APP_ORIGINS: "*" }));
  assert.throws(() => loadConfig({ ...production, APP_ORIGINS: "http://binge.example" }));
  assert.throws(() => loadConfig({ PORT: "NaN" }));
  assert.equal(
    loadConfig({
      ...production,
      APP_ORIGINS: undefined,
      RENDER_EXTERNAL_URL: "https://binge-portfolio.onrender.com",
    }).origins[0],
    "https://binge-portfolio.onrender.com",
  );
  assert.equal(loadConfig(production).DEMO_ENABLED, false);
  assert.equal(
    loadConfig({ ...production, REGISTRATION_ENABLED: "false" }).REGISTRATION_ENABLED,
    false,
  );
  assert.throws(() => loadConfig({ ...production, TMDB_API_ORIGIN: "http://untrusted.example" }));
});

test("registration validates email, length and bcrypt byte limit without breaking old logins", () => {
  const valid = { name: "Test", email: "test@example.com", password: "a-valid-test-password" };
  assert.equal(registrationSchema.safeParse(valid).success, true);
  assert.equal(registrationSchema.safeParse({ ...valid, email: { $ne: "" } }).success, false);
  assert.equal(registrationSchema.safeParse({ ...valid, password: "short" }).success, false);
  assert.equal(registrationSchema.safeParse({ ...valid, password: "ä".repeat(37) }).success, false);
  assert.equal(loginSchema.safeParse({ email: valid.email, password: "old-pass" }).success, true);
});

test("GraphQL guards cover aliases, fragments, inline arrays and variable arrays", () => {
  assert.equal(inspectGraphqlRequest({ query: "query { me { id } }" }).authentication, false);
  assert.equal(
    inspectGraphqlRequest({
      query: "mutation Login($input: LoginInput!) { login(input: $input) { user { id } } }",
      variables: { input: { email: "test@example.com", password: "test" } },
    }).authEmail,
    "test@example.com",
  );
  assert.throws(() => inspectGraphqlRequest([{ query: "{ me { id } }" }]));
  assert.throws(() =>
    inspectGraphqlRequest({
      query:
        "mutation { ...A } fragment A on Mutation { a: login(input: {}) { user { id } } b: login(input: {}) { user { id } } }",
    }),
  );
  assert.throws(() =>
    inspectGraphqlRequest({
      query: "mutation Batch($ids: [ID!]!) { bulk(ids: $ids) }",
      variables: { ids: Array.from({ length: 201 }, (_, i) => String(i)) },
    }),
  );
  assert.throws(() =>
    inspectGraphqlRequest({
      query: `mutation { bulk(ids: [${Array.from({ length: 201 }, (_, i) => i).join(",")}]) }`,
    }),
  );
  assert.throws(() =>
    inspectGraphqlRequest({ query: "query { discover(media: movie, page: -1) { id } }" }),
  );
  assert.throws(() => inspectGraphqlRequest({ query: "query { x }".repeat(10000) }));
});

test("GraphQL variable defaults cannot bypass input limits or account throttling", () => {
  assert.throws(() =>
    inspectGraphqlRequest({
      query: `mutation Batch($ids: [ID!]! = [${Array.from({ length: 201 }, (_, i) => i).join(",")}]) { bulk(ids: $ids) }`,
    }),
  );
  assert.throws(() =>
    inspectGraphqlRequest({
      query: "query Page($page: Int = 501) { discover(page: $page) { id } }",
    }),
  );
  assert.equal(
    inspectGraphqlRequest({
      query:
        'mutation Login($input: LoginInput! = {email: "default@example.com", password: "test"}) { login(input: $input) { user { id } } }',
    }).authEmail,
    "default@example.com",
  );
});
