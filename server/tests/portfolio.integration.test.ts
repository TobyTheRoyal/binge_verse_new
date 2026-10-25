import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import mongoose from "mongoose";

const listen = async (server: Server) => {
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return (server.address() as AddressInfo).port;
};
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

test(
  "portfolio demo: independent visitors, persisted half-star seasons, progress and denied admin access",
  {
    skip:
      !process.env.TEST_MONGODB_URI &&
      "Set TEST_MONGODB_URI and build first to enable the isolated full-stack test.",
    timeout: 60000,
  },
  async () => {
    const metadata = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      const path = new URL(request.url!, "http://localhost").pathname;
      const match = path.match(/^\/3\/tv\/1396\/season\/(\d+)$/);
      if (match) {
        const season = Number(match[1]);
        response.end(
          JSON.stringify({
            season_number: season,
            name: `Staffel ${season}`,
            episodes: Array.from({ length: season === 1 ? 7 : 13 }, (_, index) => ({
              id: season * 100 + index,
              season_number: season,
              episode_number: index + 1,
              name: `Episode ${index + 1}`,
              air_date: "2008-01-01",
              runtime: 45,
            })),
          }),
        );
      } else {
        response.end(
          JSON.stringify({
            id: 1396,
            name: "Breaking Bad",
            seasons: [{ season_number: 1 }, { season_number: 2 }],
            results: [],
          }),
        );
      }
    });
    const metadataPort = await listen(metadata);
    const reservation = createServer();
    const port = await listen(reservation);
    await close(reservation);
    const dbName = `binge_portfolio_test_${randomUUID().replaceAll("-", "")}`;
    const client = new mongoose.mongo.MongoClient(process.env.TEST_MONGODB_URI!, {
      serverSelectionTimeoutMS: 15000,
    });
    const child = spawn(process.execPath, ["--import", "tsx", "server/server.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: String(port),
        APP_ORIGINS: `http://127.0.0.1:${port}`,
        MONGODB_URI: process.env.TEST_MONGODB_URI,
        MONGODB_DB: dbName,
        REDIS_URL: "",
        DEMO_ENABLED: "true",
        REGISTRATION_ENABLED: "false",
        SERVE_WEB: "true",
        RUN_MIGRATIONS: "true",
        TMDB_API_KEY: "test-only",
        OMDB_API_KEY: "",
        TMDB_API_ORIGIN: `http://127.0.0.1:${metadataPort}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const base = `http://127.0.0.1:${port}`;
    const post = (path: string, body: unknown, cookie = "") =>
      fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(body),
      });
    const gql = async (query: string, cookie = "", variables: Record<string, unknown> = {}) =>
      (await post("/graphql", { query, variables }, cookie)).json();
    let databaseConnected = false;
    try {
      await client.connect();
      databaseConnected = true;
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode != null) throw new Error("Test server exited before readiness.");
        try {
          ready = (await fetch(`${base}/ready`)).ok;
        } catch {
          /* Server may still be starting. */
        }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready, "Test server must become ready.");
      assert.match(
        await (await fetch(`${base}/demo`, { headers: { "Sec-Fetch-Site": "cross-site" } })).text(),
        /<div id="root"><\/div>/,
      );
      assert.equal((await fetch(`${base}/api/missing`)).status, 404);
      assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
      assert.equal(
        (
          await post("/api/register", {
            name: "No",
            email: "no@example.com",
            password: "not-a-real-password",
          })
        ).status,
        403,
      );
      assert.ok(
        (
          await gql(
            'mutation{register(input:{name:"No",email:"no@example.com",password:"not-a-real-password"}){user{id}}}',
          )
        ).errors?.length,
      );
      const first = await post("/api/demo", {});
      const second = await post("/api/demo", {});
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      const cookieA = first.headers.getSetCookie()[0].split(";")[0];
      const cookieB = second.headers.getSetCookie()[0].split(";")[0];
      const userA = (await first.json()).user;
      const userB = (await second.json()).user;
      assert.notEqual(userA.id, userB.id);
      assert.equal(userA.isDemo, true);
      assert.equal(userA.isAdmin, false);
      const ratingsQuery = "query($id:String!){ratings(userId:$id){tmdbId seasonNumber rating}}";
      assert.equal((await gql(ratingsQuery, cookieA, { id: userA.id })).data.ratings.length, 8);
      assert.ok((await gql(ratingsQuery, cookieA, { id: userB.id })).errors?.length);
      assert.ok((await gql("{adminReleaseStats{drafts}}", cookieA)).errors?.length);
      const scores = await gql(
        "{matchScores(items:[{tmdbId:157336,mediaType:movie}]){communityRatingCount similarUserCount}}",
        cookieA,
      );
      assert.equal(scores.data.matchScores[0].communityRatingCount, 0);
      assert.equal(scores.data.matchScores[0].similarUserCount, 0);
      const rate = "mutation($input:RatingInput!){rateMovie(input:$input){seasonNumber rating}}";
      for (const [seasonNumber, rating] of [
        [1, 7.5],
        [2, 9.5],
      ]) {
        const result = await gql(rate, cookieA, {
          input: {
            userId: userA.id,
            tmdbId: 1396,
            mediaType: "tv",
            title: "Breaking Bad",
            seasonNumber,
            rating,
          },
        });
        assert.equal(result.errors, undefined);
        assert.equal(result.data.rateMovie.rating, rating);
      }
      const persisted = await gql(ratingsQuery, cookieA, { id: userA.id });
      const series = persisted.data.ratings.filter(
        (entry: { tmdbId: number }) => entry.tmdbId === 1396,
      );
      assert.deepEqual(
        series.map((entry: { rating: number }) => entry.rating).sort(),
        [7.5, 8.5, 9.5],
      );
      const progressQuery =
        "query($id:String!){watchProgress(userId:$id,tmdbId:1396,mediaType:tv){status watchedEpisodes nextEpisode{seasonNumber episodeNumber}}}";
      const ownProgress = await gql(progressQuery, cookieA, { id: userA.id });
      assert.equal(ownProgress.data.watchProgress.status, "COMPLETED");
      assert.equal(ownProgress.data.watchProgress.watchedEpisodes, 20);
      const otherProgress = await gql(progressQuery, cookieB, { id: userB.id });
      assert.equal(otherProgress.data.watchProgress.watchedEpisodes, 3);
      assert.equal(otherProgress.data.watchProgress.nextEpisode.episodeNumber, 4);
      assert.equal(
        (await (await fetch(`${base}/api/me`, { headers: { Cookie: cookieA } })).json()).user.id,
        userA.id,
      );
      const records = await client
        .db(dbName)
        .collection("ratings")
        .find({ userId: userA.id })
        .toArray();
      assert.ok(records.every((record) => record.demoExpiresAt instanceof Date));
      const removeSeason = await gql(
        "mutation($id:String!){removeRating(userId:$id,tmdbId:1396,mediaType:tv,seasonNumber:1)}",
        cookieA,
        { id: userA.id },
      );
      assert.equal(removeSeason.errors, undefined);
      const remaining = (await gql(ratingsQuery, cookieA, { id: userA.id })).data.ratings.filter(
        (entry: { tmdbId: number }) => entry.tmdbId === 1396,
      );
      assert.equal(remaining.length, 2);
      assert.ok(remaining.every((entry: { rating: number }) => entry.rating === 9.5));
      await gql(
        "mutation($id:String!){removeRating(userId:$id,tmdbId:1396,mediaType:tv)}",
        cookieA,
        { id: userA.id },
      );
      assert.equal(
        (await gql(ratingsQuery, cookieA, { id: userA.id })).data.ratings.filter(
          (entry: { tmdbId: number }) => entry.tmdbId === 1396,
        ).length,
        0,
      );
      assert.equal(
        (await gql(progressQuery, cookieA, { id: userA.id })).data.watchProgress.watchedEpisodes,
        20,
      );
      await post("/api/logout", {}, cookieA);
      assert.equal(
        (await (await fetch(`${base}/api/me`, { headers: { Cookie: cookieA } })).json()).user,
        null,
      );
      assert.equal(
        (await (await fetch(`${base}/api/me`, { headers: { Cookie: cookieB } })).json()).user.id,
        userB.id,
      );
    } finally {
      child.kill("SIGTERM");
      if (child.exitCode === null)
        await new Promise<void>((resolve) => child.once("exit", () => resolve()));
      await close(metadata);
      try {
        if (databaseConnected) await client.db(dbName).dropDatabase();
      } finally {
        await client.close();
      }
    }
  },
);
