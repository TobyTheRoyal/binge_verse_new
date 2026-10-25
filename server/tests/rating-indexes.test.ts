import test from "node:test";
import assert from "node:assert/strict";
import {
  migrateRatingIndexes,
  RATING_UNIQUE_KEY,
  type RatingIndexCollection,
} from "../db/rating-indexes.js";
import { Rating } from "../db/models.js";

const legacy = {
  name: "userId_1_tmdbId_1_mediaType_1",
  key: { userId: 1, tmdbId: 1, mediaType: 1 },
  unique: true,
};
const replacement = { name: "season_unique", key: RATING_UNIQUE_KEY, unique: true };

function fixture() {
  let indexes: Awaited<ReturnType<RatingIndexCollection["indexes"]>> = [legacy];
  const calls: string[] = [];
  const collection: RatingIndexCollection = {
    async createIndex(key, options) {
      calls.push("create");
      assert.deepEqual(key, RATING_UNIQUE_KEY);
      assert.equal(options.unique, true);
      if (!indexes.some((index) => index.name === replacement.name)) indexes.push(replacement);
      return replacement.name;
    },
    async indexes() {
      calls.push("verify");
      return indexes;
    },
    async dropIndex(name) {
      calls.push(`drop:${name}`);
      indexes = indexes.filter((index) => index.name !== name);
    },
  };
  return { collection, calls, add: (index: (typeof indexes)[number]) => indexes.push(index) };
}

test("rating schema allows one rating per user, title and season", () => {
  assert.ok(
    Rating.schema.indexes().some(([key, options]) => {
      return JSON.stringify(key) === JSON.stringify(RATING_UNIQUE_KEY) && options.unique;
    }),
  );
  assert.equal(
    Rating.schema.indexes().some(([key, options]) => {
      return JSON.stringify(key) === JSON.stringify(legacy.key) && options.unique;
    }),
    false,
  );
});

test("rating migration verifies season uniqueness before removing the blocking legacy index", async () => {
  const { collection, calls } = fixture();
  assert.deepEqual(await migrateRatingIndexes(collection), [legacy.name]);
  assert.deepEqual(calls, ["create", "verify", `drop:${legacy.name}`]);
  assert.deepEqual(await migrateRatingIndexes(collection), []);
  assert.ok((await collection.indexes()).some((index) => index.name === replacement.name));
});

test("rating migration preserves unrelated and custom partial indexes", async () => {
  const { collection, add } = fixture();
  add({ name: "user_lookup", key: { userId: 1 } });
  add({ name: "other_unique", key: { title: 1 }, unique: true });
  add({ ...legacy, name: "partial_custom", partialFilterExpression: { mediaType: "movie" } });
  add({ ...legacy, name: "sparse_custom", sparse: true });
  assert.deepEqual(await migrateRatingIndexes(collection), [legacy.name]);
  assert.deepEqual((await collection.indexes()).map((index) => index.name).sort(), [
    "other_unique",
    "partial_custom",
    "season_unique",
    "sparse_custom",
    "user_lookup",
  ]);
});

test("a failed replacement build never removes the existing uniqueness constraint", async () => {
  const { collection, calls } = fixture();
  collection.createIndex = async () => {
    throw new Error("Duplicate season records require manual reconciliation.");
  };
  await assert.rejects(migrateRatingIndexes(collection), /Duplicate season/);
  assert.deepEqual(calls, []);
  assert.ok((await collection.indexes()).some((index) => index.name === legacy.name));
});

test("an unverified replacement never removes the existing uniqueness constraint", async () => {
  const { collection, calls } = fixture();
  collection.createIndex = async () => replacement.name;
  await assert.rejects(migrateRatingIndexes(collection), /could not be verified/);
  assert.deepEqual(calls, ["verify"]);
  assert.ok((await collection.indexes()).some((index) => index.name === legacy.name));
});
