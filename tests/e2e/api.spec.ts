import { test, expect } from "@playwright/test";

test("API contract: JSON writes, exact origins, security headers and non-SPA 404s", async ({
  request,
}) => {
  const ready = await request.get("/ready");
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toEqual({ ready: true });
  expect(ready.headers()["x-content-type-options"]).toBe("nosniff");
  expect(ready.headers()["x-powered-by"]).toBeUndefined();
  expect((await request.get("/api/doesnotexist")).status()).toBe(404);
  expect((await request.get("/assets/missing.js")).status()).toBe(404);
  expect(
    (await request.get("/demo", { headers: { "Sec-Fetch-Site": "cross-site" } })).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/graphql", {
        headers: { Origin: "https://evil.invalid" },
        data: { query: "{me{id}}" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/demo", { headers: { "Content-Type": "text/plain" }, data: "{}" })
    ).status(),
  ).toBe(415);
  expect((await request.post("/graphql", { data: [{ query: "{me{id}}" }] })).status()).toBe(400);
});

test("foreign user IDs cannot mutate another visitor's library", async ({
  request,
  playwright,
  baseURL,
}) => {
  const first = (await (await request.post("/api/demo", { data: {} })).json()).user;
  const other = await playwright.request.newContext({ baseURL });
  try {
    await other.post("/api/demo", { data: {} });
    const query =
      'mutation($id:String!){addWatchlist(input:{userId:$id,tmdbId:603,mediaType:movie,title:"Matrix"}){tmdbId}}';
    const response = await other.post("/graphql", { data: { query, variables: { id: first.id } } });
    expect((await response.json()).errors).toBeTruthy();
    const profile = await request.get("/api/me");
    const body = await profile.json();
    expect(body.user.id).toBe(first.id);
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.user.tokenHash).toBeUndefined();
    expect(profile.headers()["cache-control"]).toBe("no-store");
  } finally {
    await other.dispose();
  }
});

test("repeated bulk season writes are idempotent and an unaired episode is not offered as next", async ({
  request,
}) => {
  const id = (await (await request.post("/api/demo", { data: {} })).json()).user.id;
  const input = {
    userId: id,
    tmdbId: 288673,
    title: "The Gentlemen",
    seasonNumber: 1,
    totalEpisodes: 5,
    watched: true,
    episodes: [
      { episodeNumber: 1, airDate: "2020-01-01" },
      { episodeNumber: 2, airDate: "2020-01-01" },
    ],
  };
  const query =
    "mutation($input:SeasonProgressInput!){setSeasonWatched(input:$input){watchedEpisodes nextEpisode{seasonNumber episodeNumber}}}";
  for (let index = 0; index < 3; index++) {
    const body = await (
      await request.post("/graphql", { data: { query, variables: { input } } })
    ).json();
    expect(body.errors).toBeUndefined();
    expect(body.data.setSeasonWatched.watchedEpisodes).toBe(2);
    expect(body.data.setSeasonWatched.nextEpisode).toEqual({ seasonNumber: 2, episodeNumber: 1 });
  }
  input.watched = false;
  const body = await (
    await request.post("/graphql", { data: { query, variables: { input } } })
  ).json();
  expect(body.data.setSeasonWatched.watchedEpisodes).toBe(0);
});

test("local API load smoke: bounded concurrent requests stay within a generous regression budget", async ({
  request,
}, testInfo) => {
  const durations: number[] = [];
  const failures: number[] = [];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let index = 0; index < 10; index++) {
        const start = performance.now();
        const response = await request.post("/graphql", {
          data: { query: "{home{featured{id title}}}" },
        });
        durations.push(performance.now() - start);
        if (response.status() !== 200 || (await response.json()).errors)
          failures.push(response.status());
      }
    }),
  );
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
  await testInfo.attach("local-api-latency", {
    body: JSON.stringify({
      requests: durations.length,
      concurrency: 4,
      p95Ms: p95,
      maxMs: durations.at(-1),
    }),
    contentType: "application/json",
  });
  expect(failures).toEqual([]);
  expect(p95).toBeLessThan(5000);
});
