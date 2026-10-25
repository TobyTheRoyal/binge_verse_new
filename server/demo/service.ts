import mongoose from "mongoose";
import { config } from "../config.js";
import { PublicError } from "../errors.js";
import { Rating, WatchlistItem, WatchProgress, EpisodeProgress } from "../db/models.js";
import { createDemoId, demoProfile, demoRecordFields } from "./identity.js";
import { DEMO_MOVIES, DEMO_WATCHLIST, DEMO_SERIES } from "./fixtures.js";

export async function startDemo(
  settings = { enabled: config.DEMO_ENABLED, ttl: config.DEMO_TTL_SECONDS },
) {
  if (!settings.enabled) throw new PublicError("Der Demo-Zugang ist nicht verfügbar.", 404);
  if (mongoose.connection.readyState !== 1)
    throw new PublicError("Die Demo ist gerade nicht erreichbar. Bitte versuche es erneut.", 503);
  const expiresAt = new Date(Date.now() + settings.ttl * 1000);
  const userId = createDemoId(expiresAt);
  const base = { userId, ...demoRecordFields(userId) };
  const now = new Date();
  await Promise.all([
    Rating.insertMany(
      DEMO_MOVIES.map((item) => ({ ...base, ...item, mediaType: "movie", seasonNumber: null })),
    ),
    WatchlistItem.insertMany(
      DEMO_WATCHLIST.map((item) => ({ ...base, ...item, mediaType: "movie" })),
    ),
    WatchProgress.insertMany([
      ...DEMO_MOVIES.map(({ rating: _rating, ...item }) => ({
        ...base,
        ...item,
        mediaType: "movie",
        status: "COMPLETED",
        totalEpisodes: 1,
        watchedAt: now,
        lastActivityAt: now,
      })),
      ...DEMO_WATCHLIST.map((item) => ({
        ...base,
        ...item,
        mediaType: "movie",
        status: "PLAN_TO_WATCH",
        totalEpisodes: 1,
        lastActivityAt: now,
      })),
      { ...base, ...DEMO_SERIES, mediaType: "tv", status: "WATCHING", lastActivityAt: now },
    ]),
    EpisodeProgress.insertMany(
      [1, 2, 3].map((episodeNumber) => ({
        ...base,
        ...DEMO_SERIES,
        seasonNumber: 1,
        episodeNumber,
        watchedAt: now,
      })),
    ),
  ]);
  return demoProfile(userId)!;
}
