import test, { mock, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createDemoId, demoExpiry, demoProfile, demoRecordFields } from "../demo/identity.js";
import { startDemo } from "../demo/service.js";
import {
  Rating,
  WatchlistItem,
  WatchProgress,
  EpisodeProgress,
  TasteProfile,
} from "../db/models.js";
import { authorizeUser, requireAdmin } from "../auth.js";

const descriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
after(() => {
  mock.restoreAll();
  if (descriptor) Object.defineProperty(mongoose.connection, "readyState", descriptor);
  else Reflect.deleteProperty(mongoose.connection, "readyState");
});
const seeded: Array<Record<string, unknown>> = [];
for (const model of [Rating, WatchlistItem, WatchProgress, EpisodeProgress])
  mock.method(model, "insertMany", async (records: Array<Record<string, unknown>>) => {
    seeded.push(...records);
    return records;
  });

test("each demo has an isolated identity, no privileged role and a fixed expiry", () => {
  const expiry = new Date(Date.now() + 60000);
  const first = demoProfile(createDemoId(expiry))!;
  const second = demoProfile(createDemoId(expiry))!;
  assert.notEqual(first.id, second.id);
  assert.equal(first.role, "USER");
  assert.equal(first.isAdmin, false);
  assert.deepEqual(demoExpiry(first.id), expiry);
  assert.equal(authorizeUser({ user: first }, first.id), first.id);
  assert.throws(() => authorizeUser({ user: first }, second.id));
  assert.throws(() => requireAdmin({ user: { ...first, role: "ADMIN", isAdmin: true } }));
  assert.equal(demoProfile(createDemoId(new Date(0))), null);
  assert.equal(demoExpiry("not-a-demo"), null);
  assert.deepEqual(demoRecordFields("regular-user"), {});
});

test("demo seed data belongs only to its visitor and all documents expire", async () => {
  const user = await startDemo({ enabled: true, ttl: 86400 });
  assert.ok(seeded.length > 10);
  for (const record of seeded) {
    assert.equal(record.userId, user.id);
    assert.deepEqual(record.demoExpiresAt, demoExpiry(user.id));
  }
  assert.ok(seeded.some((record) => record.status === "WATCHING"));
  assert.ok(seeded.some((record) => record.seasonNumber === 1 && record.episodeNumber === 3));
});

test("all personal demo collections declare TTL cleanup without expiring regular records", () => {
  for (const model of [Rating, WatchlistItem, WatchProgress, EpisodeProgress, TasteProfile]) {
    assert.ok(model.schema.paths.demoExpiresAt);
    assert.ok(
      model.schema
        .indexes()
        .some(([key, options]) => key.demoExpiresAt === 1 && options.expireAfterSeconds === 0),
    );
  }
});

test("disabled demos never seed new visitor data", async () => {
  const before = seeded.length;
  await assert.rejects(startDemo({ enabled: false, ttl: 86400 }), /nicht verfügbar/);
  assert.equal(seeded.length, before);
});
