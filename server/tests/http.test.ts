import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createSchema } from "graphql-yoga";
import { createApplication } from "../http/app.js";
import { config } from "../config.js";

let server: Server;
let closeApplication: () => Promise<void>;
let base: string;
let logins = 0;
before(async () => {
  const schema = createSchema({
    typeDefs:
      "type Query { ping: String!, tree: Tree } type Tree { value: Int, child: Tree } input LoginInput { email: String!, password: String! } type Mutation { login(input: LoginInput!): String! }",
    resolvers: {
      Query: { ping: () => "pong" },
      Mutation: {
        login: () => {
          logins += 1;
          return "ok";
        },
      },
    },
  });
  const application = await createApplication(schema);
  closeApplication = application.close;
  server = application.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeApplication();
});
const graphql = (query: string, extraHeaders = {}) =>
  fetch(`${base}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({ query }),
  });

test("HTTP sends security headers, accepts approved origins and rejects foreign origins", async () => {
  const response = await graphql("{ ping }", { Origin: config.origins[0] });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), config.origins[0]);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await graphql("{ ping }", { Origin: "https://untrusted.example" })).status, 403);
});

test("simple POSTs, malformed JSON, batching and huge bodies are rejected", async () => {
  assert.equal(
    (
      await fetch(`${base}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: '{"query":"{ ping }"}',
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await fetch(`${base}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ query: "{ ping }" }]),
      })
    ).status,
    400,
  );
  assert.equal((await graphql(`{ ping } # ${"x".repeat(300000)}`)).status, 413);
});

test("depth limits stop expensive GraphQL queries before execution", async () => {
  const response = await graphql(`{ tree { ${"child { ".repeat(20)} value ${"}".repeat(20)} } }`);
  const data = await response.json();
  assert.ok(data.errors?.length);
});

test("auth rate limit is shared by GraphQL and REST routes", async () => {
  const query = 'mutation { login(input: {email: "rate-test@example.com", password: "test"}) }';
  for (let attempt = 0; attempt < config.AUTH_RATE_LIMIT; attempt += 1)
    assert.equal((await graphql(query)).status, 200);
  assert.equal(logins, config.AUTH_RATE_LIMIT);
  const response = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "rate-test@example.com", password: "test" }),
  });
  assert.equal(response.status, 429);
  assert.ok(response.headers.get("retry-after"));
});
