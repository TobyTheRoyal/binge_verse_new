import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { migrateRatingIndexes } from "../db/rating-indexes.js";

const uri = process.env.TEST_MONGODB_URI;

test(
  "MongoDB preserves two season ratings and a series average after migration",
  {
    skip: !uri && "Set TEST_MONGODB_URI to run the isolated temporary-collection regression test.",
  },
  async () => {
    const client = new mongoose.mongo.MongoClient(uri!, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const collection = client.db(process.env.TEST_MONGODB_DB ?? "binge_test").collection<{
      userId: string;
      tmdbId: number;
      mediaType: string;
      seasonNumber: number | null;
      rating: number;
    }>(`_test_season_ratings_${randomUUID().replaceAll("-", "")}`);
    try {
      await collection.createIndex({ userId: 1, tmdbId: 1, mediaType: 1 }, { unique: true });
      const title = { userId: "isolated-regression-user", tmdbId: 1, mediaType: "tv" };
      await collection.insertOne({ ...title, seasonNumber: 1, rating: 7.5 });
      await assert.rejects(
        collection.insertOne({ ...title, seasonNumber: 2, rating: 9.5 }),
        (error: unknown) =>
          error instanceof mongoose.mongo.MongoServerError && error.code === 11000,
      );

      await migrateRatingIndexes(collection);
      for (let attempt = 0; attempt < 2; attempt += 1)
        await collection.updateOne(
          { ...title, seasonNumber: 2 },
          { $set: { rating: 9.5 } },
          { upsert: true },
        );
      const seasons = await collection
        .find({ ...title, seasonNumber: { $ne: null } })
        .sort({ seasonNumber: 1 })
        .toArray();
      assert.deepEqual(
        seasons.map((season) => season.rating),
        [7.5, 9.5],
      );
      const average = seasons.reduce((sum, season) => sum + season.rating, 0) / seasons.length;
      await collection.updateOne(
        { ...title, seasonNumber: null },
        { $set: { rating: average } },
        { upsert: true },
      );
      assert.equal((await collection.findOne({ ...title, seasonNumber: null }))?.rating, 8.5);
      assert.equal(await collection.countDocuments(title), 3);
      assert.deepEqual(await migrateRatingIndexes(collection), []);
      assert.equal((await collection.findOne({ ...title, seasonNumber: 1 }))?.rating, 7.5);
      await assert.rejects(
        collection.insertOne({ ...title, seasonNumber: 2, rating: 1 }),
        (error: unknown) =>
          error instanceof mongoose.mongo.MongoServerError && error.code === 11000,
      );
    } finally {
      try {
        await collection.drop();
      } finally {
        await client.close();
      }
    }
  },
);
