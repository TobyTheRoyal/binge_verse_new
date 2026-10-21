import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { MetadataClient } from "../services/metadata.js";

const settings = { max: 20, ttl: 10000, concurrency: 2, queueLimit: 20, timeout: 1000 };
test("metadata coalesces concurrent requests and reuses cached responses", async () => {
  let calls = 0;
  const client = new MetadataClient(settings, async () => {
    calls += 1;
    await delay(10);
    return Response.json({ id: 1 });
  });
  const url = new URL("https://metadata.example/movie/1");
  const results = await Promise.all(
    Array.from({ length: 8 }, () => client.get<{ id: number }>(url)),
  );
  assert.equal(calls, 1);
  assert.equal(
    results.every((result) => result.id === 1),
    true,
  );
  await client.get(url);
  assert.equal(calls, 1);
});

test("metadata limits outgoing concurrency and evicts old cache entries", async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const client = new MetadataClient(settings, async () => {
    active += 1;
    peak = Math.max(peak, active);
    calls += 1;
    await delay(5);
    active -= 1;
    return Response.json({ ok: true });
  });
  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      client.get(new URL(`https://metadata.example/${index}`)),
    ),
  );
  assert.equal(peak, 2);
  assert.equal(calls, 8);
  let evictions = 0;
  const small = new MetadataClient({ ...settings, max: 1 }, async () => {
    evictions += 1;
    return Response.json({});
  });
  for (const path of ["a", "b", "a"]) await small.get(new URL(`https://metadata.example/${path}`));
  assert.equal(evictions, 3);
});

test("failed upstream responses are not cached and do not disclose URLs or keys", async () => {
  let calls = 0;
  const client = new MetadataClient(settings, async () => {
    calls += 1;
    return calls === 1
      ? new Response("secret-upstream-details", { status: 500 })
      : Response.json({ ok: true });
  });
  const url = new URL("https://metadata.example/?api_key=test-only");
  await assert.rejects(
    client.get(url),
    (error: unknown) =>
      error instanceof Error &&
      !error.message.includes("test-only") &&
      !error.message.includes("secret-upstream-details"),
  );
  await client.get(url);
  assert.equal(calls, 2);
});

test("upstream queue is bounded during request bursts", async () => {
  let calls = 0;
  const client = new MetadataClient({ ...settings, queueLimit: 1 }, async () => {
    calls += 1;
    await delay(10);
    return Response.json({ ok: true });
  });
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, index) =>
      client.get(new URL(`https://metadata.example/burst/${index}`)),
    ),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 3);
  assert.equal(results.filter((result) => result.status === "rejected").length, 2);
  assert.equal(calls, 3);
});
