import "dotenv/config";

import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import type { RequestHandler } from "express";
import { createSchema, createYoga } from "graphql-yoga";
import jwt from "jsonwebtoken";
import mongoose, { Schema } from "mongoose";

const PORT = Number(process.env.PORT ?? 4000);
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const AUTH_COOKIE_NAME = "bingeverse_session";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SUGGESTION_CACHE_TTL_MS = 1000 * 60 * 5;
const SUGGESTION_NEXT_LETTERS = ["a", "e", "i", "o", "u", "r", "s", "t", "l", "n", "m", "h", "d"];

type MediaType = "movie" | "tv";
type WatchStatus = "PLAN_TO_WATCH" | "WATCHING" | "COMPLETED" | "ON_HOLD" | "DROPPED";
type UserRole = "USER" | "EDITOR" | "ADMIN";
type ReleaseType =
  | "CINEMA_RELEASE"
  | "MOVIE_PREMIERE"
  | "MOVIE_CATALOG"
  | "TV_SERIES_PREMIERE"
  | "TV_SEASON"
  | "TV_EPISODE"
  | "TV_CATALOG";
type PublicationStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type ConfirmationStatus = "ANNOUNCED" | "CONFIRMED" | "UNCONFIRMED" | "POSTPONED" | "CANCELLED";
type DatePrecision = "EXACT" | "MONTH" | "QUARTER" | "YEAR" | "UNKNOWN";

type TmdbMedia = {
  id: number;
  media_type?: MediaType;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  release_date?: string | null;
  first_air_date?: string | null;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
};

type SavedMedia = {
  userId: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number;
};

type TmdbEpisode = {
  id: number;
  name?: string;
  overview?: string;
  air_date?: string | null;
  episode_number: number;
  season_number: number;
  runtime?: number | null;
  still_path?: string | null;
  vote_average?: number;
};

const WATCH_STATUSES: WatchStatus[] = [
  "PLAN_TO_WATCH",
  "WATCHING",
  "COMPLETED",
  "ON_HOLD",
  "DROPPED",
];
const USER_ROLES: UserRole[] = ["USER", "EDITOR", "ADMIN"];
const RELEASE_TYPES: ReleaseType[] = [
  "CINEMA_RELEASE",
  "MOVIE_PREMIERE",
  "MOVIE_CATALOG",
  "TV_SERIES_PREMIERE",
  "TV_SEASON",
  "TV_EPISODE",
  "TV_CATALOG",
];
const PUBLICATION_STATUSES: PublicationStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const CONFIRMATION_STATUSES: ConfirmationStatus[] = [
  "ANNOUNCED",
  "CONFIRMED",
  "UNCONFIRMED",
  "POSTPONED",
  "CANCELLED",
];
const DATE_PRECISIONS: DatePrecision[] = ["EXACT", "MONTH", "QUARTER", "YEAR", "UNKNOWN"];

const ratingSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    tmdbId: { type: Number, required: true },
    mediaType: { type: String, required: true, enum: ["movie", "tv"] },
    seasonNumber: { type: Number, default: null },
    title: { type: String, required: true },
    posterPath: { type: String, default: null },
    releaseDate: { type: String, default: null },
    voteAverage: { type: Number, default: 0 },
    rating: { type: Number, required: true, min: 0.5, max: 10 },
  },
  { timestamps: true },
);

ratingSchema.index({ userId: 1, tmdbId: 1, mediaType: 1, seasonNumber: 1 }, { unique: true });

const watchlistSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    tmdbId: { type: Number, required: true },
    mediaType: { type: String, required: true, enum: ["movie", "tv"] },
    title: { type: String, required: true },
    posterPath: { type: String, default: null },
    releaseDate: { type: String, default: null },
    voteAverage: { type: Number, default: 0 },
  },
  { timestamps: true },
);

watchlistSchema.index({ userId: 1, tmdbId: 1, mediaType: 1 }, { unique: true });

const watchProgressSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    tmdbId: { type: Number, required: true },
    mediaType: { type: String, required: true, enum: ["movie", "tv"] },
    title: { type: String, required: true },
    posterPath: { type: String, default: null },
    releaseDate: { type: String, default: null },
    voteAverage: { type: Number, default: 0 },
    status: { type: String, required: true, enum: WATCH_STATUSES, default: "PLAN_TO_WATCH" },
    totalEpisodes: { type: Number, default: 0 },
    watchedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

watchProgressSchema.index({ userId: 1, tmdbId: 1, mediaType: 1 }, { unique: true });
watchProgressSchema.index({ userId: 1, status: 1, lastActivityAt: -1 });

const episodeProgressSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    tmdbId: { type: Number, required: true },
    title: { type: String, required: true },
    posterPath: { type: String, default: null },
    releaseDate: { type: String, default: null },
    voteAverage: { type: Number, default: 0 },
    seasonNumber: { type: Number, required: true },
    episodeNumber: { type: Number, required: true },
    episodeTitle: { type: String, default: "" },
    airDate: { type: String, default: null },
    runtime: { type: Number, default: null },
    stillPath: { type: String, default: null },
    watchedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

episodeProgressSchema.index(
  { userId: 1, tmdbId: 1, seasonNumber: 1, episodeNumber: 1 },
  { unique: true },
);
episodeProgressSchema.index({ userId: 1, watchedAt: -1 });

const releaseEventSchema = new Schema(
  {
    tmdbId: { type: Number, required: true, index: true },
    mediaType: { type: String, required: true, enum: ["movie", "tv"], index: true },
    title: { type: String, required: true, trim: true },
    posterPath: { type: String, default: null },
    backdropPath: { type: String, default: null },
    releaseDate: { type: String, default: null, index: true },
    voteAverage: { type: Number, default: 0 },
    popularity: { type: Number, default: 0, index: true },
    genreIds: { type: [Number], default: [] },
    provider: { type: String, required: true, trim: true, index: true },
    region: { type: String, required: true, uppercase: true, trim: true, index: true },
    datePrecision: { type: String, required: true, enum: DATE_PRECISIONS, default: "EXACT" },
    releaseYear: { type: Number, default: null, index: true },
    releaseMonth: { type: Number, default: null, index: true },
    releaseQuarter: { type: Number, default: null },
    releaseType: { type: String, required: true, enum: RELEASE_TYPES, index: true },
    publicationStatus: {
      type: String,
      required: true,
      enum: PUBLICATION_STATUSES,
      default: "DRAFT",
      index: true,
    },
    confirmationStatus: {
      type: String,
      required: true,
      enum: CONFIRMATION_STATUSES,
      default: "ANNOUNCED",
      index: true,
    },
    seasonNumber: { type: Number, default: null },
    episodeNumber: { type: Number, default: null },
    sourceUrl: { type: String, default: null },
    notes: { type: String, default: "" },
    lastVerifiedAt: { type: Date, default: null },
    createdBy: { type: String, required: true, index: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true },
);

releaseEventSchema.index({
  publicationStatus: 1,
  region: 1,
  provider: 1,
  releaseDate: 1,
  releaseYear: 1,
  releaseMonth: 1,
});
releaseEventSchema.index({
  tmdbId: 1,
  mediaType: 1,
  provider: 1,
  region: 1,
  releaseType: 1,
  releaseDate: 1,
  seasonNumber: 1,
  episodeNumber: 1,
});

const Rating = mongoose.models.Rating || mongoose.model("Rating", ratingSchema);
const WatchlistItem =
  mongoose.models.WatchlistItem || mongoose.model("WatchlistItem", watchlistSchema);
const WatchProgress =
  mongoose.models.WatchProgress || mongoose.model("WatchProgress", watchProgressSchema);
const EpisodeProgress =
  mongoose.models.EpisodeProgress || mongoose.model("EpisodeProgress", episodeProgressSchema);
const ReleaseEvent =
  mongoose.models.ReleaseEvent || mongoose.model("ReleaseEvent", releaseEventSchema);

function normalizeMedia(raw: TmdbMedia, fallbackMedia?: MediaType) {
  const mediaType = raw.media_type ?? fallbackMedia ?? (raw.title ? "movie" : "tv");

  return {
    id: raw.id,
    mediaType,
    title: raw.title ?? raw.name ?? "Untitled",
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    overview: raw.overview ?? "",
    releaseDate: raw.release_date ?? raw.first_air_date ?? null,
    popularity: raw.popularity ?? 0,
    voteAverage: raw.vote_average ?? 0,
    voteCount: raw.vote_count ?? 0,
    genreIds: raw.genre_ids ?? [],
  };
}

type NormalizedMedia = ReturnType<typeof normalizeMedia>;
type SearchSuggestionCandidate = NormalizedMedia & { suggestionSourceRank?: number };

const suggestionCache = new Map<
  string,
  { expiresAt: number; items: SearchSuggestionCandidate[] }
>();
const seasonCache = new Map<string, { expiresAt: number; data: any }>();

function normalizedSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleWithoutLeadingArticle(title: string) {
  return normalizedSearchText(title).replace(/^(the|a|an|der|die|das|ein|eine)\s+/, "");
}

function dateScore(date: string | null) {
  const parsed = date ? new Date(date).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function scoreSearchSuggestion(item: SearchSuggestionCandidate, query: string) {
  const normalizedQuery = normalizedSearchText(query);
  const title = normalizedSearchText(item.title);
  const titleWithoutArticle = titleWithoutLeadingArticle(item.title);
  const overview = normalizedSearchText(item.overview ?? "");
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  const titleWords = `${title} ${titleWithoutArticle}`.split(/\s+/).filter(Boolean);

  let matchScore = 0;

  if (title === normalizedQuery || titleWithoutArticle === normalizedQuery) matchScore += 180000;
  if (title.startsWith(normalizedQuery) || titleWithoutArticle.startsWith(normalizedQuery))
    matchScore += 150000;
  if (title.includes(normalizedQuery) || titleWithoutArticle.includes(normalizedQuery))
    matchScore += 110000;

  for (const word of queryWords) {
    if (titleWords.includes(word)) matchScore += 12000;
    if (titleWords.some((titleWord) => titleWord.startsWith(word))) matchScore += 26000;
    if (titleWords.some((titleWord) => titleWord.includes(word))) matchScore += 14000;
  }

  if (matchScore === 0 && overview.includes(normalizedQuery)) matchScore += 250;

  const releaseDate = dateScore(item.releaseDate);
  const now = Date.now();
  const twoYears = 1000 * 60 * 60 * 24 * 365 * 2;
  const releaseDistanceDays = releaseDate
    ? Math.abs(now - releaseDate) / (1000 * 60 * 60 * 24)
    : Infinity;
  const recencyBoost = releaseDate > now - twoYears ? 2500 : 0;
  const currentBoost =
    normalizedQuery.length >= 5
      ? releaseDistanceDays <= 60
        ? 70000
        : releaseDate > now - twoYears
          ? 15000
          : 0
      : 0;
  const popularity = Number(item.popularity ?? 0);
  const popularityBoost = Math.min(Math.log10(popularity + 1) * 12000, 45000);
  const sourceBoost =
    normalizedQuery.length >= 5 && item.suggestionSourceRank !== undefined
      ? Math.max(180000 - item.suggestionSourceRank * 12000, 0)
      : 0;

  return {
    matchScore: matchScore + popularityBoost + recencyBoost + currentBoost + sourceBoost,
    popularity,
    releaseDate,
    voteAverage: Number(item.voteAverage ?? 0),
    recencyBoost,
  };
}

function rankSearchSuggestions(items: SearchSuggestionCandidate[], query: string) {
  return [...items].sort((a, b) => {
    const aScore = scoreSearchSuggestion(a, query);
    const bScore = scoreSearchSuggestion(b, query);

    if (bScore.matchScore !== aScore.matchScore) return bScore.matchScore - aScore.matchScore;
    if (bScore.popularity !== aScore.popularity) return bScore.popularity - aScore.popularity;
    if (bScore.recencyBoost !== aScore.recencyBoost)
      return bScore.recencyBoost - aScore.recencyBoost;
    if (bScore.releaseDate !== aScore.releaseDate) return bScore.releaseDate - aScore.releaseDate;
    if (bScore.voteAverage !== aScore.voteAverage) return bScore.voteAverage - aScore.voteAverage;
    return a.title.localeCompare(b.title);
  });
}

async function searchTmdbSuggestions(query: string) {
  const cacheKey = normalizedSearchText(query);
  const cached = suggestionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  const searchParams = {
    query,
    page: 1,
    include_adult: false,
  };

  const expansionQueries =
    cacheKey.length === 4 ? SUGGESTION_NEXT_LETTERS.map((letter) => `${query}${letter}`) : [];

  const [multi, movies, tv, ...expanded] = await Promise.all([
    tmdb<any>("/search/multi", searchParams),
    tmdb<any>("/search/movie", searchParams),
    tmdb<any>("/search/tv", searchParams),
    ...expansionQueries.map((expandedQuery) =>
      tmdb<any>("/search/multi", {
        query: expandedQuery,
        page: 1,
        include_adult: false,
      }),
    ),
  ]);

  const seen = new Set<string>();
  const directResults = [
    ...(multi.results ?? []).filter(
      (item: TmdbMedia) => item.media_type === "movie" || item.media_type === "tv",
    ),
    ...(movies.results ?? []).map((item: TmdbMedia) => ({
      ...item,
      media_type: "movie" as MediaType,
    })),
    ...(tv.results ?? []).map((item: TmdbMedia) => ({ ...item, media_type: "tv" as MediaType })),
  ];

  const directCandidates = directResults.map((item, index) => ({
    ...normalizeMedia(item, item.media_type),
    suggestionSourceRank: index,
  }));

  const expandedCandidates = expanded.flatMap((result) =>
    (result.results ?? [])
      .filter((item: TmdbMedia) => item.media_type === "movie" || item.media_type === "tv")
      .map((item: TmdbMedia) => normalizeMedia(item) as SearchSuggestionCandidate),
  );

  const results: SearchSuggestionCandidate[] = [
    ...directCandidates.map((item) => ({
      ...item,
    })),
    ...expandedCandidates,
  ];

  const items = results.filter((item) => {
    const key = `${item.mediaType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.posterPath);
  });

  suggestionCache.set(cacheKey, {
    expiresAt: Date.now() + SUGGESTION_CACHE_TTL_MS,
    items,
  });

  return items;
}

function toSavedInput(input: any): SavedMedia {
  return {
    userId: input.userId,
    tmdbId: input.tmdbId,
    mediaType: input.mediaType,
    title: input.title,
    posterPath: input.posterPath ?? null,
    releaseDate: input.releaseDate ?? null,
    voteAverage: input.voteAverage ?? 0,
  };
}

function toProgressInput(input: any, userId: string) {
  return {
    ...toSavedInput({ ...input, userId }),
    status: WATCH_STATUSES.includes(input.status) ? input.status : "PLAN_TO_WATCH",
    totalEpisodes: Number(input.totalEpisodes ?? 0),
  };
}

function mapEpisode(raw: TmdbEpisode, watched?: any) {
  return {
    seasonNumber: raw.season_number,
    episodeNumber: raw.episode_number,
    name: raw.name ?? `Episode ${raw.episode_number}`,
    overview: raw.overview ?? "",
    airDate: raw.air_date ?? null,
    runtime: raw.runtime ?? null,
    stillPath: raw.still_path ?? null,
    voteAverage: raw.vote_average ?? 0,
    watched: Boolean(watched),
    watchedAt: watched?.watchedAt?.getTime?.() ?? null,
  };
}

function isEpisodeAvailable(episode: { airDate: string | null }) {
  if (!episode.airDate) return false;
  const airDate = new Date(episode.airDate).getTime();
  return Number.isFinite(airDate) && airDate <= Date.now();
}

async function getSeasonRaw(tvId: number, seasonNumber: number) {
  const key = `${tvId}:${seasonNumber}`;
  const cached = seasonCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const data = await tmdb<any>(`/tv/${tvId}/season/${seasonNumber}`);
  seasonCache.set(key, { expiresAt: Date.now() + 1000 * 60 * 30, data });
  return data;
}

async function getWatchedEpisodeMap(userId: string | null, tmdbId: number) {
  if (!userId || !hasDb()) return new Map<string, any>();
  const docs = await EpisodeProgress.find({ userId, tmdbId });
  return new Map(docs.map((doc: any) => [`${doc.seasonNumber}:${doc.episodeNumber}`, doc]));
}

async function getAvailableEpisodes(tvId: number) {
  const raw = await tmdb<any>(`/tv/${tvId}`);
  const seasons = (raw.seasons ?? [])
    .filter((season: any) => Number(season?.season_number ?? 0) > 0)
    .sort((a: any, b: any) => Number(a.season_number ?? 0) - Number(b.season_number ?? 0));

  const seasonDetails = await Promise.all(
    seasons.map((season: any) => getSeasonRaw(tvId, Number(season.season_number))),
  );
  return seasonDetails
    .flatMap((season) => (season.episodes ?? []).map((episode: TmdbEpisode) => mapEpisode(episode)))
    .filter(isEpisodeAvailable)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
}

async function enrichWatchProgress(doc: any, includeNextEpisode = false) {
  const watchedEpisodes =
    doc.mediaType === "tv"
      ? await EpisodeProgress.countDocuments({ userId: doc.userId, tmdbId: doc.tmdbId })
      : doc.status === "COMPLETED"
        ? 1
        : 0;

  let totalEpisodes = Number(doc.totalEpisodes ?? 0);
  let nextEpisode = null;

  if (includeNextEpisode && doc.mediaType === "tv") {
    try {
      const [availableEpisodes, watchedMap] = await Promise.all([
        getAvailableEpisodes(doc.tmdbId),
        getWatchedEpisodeMap(doc.userId, doc.tmdbId),
      ]);
      totalEpisodes = Math.max(totalEpisodes, availableEpisodes.length);
      nextEpisode =
        availableEpisodes.find(
          (episode) => !watchedMap.has(`${episode.seasonNumber}:${episode.episodeNumber}`),
        ) ?? null;
    } catch {
      nextEpisode = null;
    }
  }

  return {
    id: doc._id.toString(),
    tmdbId: doc.tmdbId,
    mediaType: doc.mediaType,
    title: doc.title,
    posterPath: doc.posterPath ?? null,
    releaseDate: doc.releaseDate ?? null,
    voteAverage: doc.voteAverage ?? 0,
    status: doc.status,
    totalEpisodes,
    watchedEpisodes,
    watchedAt: doc.watchedAt?.getTime?.() ?? null,
    lastActivityAt: doc.lastActivityAt?.getTime?.() ?? doc.updatedAt?.getTime?.() ?? Date.now(),
    nextEpisode,
  };
}

async function upsertWatchProgress(input: any, userId: string, patch: Record<string, unknown>) {
  const base = toProgressInput(input, userId);
  const doc = await WatchProgress.findOneAndUpdate(
    { userId, tmdbId: base.tmdbId, mediaType: base.mediaType },
    {
      $set: {
        ...base,
        ...patch,
        lastActivityAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true },
  );
  return doc;
}

function mapSaved(doc: any) {
  return {
    id: doc._id.toString(),
    tmdbId: doc.tmdbId,
    mediaType: doc.mediaType,
    title: doc.title,
    posterPath: doc.posterPath ?? null,
    releaseDate: doc.releaseDate ?? null,
    voteAverage: doc.voteAverage ?? 0,
    addedAt: doc.createdAt?.getTime?.() ?? Date.now(),
  };
}

function mapRating(doc: any) {
  return {
    ...mapSaved(doc),
    seasonNumber: doc.seasonNumber ?? null,
    rating: doc.rating,
    ratedAt: doc.updatedAt?.getTime?.() ?? doc.createdAt?.getTime?.() ?? Date.now(),
  };
}

function parseAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email?: string | null) {
  return Boolean(email && parseAdminEmails().includes(email.toLowerCase()));
}

async function getUserProfile(user: { id: string; name: string; email: string }) {
  const doc = hasDb() ? await User.findById(user.id) : null;
  const role: UserRole =
    doc && USER_ROLES.includes(doc.role) ? doc.role : isAdminEmail(user.email) ? "ADMIN" : "USER";

  if (doc && isAdminEmail(user.email) && doc.role !== "ADMIN") {
    doc.role = "ADMIN";
    await doc.save();
  }

  return {
    id: user.id,
    name: doc?.name ?? user.name,
    email: doc?.email ?? user.email,
    role,
    isAdmin: role === "ADMIN",
  };
}

async function requireAdmin(context: any) {
  const user = requireAuth(context);
  const profile = await getUserProfile(user);
  if (profile.role !== "ADMIN" && profile.role !== "EDITOR") {
    throw new Error("Admin access required.");
  }
  return profile;
}

function normalizeUserRating(value: unknown) {
  const rating = Math.round(Number(value) * 2) / 2;
  if (!Number.isFinite(rating) || rating < 0.5 || rating > 10) {
    throw new Error("Bewertung muss zwischen 0.5 und 10 liegen.");
  }
  return rating;
}

function averageRating(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

async function syncSeriesRatingFromSeasons(userId: string, tmdbId: number) {
  const seasonRatings = await Rating.find({
    userId,
    tmdbId,
    mediaType: "tv",
    seasonNumber: { $ne: null },
  }).sort({ seasonNumber: 1 });

  const rating = averageRating(seasonRatings.map((entry: any) => Number(entry.rating)));
  if (rating == null) {
    await Rating.deleteOne({ userId, tmdbId, mediaType: "tv", seasonNumber: null });
    return null;
  }

  const source = seasonRatings[0];
  return Rating.findOneAndUpdate(
    { userId, tmdbId, mediaType: "tv", seasonNumber: null },
    {
      $set: {
        userId,
        tmdbId,
        mediaType: "tv",
        seasonNumber: null,
        title: source.title,
        posterPath: source.posterPath ?? null,
        releaseDate: source.releaseDate ?? null,
        voteAverage: source.voteAverage ?? 0,
        rating,
      },
    },
    { upsert: true, new: true },
  );
}

async function markMovieCompletedFromRating(input: any, userId: string) {
  return upsertWatchProgress({ ...input, status: "COMPLETED", totalEpisodes: 1 }, userId, {
    status: "COMPLETED",
    totalEpisodes: 1,
    watchedAt: new Date(),
  });
}

async function markSeasonCompletedFromRating(input: any, userId: string) {
  const seasonNumber = Number(input.seasonNumber);
  if (!Number.isFinite(seasonNumber)) return null;

  const [seasonRaw, availableEpisodes] = await Promise.all([
    getSeasonRaw(Number(input.tmdbId), seasonNumber),
    getAvailableEpisodes(Number(input.tmdbId)),
  ]);
  const seasonEpisodes = ((seasonRaw.episodes ?? []) as TmdbEpisode[])
    .map((episode: TmdbEpisode) => mapEpisode(episode))
    .filter(isEpisodeAvailable);

  const watchedAt = new Date();
  const operations = seasonEpisodes.map((episode) => ({
    updateOne: {
      filter: {
        userId,
        tmdbId: input.tmdbId,
        seasonNumber,
        episodeNumber: episode.episodeNumber,
      },
      update: {
        $set: {
          userId,
          tmdbId: input.tmdbId,
          title: input.title,
          posterPath: input.posterPath ?? null,
          releaseDate: input.releaseDate ?? null,
          voteAverage: input.voteAverage ?? 0,
          seasonNumber,
          episodeNumber: episode.episodeNumber,
          episodeTitle: episode.name,
          airDate: episode.airDate ?? null,
          runtime: episode.runtime ?? null,
          stillPath: episode.stillPath ?? null,
          watchedAt,
        },
      },
      upsert: true,
    },
  }));
  if (operations.length) await EpisodeProgress.bulkWrite(operations);

  const watchedCount = await EpisodeProgress.countDocuments({ userId, tmdbId: input.tmdbId });
  const totalEpisodes = availableEpisodes.length;
  const status =
    watchedCount > 0 && totalEpisodes > 0 && watchedCount >= totalEpisodes
      ? "COMPLETED"
      : "WATCHING";

  return upsertWatchProgress({ ...input, mediaType: "tv", status, totalEpisodes }, userId, {
    status,
    totalEpisodes,
    watchedAt: status === "COMPLETED" ? watchedAt : null,
  });
}

async function connectDb() {
  if (!process.env.MONGODB_URI) {
    console.warn("MONGODB_URI missing. TMDB queries work, MongoDB user data is disabled.");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB ?? "binge_verse",
    });
    console.log("MongoDB connected");
  } catch (error) {
    console.warn(
      "MongoDB connection failed. Continuing without MongoDB-backed features.",
      error instanceof Error ? error.message : error,
    );
  }
}

function hasDb() {
  return mongoose.connection.readyState === 1;
}

function assertDb() {
  if (!hasDb()) {
    throw new Error("MongoDB is not connected. Set MONGODB_URI in .env.");
  }
}

function parseCookies(cookieHeader?: string) {
  if (!cookieHeader) return {} as Record<string, string>;

  return cookieHeader.split(";").reduce<Record<string, string>>((acc, rawPair) => {
    const pair = rawPair.trim();
    if (!pair) return acc;
    const equalIndex = pair.indexOf("=");
    const key = equalIndex >= 0 ? pair.slice(0, equalIndex) : pair;
    const value = equalIndex >= 0 ? decodeURIComponent(pair.slice(equalIndex + 1)) : "";
    acc[key] = value;
    return acc;
  }, {});
}

function getAuthUserFromRequest(request: any) {
  const cookieHeader =
    typeof request?.headers?.get === "function"
      ? (request.headers.get("cookie") ?? "")
      : (request?.headers?.cookie ?? "");

  const cookies = parseCookies(cookieHeader);
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string; name?: string };
    return { id: payload.sub, email: payload.email, name: payload.name ?? "" };
  } catch {
    return null;
  }
}

function setAuthCookie(response: any, user: { id: string; name: string; email: string }) {
  if (!response || typeof response.setHeader !== "function") return;

  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: "7d",
  });
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secureFlag}`,
  );
}

function clearAuthCookie(response: any) {
  if (!response || typeof response.setHeader !== "function") return;

  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`,
  );
}

function requireAuth(context: any) {
  const user = context?.user ?? getAuthUserFromRequest(context?.request);
  if (!user) throw new Error("Authentication required.");
  return user;
}

function authorizeUser(context: any, userId?: string | null) {
  const user = context?.user ?? getAuthUserFromRequest(context?.request);
  if (!user) throw new Error("Authentication required.");
  if (userId && user.id !== userId) throw new Error("Unauthorized.");
  return user.id;
}

async function tmdb<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
) {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY missing. Set it in .env.");

  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", process.env.TMDB_LANGUAGE ?? "de-DE");

  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(name, String(value));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TMDB request failed ${response.status}: ${path}`);
  }

  return response.json() as Promise<T>;
}

async function getOmdbRatings(imdbId?: string | null) {
  const omdbKey = process.env.OMDB_API_KEY;
  if (!imdbId || !omdbKey) return { imdbRating: null, rottenTomatoesRating: null };

  try {
    const url = new URL("https://www.omdbapi.com/");
    url.searchParams.set("i", imdbId);
    url.searchParams.set("apikey", omdbKey);
    const data = await fetch(url).then((res) => res.json());
    const rt = (data.Ratings ?? []).find((rating: any) => rating.Source === "Rotten Tomatoes");

    return {
      imdbRating: data.imdbRating && data.imdbRating !== "N/A" ? data.imdbRating : null,
      rottenTomatoesRating: rt?.Value ?? null,
    };
  } catch {
    return { imdbRating: null, rottenTomatoesRating: null };
  }
}

const typeDefs = /* GraphQL */ `
  enum MediaType {
    movie
    tv
  }

  enum WatchStatus {
    PLAN_TO_WATCH
    WATCHING
    COMPLETED
    ON_HOLD
    DROPPED
  }

  enum UserRole {
    USER
    EDITOR
    ADMIN
  }

  enum ReleaseType {
    CINEMA_RELEASE
    MOVIE_PREMIERE
    MOVIE_CATALOG
    TV_SERIES_PREMIERE
    TV_SEASON
    TV_EPISODE
    TV_CATALOG
  }

  enum PublicationStatus {
    DRAFT
    PUBLISHED
    ARCHIVED
  }

  enum ConfirmationStatus {
    ANNOUNCED
    CONFIRMED
    UNCONFIRMED
    POSTPONED
    CANCELLED
  }

  enum DatePrecision {
    EXACT
    MONTH
    QUARTER
    YEAR
    UNKNOWN
  }

  type MediaItem {
    id: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    backdropPath: String
    overview: String!
    releaseDate: String
    popularity: Float!
    voteAverage: Float!
    voteCount: Int!
    genreIds: [Int!]!
  }

  type Genre {
    id: Int!
    name: String!
  }

  type CastMember {
    id: Int!
    name: String!
    character: String
    profilePath: String
  }

  type Provider {
    providerId: Int!
    providerName: String!
    logoPath: String
  }

  type WatchProviders {
    link: String
    region: String!
    flatrate: [Provider!]!
    rent: [Provider!]!
    buy: [Provider!]!
  }

  type Season {
    seasonNumber: Int!
    name: String!
    overview: String!
    posterPath: String
    airDate: String
    episodeCount: Int!
  }

  type Episode {
    seasonNumber: Int!
    episodeNumber: Int!
    name: String!
    overview: String!
    airDate: String
    runtime: Int
    stillPath: String
    voteAverage: Float!
    watched: Boolean!
    watchedAt: Float
  }

  type SeasonDetails {
    seasonNumber: Int!
    name: String!
    overview: String!
    posterPath: String
    airDate: String
    episodeCount: Int!
    episodes: [Episode!]!
  }

  type MovieDetails {
    id: Int!
    mediaType: MediaType!
    title: String!
    tagline: String
    overview: String!
    posterPath: String
    backdropPath: String
    releaseDate: String
    runtime: Int
    numberOfSeasons: Int
    numberOfEpisodes: Int
    genres: [Genre!]!
    seasons: [Season!]!
    voteAverage: Float!
    voteCount: Int!
    imdbRating: String
    rottenTomatoesRating: String
    imdbId: String
    cast: [CastMember!]!
    recommendations: [MediaItem!]!
    watchProviders: WatchProviders
    trailerKey: String
    myRating: Float
    inWatchlist: Boolean!
  }

  type HomeData {
    featured: MediaItem
    trending: [MediaItem!]!
    trendingMovies: [MediaItem!]!
    trendingTv: [MediaItem!]!
    popularMovies: [MediaItem!]!
    popularTv: [MediaItem!]!
    topMovies: [MediaItem!]!
    topTv: [MediaItem!]!
  }

  type MediaItemConnection {
    results: [MediaItem!]!
    page: Int!
    totalPages: Int!
    totalResults: Int!
  }

  type UserProfile {
    id: ID!
    name: String!
    email: String!
    role: UserRole!
    isAdmin: Boolean!
  }

  type AuthPayload {
    user: UserProfile!
  }

  type SavedItem {
    id: ID!
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float!
    addedAt: Float!
  }

  type RatingEntry {
    id: ID!
    tmdbId: Int!
    mediaType: MediaType!
    seasonNumber: Int
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float!
    addedAt: Float!
    rating: Float!
    ratedAt: Float!
  }

  type WatchProgress {
    id: ID!
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float!
    status: WatchStatus!
    totalEpisodes: Int!
    watchedEpisodes: Int!
    watchedAt: Float
    lastActivityAt: Float!
    nextEpisode: Episode
  }

  type ReleaseEvent {
    id: ID!
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    backdropPath: String
    voteAverage: Float!
    popularity: Float!
    genreIds: [Int!]!
    provider: String!
    region: String!
    releaseDate: String
    datePrecision: DatePrecision!
    releaseYear: Int
    releaseMonth: Int
    releaseQuarter: Int
    releaseType: ReleaseType!
    publicationStatus: PublicationStatus!
    confirmationStatus: ConfirmationStatus!
    seasonNumber: Int
    episodeNumber: Int
    sourceUrl: String
    notes: String!
    createdBy: String!
    updatedBy: String!
    createdAt: Float!
    updatedAt: Float!
    isWatchlisted: Boolean!
  }

  type ReleaseEventConnection {
    items: [ReleaseEvent!]!
    total: Int!
  }

  type AdminReleaseStats {
    releasesThisMonth: Int!
    upcomingReleases: Int!
    drafts: Int!
    unconfirmed: Int!
    recentlyEdited: [ReleaseEvent!]!
  }

  input RegisterInput {
    name: String!
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input SavedItemInput {
    userId: String
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
  }

  input RatingInput {
    userId: String
    tmdbId: Int!
    mediaType: MediaType!
    seasonNumber: Int
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
    rating: Float!
  }

  input WatchProgressInput {
    userId: String
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
    status: WatchStatus!
    totalEpisodes: Int
  }

  input ReleaseEventInput {
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    backdropPath: String
    voteAverage: Float
    popularity: Float
    genreIds: [Int!]
    provider: String!
    region: String!
    releaseDate: String
    datePrecision: DatePrecision!
    releaseYear: Int
    releaseMonth: Int
    releaseQuarter: Int
    releaseType: ReleaseType!
    publicationStatus: PublicationStatus
    confirmationStatus: ConfirmationStatus!
    seasonNumber: Int
    episodeNumber: Int
    sourceUrl: String
    notes: String
  }

  input ReleaseEventPatchInput {
    tmdbId: Int
    mediaType: MediaType
    title: String
    posterPath: String
    backdropPath: String
    voteAverage: Float
    popularity: Float
    genreIds: [Int!]
    provider: String
    region: String
    releaseDate: String
    datePrecision: DatePrecision
    releaseYear: Int
    releaseMonth: Int
    releaseQuarter: Int
    releaseType: ReleaseType
    publicationStatus: PublicationStatus
    confirmationStatus: ConfirmationStatus
    seasonNumber: Int
    episodeNumber: Int
    sourceUrl: String
    notes: String
  }

  input ReleaseEventFilterInput {
    region: String
    providers: [String!]
    mediaType: MediaType
    releaseTypes: [ReleaseType!]
    confirmationStatuses: [ConfirmationStatus!]
    publicationStatus: PublicationStatus
    genreIds: [Int!]
    tmdbId: Int
    year: Int
    month: Int
    fromDate: String
    toDate: String
    datePrecision: DatePrecision
    sort: String
    limit: Int
    offset: Int
  }

  input EpisodeProgressInput {
    userId: String
    tmdbId: Int!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
    totalEpisodes: Int
    seasonNumber: Int!
    episodeNumber: Int!
    episodeTitle: String
    airDate: String
    runtime: Int
    stillPath: String
    watched: Boolean!
  }

  input SeasonEpisodeInput {
    episodeNumber: Int!
    episodeTitle: String
    airDate: String
    runtime: Int
    stillPath: String
  }

  input SeasonProgressInput {
    userId: String
    tmdbId: Int!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
    totalEpisodes: Int
    seasonNumber: Int!
    watched: Boolean!
    episodes: [SeasonEpisodeInput!]!
  }

  type Query {
    me: UserProfile
    home: HomeData!
    discover(media: MediaType!, genre: String, year: String, sort: String, page: Int): [MediaItem!]!
    discoverPage(
      media: MediaType!
      genre: String
      year: String
      sort: String
      page: Int
    ): MediaItemConnection!
    search(query: String!, page: Int): [MediaItem!]!
    searchPage(query: String!, page: Int): MediaItemConnection!
    searchSuggestions(query: String!, limit: Int): [MediaItem!]!
    genres(media: MediaType!): [Genre!]!
    details(media: MediaType!, id: Int!, userId: String): MovieDetails!
    recommendations(media: MediaType!, id: Int!): [MediaItem!]!
    watchlist(userId: String!): [SavedItem!]!
    ratings(userId: String!): [RatingEntry!]!
    seasonDetails(tvId: Int!, seasonNumber: Int!, userId: String): SeasonDetails!
    watchProgress(userId: String!, tmdbId: Int!, mediaType: MediaType!): WatchProgress
    watchProgressList(userId: String!, mediaType: MediaType, status: WatchStatus): [WatchProgress!]!
    continueWatching(userId: String!): [WatchProgress!]!
    releaseEvents(filter: ReleaseEventFilterInput): ReleaseEventConnection!
    releaseEventsByTitle(tmdbId: Int!, mediaType: MediaType!, region: String): [ReleaseEvent!]!
    watchlistReleaseEvents(userId: String!, region: String): [ReleaseEvent!]!
    adminReleaseEvents(filter: ReleaseEventFilterInput): ReleaseEventConnection!
    adminReleaseStats: AdminReleaseStats!
  }

  type Mutation {
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    logout: Boolean!
    addWatchlist(input: SavedItemInput!): SavedItem!
    removeWatchlist(userId: String!, tmdbId: Int!, mediaType: MediaType!): Boolean!
    rateMovie(input: RatingInput!): RatingEntry!
    removeRating(userId: String!, tmdbId: Int!, mediaType: MediaType!, seasonNumber: Int): Boolean!
    setWatchStatus(input: WatchProgressInput!): WatchProgress!
    removeWatchProgress(userId: String!, tmdbId: Int!, mediaType: MediaType!): Boolean!
    setEpisodeWatched(input: EpisodeProgressInput!): WatchProgress!
    setSeasonWatched(input: SeasonProgressInput!): WatchProgress!
    createReleaseEvent(input: ReleaseEventInput!): ReleaseEvent!
    updateReleaseEvent(id: ID!, input: ReleaseEventPatchInput!): ReleaseEvent!
    deleteReleaseEvent(id: ID!): Boolean!
    bulkCreateReleaseEvents(inputs: [ReleaseEventInput!]!): [ReleaseEvent!]!
    bulkUpdateReleaseEvents(ids: [ID!]!, input: ReleaseEventPatchInput!): [ReleaseEvent!]!
    bulkDeleteReleaseEvents(ids: [ID!]!): Boolean!
  }
`;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, enum: USER_ROLES, default: "USER", index: true },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

const resolvers = {
  Query: {
    me: async (_root: unknown, _args: any, context: any) => {
      const user = context?.user ?? getAuthUserFromRequest(context?.request);
      if (!user) return null;
      return getUserProfile(user);
    },
    home: async () => {
      const [trendDay, trendMovie, trendTv, popMovie, popTv, topMovie, topTv] = await Promise.all([
        tmdb<any>("/trending/all/day"),
        tmdb<any>("/trending/movie/week"),
        tmdb<any>("/trending/tv/week"),
        tmdb<any>("/movie/popular"),
        tmdb<any>("/tv/popular"),
        tmdb<any>("/movie/top_rated"),
        tmdb<any>("/tv/top_rated"),
      ]);

      const pick = (result: any, fallback?: MediaType) =>
        (result.results ?? [])
          .map((item: TmdbMedia) => normalizeMedia(item, fallback))
          .filter((item: any) => item.posterPath);

      const sortHomeItems = (items: any[]) =>
        [...items].sort((a, b) => {
          const popularityDelta = Number(b.popularity ?? 0) - Number(a.popularity ?? 0);
          if (popularityDelta !== 0) return popularityDelta;
          const ratingDelta = Number(b.voteAverage ?? 0) - Number(a.voteAverage ?? 0);
          if (ratingDelta !== 0) return ratingDelta;
          const releaseDelta =
            (b.releaseDate ? new Date(b.releaseDate).getTime() : 0) -
            (a.releaseDate ? new Date(a.releaseDate).getTime() : 0);
          return releaseDelta;
        });

      const trending = sortHomeItems(pick(trendDay));
      const featured =
        trending.find((item: any) => item.backdropPath && item.overview) ?? trending[0] ?? null;

      return {
        featured,
        trending,
        trendingMovies: sortHomeItems(pick(trendMovie, "movie")),
        trendingTv: sortHomeItems(pick(trendTv, "tv")),
        popularMovies: sortHomeItems(pick(popMovie, "movie")),
        popularTv: sortHomeItems(pick(popTv, "tv")),
        topMovies: sortHomeItems(pick(topMovie, "movie")),
        topTv: sortHomeItems(pick(topTv, "tv")),
      };
    },
    discover: async (_: unknown, args: any) => {
      const params: Record<string, string | number | boolean | undefined> = {
        sort_by:
          args.media === "tv" && args.sort?.startsWith?.("primary_release_date")
            ? args.sort.replace("primary_release_date", "first_air_date")
            : args.sort || "popularity.desc",
        page: args.page ?? 1,
        include_adult: false,
      };

      if (args.genre) params.with_genres = args.genre;
      if (args.year) {
        if (args.media === "movie") params.primary_release_year = args.year;
        else params.first_air_date_year = args.year;
      }

      const result = await tmdb<any>(`/discover/${args.media}`, params);
      return (result.results ?? [])
        .map((item: TmdbMedia) => normalizeMedia(item, args.media))
        .filter((item: any) => item.posterPath);
    },
    discoverPage: async (_: unknown, args: any) => {
      const page = Math.max(1, Number(args.page ?? 1));
      const params: Record<string, string | number | boolean | undefined> = {
        sort_by:
          args.media === "tv" && args.sort?.startsWith?.("primary_release_date")
            ? args.sort.replace("primary_release_date", "first_air_date")
            : args.sort || "popularity.desc",
        page,
        include_adult: false,
      };

      if (args.genre) params.with_genres = args.genre;
      if (args.year) {
        if (args.media === "movie") params.primary_release_year = args.year;
        else params.first_air_date_year = args.year;
      }

      const result = await tmdb<any>(`/discover/${args.media}`, params);
      return {
        results: (result.results ?? [])
          .map((item: TmdbMedia) => normalizeMedia(item, args.media))
          .filter((item: any) => item.posterPath),
        page: result.page ?? page,
        totalPages: Math.min(Number(result.total_pages ?? page), 500),
        totalResults: Number(result.total_results ?? 0),
      };
    },
    search: async (_: unknown, args: any) => {
      if (!args.query.trim()) return [];
      const result = await tmdb<any>("/search/multi", {
        query: args.query,
        page: args.page ?? 1,
        include_adult: false,
      });

      return (result.results ?? [])
        .filter((item: TmdbMedia) => item.media_type === "movie" || item.media_type === "tv")
        .map((item: TmdbMedia) => normalizeMedia(item))
        .filter((item: any) => item.posterPath);
    },
    searchPage: async (_: unknown, args: any) => {
      if (!args.query.trim()) {
        return { results: [], page: 1, totalPages: 1, totalResults: 0 };
      }
      const page = Math.max(1, Number(args.page ?? 1));
      const result = await tmdb<any>("/search/multi", {
        query: args.query,
        page,
        include_adult: false,
      });
      return {
        results: (result.results ?? [])
          .filter((item: TmdbMedia) => item.media_type === "movie" || item.media_type === "tv")
          .map((item: TmdbMedia) => normalizeMedia(item))
          .filter((item: any) => item.posterPath),
        page: result.page ?? page,
        totalPages: Math.min(Number(result.total_pages ?? page), 500),
        totalResults: Number(result.total_results ?? 0),
      };
    },
    searchSuggestions: async (_: unknown, args: any) => {
      const query = args.query.trim();
      if (query.length < 2) return [];

      const limit = Math.min(Math.max(Number(args.limit ?? 8), 1), 12);
      const results = await searchTmdbSuggestions(query);
      return rankSearchSuggestions(results, query).slice(0, limit);
    },
    genres: async (_: unknown, args: any) => {
      const result = await tmdb<any>(`/genre/${args.media}/list`);
      return result.genres ?? [];
    },
    details: async (_: unknown, args: any, context: any) => {
      const authUser = context?.user ?? getAuthUserFromRequest(context?.request);
      if (args.userId && authUser && args.userId !== authUser.id) {
        throw new Error("Unauthorized.");
      }

      const raw = await tmdb<any>(`/${args.media}/${args.id}`, {
        append_to_response: "credits,recommendations,videos,watch/providers,external_ids",
      });

      const imdbId = raw.external_ids?.imdb_id ?? raw.imdb_id ?? null;
      const externalRatings = await getOmdbRatings(imdbId);
      const providers = raw["watch/providers"]?.results ?? {};
      const regionKey = providers[process.env.TMDB_REGION ?? "DE"]
        ? (process.env.TMDB_REGION ?? "DE")
        : providers.US
          ? "US"
          : Object.keys(providers)[0];
      const region = regionKey ? providers[regionKey] : null;
      const trailer = (raw.videos?.results ?? []).find(
        (video: any) =>
          video.site === "YouTube" && (video.type === "Trailer" || video.type === "Teaser"),
      );

      let myRating: number | null = null;
      let inWatchlist = false;
      const effectiveUserId = authUser ? authUser.id : null;

      if (effectiveUserId && hasDb()) {
        const [rating, saved] = await Promise.all([
          Rating.findOne({
            userId: effectiveUserId,
            tmdbId: args.id,
            mediaType: args.media,
            seasonNumber: null,
          }),
          WatchlistItem.exists({ userId: effectiveUserId, tmdbId: args.id, mediaType: args.media }),
        ]);
        myRating = rating?.rating ?? null;
        inWatchlist = Boolean(saved);
      }

      return {
        id: raw.id,
        mediaType: args.media,
        title: raw.title ?? raw.name ?? "Untitled",
        tagline: raw.tagline ?? "",
        overview: raw.overview ?? "",
        posterPath: raw.poster_path ?? null,
        backdropPath: raw.backdrop_path ?? null,
        releaseDate: raw.release_date ?? raw.first_air_date ?? null,
        runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
        numberOfSeasons: raw.number_of_seasons ?? null,
        numberOfEpisodes: raw.number_of_episodes ?? null,
        genres: raw.genres ?? [],
        seasons: (raw.seasons ?? [])
          .filter((season: any) => Number(season?.season_number ?? season?.seasonNumber ?? 0) !== 0)
          .map((season: any) => ({
            seasonNumber: season.season_number ?? season.seasonNumber ?? 0,
            name: season.name ?? `Staffel ${season.season_number ?? season.seasonNumber ?? ""}`,
            overview: season.overview ?? "",
            posterPath: season.poster_path ?? season.posterPath ?? null,
            airDate: season.air_date ?? season.airDate ?? null,
            episodeCount: season.episode_count ?? season.episodeCount ?? 0,
          })),
        voteAverage: raw.vote_average ?? 0,
        voteCount: raw.vote_count ?? 0,
        imdbId,
        ...externalRatings,
        cast: (raw.credits?.cast ?? []).slice(0, 12).map((member: any) => ({
          id: member.id,
          name: member.name,
          character: member.character,
          profilePath: member.profile_path ?? null,
        })),
        recommendations: (raw.recommendations?.results ?? [])
          .map((item: TmdbMedia) => normalizeMedia(item, args.media))
          .filter((item: any) => item.posterPath)
          .slice(0, 20),
        watchProviders: region
          ? {
              link: region.link ?? null,
              region: regionKey,
              flatrate: (region.flatrate ?? []).map(mapProvider),
              rent: (region.rent ?? []).map(mapProvider),
              buy: (region.buy ?? []).map(mapProvider),
            }
          : null,
        trailerKey: trailer?.key ?? null,
        myRating,
        inWatchlist,
      };
    },
    recommendations: async (_: unknown, args: any) => {
      const result = await tmdb<any>(`/${args.media}/${args.id}/recommendations`);
      return (result.results ?? [])
        .map((item: TmdbMedia) => normalizeMedia(item, args.media))
        .filter((item: any) => item.posterPath);
    },
    watchlist: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId);
      if (!hasDb()) return [];
      return WatchlistItem.find({ userId })
        .sort({ createdAt: -1 })
        .then((docs) => docs.map(mapSaved));
    },
    ratings: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId);
      if (!hasDb()) return [];
      return Rating.find({ userId })
        .sort({ updatedAt: -1 })
        .then((docs) => docs.map(mapRating));
    },
    seasonDetails: async (_: unknown, args: any, context: any) => {
      const authUser = context?.user ?? getAuthUserFromRequest(context?.request);
      if (args.userId && authUser && args.userId !== authUser.id) {
        throw new Error("Unauthorized.");
      }

      const watchedMap = await getWatchedEpisodeMap(authUser?.id ?? null, args.tvId);
      const raw = await getSeasonRaw(args.tvId, args.seasonNumber);
      const episodes = (raw.episodes ?? []).map((episode: TmdbEpisode) =>
        mapEpisode(episode, watchedMap.get(`${episode.season_number}:${episode.episode_number}`)),
      );

      return {
        seasonNumber: raw.season_number ?? args.seasonNumber,
        name: raw.name ?? `Staffel ${args.seasonNumber}`,
        overview: raw.overview ?? "",
        posterPath: raw.poster_path ?? null,
        airDate: raw.air_date ?? null,
        episodeCount: episodes.length,
        episodes,
      };
    },
    watchProgress: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId);
      if (!hasDb()) return null;
      const doc = await WatchProgress.findOne({
        userId,
        tmdbId: args.tmdbId,
        mediaType: args.mediaType,
      });
      return doc ? enrichWatchProgress(doc, true) : null;
    },
    watchProgressList: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId);
      if (!hasDb()) return [];
      const filter: Record<string, unknown> = { userId };
      if (args.mediaType) filter.mediaType = args.mediaType;
      if (args.status) filter.status = args.status;
      const docs = await WatchProgress.find(filter).sort({ lastActivityAt: -1 });
      return Promise.all(docs.map((doc) => enrichWatchProgress(doc, false)));
    },
    continueWatching: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId);
      if (!hasDb()) return [];
      const docs = await WatchProgress.find({ userId, mediaType: "tv", status: "WATCHING" })
        .sort({ lastActivityAt: -1 })
        .limit(10);
      const progress = await Promise.all(docs.map((doc) => enrichWatchProgress(doc, true)));
      return progress.filter((item) => item.nextEpisode);
    },
    releaseEvents: async (_: unknown, args: any, context: any) => {
      if (!hasDb()) return { items: [], total: 0 };
      const filterArgs = args.filter ?? {};
      const filter = buildReleaseFilter(filterArgs, true);
      const limit = Math.min(Number(filterArgs.limit ?? 60), 120);
      const offset = Math.max(Number(filterArgs.offset ?? 0), 0);
      const sort: Record<string, 1 | -1> =
        filterArgs.sort === "popularity"
          ? { popularity: -1, releaseDate: 1 }
          : filterArgs.sort === "newest"
            ? { createdAt: -1 }
            : { releaseDate: 1, releaseYear: 1, releaseMonth: 1, popularity: -1 };
      const authUser = context?.user ?? getAuthUserFromRequest(context?.request);
      const watchlistDocs =
        authUser && hasDb()
          ? await WatchlistItem.find({ userId: authUser.id }).select("tmdbId mediaType")
          : [];
      const watchlistMatches = new Set(
        watchlistDocs.map((doc: any) => `${doc.mediaType}-${doc.tmdbId}`),
      );
      const [items, total] = await Promise.all([
        ReleaseEvent.find(filter).sort(sort).skip(offset).limit(limit),
        ReleaseEvent.countDocuments(filter),
      ]);
      return { items: items.map((doc) => mapReleaseEvent(doc, watchlistMatches)), total };
    },
    releaseEventsByTitle: async (_: unknown, args: any, context: any) => {
      if (!hasDb()) return [];
      const filter: Record<string, unknown> = {
        tmdbId: args.tmdbId,
        mediaType: args.mediaType,
        publicationStatus: "PUBLISHED",
      };
      if (args.region) filter.region = String(args.region).toUpperCase();
      const authUser = context?.user ?? getAuthUserFromRequest(context?.request);
      const watchlistMatches = new Set<string>();
      if (authUser) {
        const saved = await WatchlistItem.exists({
          userId: authUser.id,
          tmdbId: args.tmdbId,
          mediaType: args.mediaType,
        });
        if (saved) watchlistMatches.add(`${args.mediaType}-${args.tmdbId}`);
      }
      const docs = await ReleaseEvent.find(filter)
        .sort({ releaseDate: 1, releaseYear: 1, releaseMonth: 1 })
        .limit(12);
      return docs.map((doc) => mapReleaseEvent(doc, watchlistMatches));
    },
    watchlistReleaseEvents: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId);
      if (!hasDb()) return [];
      const saved = await WatchlistItem.find({ userId }).select("tmdbId mediaType");
      if (!saved.length) return [];
      const pairs = saved.map((item: any) => ({ tmdbId: item.tmdbId, mediaType: item.mediaType }));
      const filter = {
        publicationStatus: "PUBLISHED",
        region: String(args.region ?? "DE").toUpperCase(),
        $or: pairs,
      };
      const docs = await ReleaseEvent.find(filter)
        .sort({ releaseDate: 1, releaseYear: 1, releaseMonth: 1 })
        .limit(20);
      const matches = new Set(saved.map((item: any) => `${item.mediaType}-${item.tmdbId}`));
      return docs.map((doc) => mapReleaseEvent(doc, matches));
    },
    adminReleaseEvents: async (_: unknown, args: any, context: any) => {
      await requireAdmin(context);
      if (!hasDb()) return { items: [], total: 0 };
      const filterArgs = args.filter ?? {};
      const filter = buildReleaseFilter(filterArgs, false);
      const limit = Math.min(Number(filterArgs.limit ?? 80), 200);
      const offset = Math.max(Number(filterArgs.offset ?? 0), 0);
      const sort: Record<string, 1 | -1> =
        filterArgs.sort === "newest" ? { updatedAt: -1 } : { releaseDate: 1, updatedAt: -1 };
      const [items, total] = await Promise.all([
        ReleaseEvent.find(filter).sort(sort).skip(offset).limit(limit),
        ReleaseEvent.countDocuments(filter),
      ]);
      return { items: items.map((doc) => mapReleaseEvent(doc)), total };
    },
    adminReleaseStats: async (_: unknown, _args: any, context: any) => {
      await requireAdmin(context);
      if (!hasDb()) {
        return {
          releasesThisMonth: 0,
          upcomingReleases: 0,
          drafts: 0,
          unconfirmed: 0,
          recentlyEdited: [],
        };
      }
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;
      const today = now.toISOString().slice(0, 10);
      const [releasesThisMonth, upcomingReleases, drafts, unconfirmed, recentlyEdited] =
        await Promise.all([
          ReleaseEvent.countDocuments({ releaseYear: year, releaseMonth: month }),
          ReleaseEvent.countDocuments({
            publicationStatus: "PUBLISHED",
            $or: [{ releaseDate: { $gte: today } }, { datePrecision: { $ne: "EXACT" } }],
          }),
          ReleaseEvent.countDocuments({ publicationStatus: "DRAFT" }),
          ReleaseEvent.countDocuments({ confirmationStatus: "UNCONFIRMED" }),
          ReleaseEvent.find({}).sort({ updatedAt: -1 }).limit(8),
        ]);
      return {
        releasesThisMonth,
        upcomingReleases,
        drafts,
        unconfirmed,
        recentlyEdited: recentlyEdited.map((doc) => mapReleaseEvent(doc)),
      };
    },
  },
  Mutation: {
    register: async (_root: unknown, args: any, context: any) => {
      assertDb();
      const name = String(args.input.name ?? "").trim();
      const email = String(args.input.email ?? "")
        .trim()
        .toLowerCase();
      const password = String(args.input.password ?? "");

      if (!name || !email || password.length < 6) {
        throw new Error(
          "Bitte gib einen Namen, eine gültige E-Mail und ein Passwort mit mindestens 6 Zeichen ein.",
        );
      }

      const existing = await User.findOne({ email });
      if (existing) {
        throw new Error("Ein Konto mit dieser E-Mail existiert bereits.");
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({
        name,
        email,
        passwordHash,
        role: isAdminEmail(email) ? "ADMIN" : "USER",
      });
      const safeUser = { id: user._id.toString(), name: user.name, email: user.email };
      setAuthCookie(context.response, safeUser);
      return { user: await getUserProfile(safeUser) };
    },
    login: async (_root: unknown, args: any, context: any) => {
      assertDb();
      const email = String(args.input.email ?? "")
        .trim()
        .toLowerCase();
      const password = String(args.input.password ?? "");
      const user = await User.findOne({ email });

      if (!user) {
        throw new Error("Konto nicht gefunden.");
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        throw new Error("Falsches Passwort.");
      }

      const safeUser = { id: user._id.toString(), name: user.name, email: user.email };
      setAuthCookie(context.response, safeUser);
      return { user: await getUserProfile(safeUser) };
    },
    logout: async (_root: unknown, _args: any, context: any) => {
      clearAuthCookie(context.response);
      return true;
    },
    addWatchlist: async (_: unknown, args: any, context: any) => {
      assertDb();
      const userId = authorizeUser(context, args.input.userId ?? null);
      const input = toSavedInput({ ...args.input, userId });
      const doc = await WatchlistItem.findOneAndUpdate(
        { userId, tmdbId: input.tmdbId, mediaType: input.mediaType },
        { $setOnInsert: input },
        { upsert: true, new: true },
      );
      return mapSaved(doc);
    },
    removeWatchlist: async (_: unknown, args: any, context: any) => {
      assertDb();
      const userId = authorizeUser(context, args.userId);
      await WatchlistItem.deleteOne({ userId, tmdbId: args.tmdbId, mediaType: args.mediaType });
      return true;
    },
    rateMovie: async (_: unknown, args: any, context: any) => {
      assertDb();
      const userId = authorizeUser(context, args.input.userId ?? null);
      const input = {
        ...toSavedInput({ ...args.input, userId }),
        seasonNumber: args.input.seasonNumber ?? null,
        rating: normalizeUserRating(args.input.rating),
      };
      const doc = await Rating.findOneAndUpdate(
        {
          userId,
          tmdbId: input.tmdbId,
          mediaType: input.mediaType,
          seasonNumber: input.seasonNumber ?? null,
        },
        { $set: input },
        { upsert: true, new: true },
      );

      await WatchlistItem.deleteOne({
        userId,
        tmdbId: input.tmdbId,
        mediaType: input.mediaType,
      });

      if (input.mediaType === "movie") {
        await markMovieCompletedFromRating(input, userId);
      } else if (input.seasonNumber != null) {
        await Promise.all([
          syncSeriesRatingFromSeasons(userId, input.tmdbId),
          markSeasonCompletedFromRating(input, userId),
        ]);
      } else {
        await upsertWatchProgress({ ...input, status: "COMPLETED", totalEpisodes: 0 }, userId, {
          status: "COMPLETED",
          watchedAt: new Date(),
        });
      }

      return mapRating(doc);
    },
    removeRating: async (_: unknown, args: any, context: any) => {
      assertDb();
      const userId = authorizeUser(context, args.userId);
      await Rating.deleteOne({
        userId,
        tmdbId: args.tmdbId,
        mediaType: args.mediaType,
        seasonNumber: args.seasonNumber ?? null,
      });
      if (args.mediaType === "tv" && args.seasonNumber != null) {
        await syncSeriesRatingFromSeasons(userId, args.tmdbId);
      }
      return true;
    },
    setWatchStatus: async (_: unknown, args: any, context: any) => {
      assertDb();
      const userId = authorizeUser(context, args.input.userId ?? null);
      const input = toProgressInput(args.input, userId);
      const watchedAt =
        input.mediaType === "movie" && input.status === "COMPLETED" ? new Date() : null;
      const doc = await upsertWatchProgress(args.input, userId, {
        status: input.status,
        watchedAt,
        totalEpisodes: input.totalEpisodes,
      });
      if (input.status === "COMPLETED") {
        await WatchlistItem.deleteOne({
          userId,
          tmdbId: input.tmdbId,
          mediaType: input.mediaType,
        });
      }
      return enrichWatchProgress(doc, true);
    },
    removeWatchProgress: async (_: unknown, args: any, context: any) => {
      assertDb();
      const userId = authorizeUser(context, args.userId);
      await Promise.all([
        WatchProgress.deleteOne({ userId, tmdbId: args.tmdbId, mediaType: args.mediaType }),
        args.mediaType === "tv"
          ? EpisodeProgress.deleteMany({ userId, tmdbId: args.tmdbId })
          : Promise.resolve(),
      ]);
      return true;
    },
    setEpisodeWatched: async (_: unknown, args: any, context: any) => {
      assertDb();
      const userId = authorizeUser(context, args.input.userId ?? null);
      const input = args.input;

      if (input.watched) {
        await EpisodeProgress.findOneAndUpdate(
          {
            userId,
            tmdbId: input.tmdbId,
            seasonNumber: input.seasonNumber,
            episodeNumber: input.episodeNumber,
          },
          {
            $set: {
              userId,
              tmdbId: input.tmdbId,
              title: input.title,
              posterPath: input.posterPath ?? null,
              releaseDate: input.releaseDate ?? null,
              voteAverage: input.voteAverage ?? 0,
              seasonNumber: input.seasonNumber,
              episodeNumber: input.episodeNumber,
              episodeTitle: input.episodeTitle ?? "",
              airDate: input.airDate ?? null,
              runtime: input.runtime ?? null,
              stillPath: input.stillPath ?? null,
              watchedAt: new Date(),
            },
          },
          { upsert: true, new: true },
        );
      } else {
        await EpisodeProgress.deleteOne({
          userId,
          tmdbId: input.tmdbId,
          seasonNumber: input.seasonNumber,
          episodeNumber: input.episodeNumber,
        });
      }

      const watchedCount = await EpisodeProgress.countDocuments({ userId, tmdbId: input.tmdbId });
      const totalEpisodes = Number(input.totalEpisodes ?? 0);
      const status =
        watchedCount > 0 && totalEpisodes > 0 && watchedCount >= totalEpisodes
          ? "COMPLETED"
          : "WATCHING";
      const doc = await upsertWatchProgress(
        { ...input, mediaType: "tv", status, totalEpisodes },
        userId,
        { status, totalEpisodes, watchedAt: status === "COMPLETED" ? new Date() : null },
      );
      return enrichWatchProgress(doc, true);
    },
    setSeasonWatched: async (_: unknown, args: any, context: any) => {
      assertDb();
      const userId = authorizeUser(context, args.input.userId ?? null);
      const input = args.input;
      const episodeFilters = (input.episodes ?? []).map((episode: any) => ({
        userId,
        tmdbId: input.tmdbId,
        seasonNumber: input.seasonNumber,
        episodeNumber: episode.episodeNumber,
      }));

      if (input.watched) {
        const operations = (input.episodes ?? []).map((episode: any) => ({
          updateOne: {
            filter: {
              userId,
              tmdbId: input.tmdbId,
              seasonNumber: input.seasonNumber,
              episodeNumber: episode.episodeNumber,
            },
            update: {
              $set: {
                userId,
                tmdbId: input.tmdbId,
                title: input.title,
                posterPath: input.posterPath ?? null,
                releaseDate: input.releaseDate ?? null,
                voteAverage: input.voteAverage ?? 0,
                seasonNumber: input.seasonNumber,
                episodeNumber: episode.episodeNumber,
                episodeTitle: episode.episodeTitle ?? "",
                airDate: episode.airDate ?? null,
                runtime: episode.runtime ?? null,
                stillPath: episode.stillPath ?? null,
                watchedAt: new Date(),
              },
            },
            upsert: true,
          },
        }));
        if (operations.length) await EpisodeProgress.bulkWrite(operations);
      } else if (episodeFilters.length) {
        await EpisodeProgress.deleteMany({ $or: episodeFilters });
      }

      const watchedCount = await EpisodeProgress.countDocuments({ userId, tmdbId: input.tmdbId });
      const totalEpisodes = Number(input.totalEpisodes ?? 0);
      const status =
        watchedCount > 0 && totalEpisodes > 0 && watchedCount >= totalEpisodes
          ? "COMPLETED"
          : watchedCount > 0
            ? "WATCHING"
            : "PLAN_TO_WATCH";
      const doc = await upsertWatchProgress(
        { ...input, mediaType: "tv", status, totalEpisodes },
        userId,
        { status, totalEpisodes, watchedAt: status === "COMPLETED" ? new Date() : null },
      );
      return enrichWatchProgress(doc, true);
    },
    createReleaseEvent: async (_: unknown, args: any, context: any) => {
      assertDb();
      const admin = await requireAdmin(context);
      const input = normalizeReleaseInput(args.input, admin.id);
      const duplicate = await ReleaseEvent.findOne(releaseDuplicateFilter(input));
      if (duplicate) {
        const doc = await ReleaseEvent.findByIdAndUpdate(
          duplicate._id,
          { $set: { ...input, createdBy: duplicate.createdBy } },
          { new: true },
        );
        return mapReleaseEvent(doc);
      }
      const doc = await ReleaseEvent.create(input);
      return mapReleaseEvent(doc);
    },
    updateReleaseEvent: async (_: unknown, args: any, context: any) => {
      assertDb();
      const admin = await requireAdmin(context);
      const existing = await ReleaseEvent.findById(args.id);
      if (!existing) throw new Error("Release nicht gefunden.");
      const input = normalizeReleaseInput(
        { ...existing.toObject(), ...args.input },
        admin.id,
        existing,
      );
      const duplicate = await ReleaseEvent.findOne(releaseDuplicateFilter(input, args.id));
      if (duplicate) throw new Error("Dieser Release existiert bereits.");
      const doc = await ReleaseEvent.findByIdAndUpdate(args.id, { $set: input }, { new: true });
      return mapReleaseEvent(doc);
    },
    deleteReleaseEvent: async (_: unknown, args: any, context: any) => {
      assertDb();
      await requireAdmin(context);
      await ReleaseEvent.findByIdAndDelete(args.id);
      return true;
    },
    bulkCreateReleaseEvents: async (_: unknown, args: any, context: any) => {
      assertDb();
      const admin = await requireAdmin(context);
      const created = [];
      for (const raw of args.inputs ?? []) {
        const input = normalizeReleaseInput(raw, admin.id);
        const duplicate = await ReleaseEvent.findOne(releaseDuplicateFilter(input));
        if (duplicate) continue;
        created.push(await ReleaseEvent.create(input));
      }
      return created.map((doc) => mapReleaseEvent(doc));
    },
    bulkUpdateReleaseEvents: async (_: unknown, args: any, context: any) => {
      assertDb();
      const admin = await requireAdmin(context);
      const docs = [];
      for (const id of args.ids ?? []) {
        const existing = await ReleaseEvent.findById(id);
        if (!existing) continue;
        const input = normalizeReleaseInput(
          { ...existing.toObject(), ...args.input },
          admin.id,
          existing,
        );
        const duplicate = await ReleaseEvent.findOne(releaseDuplicateFilter(input, id));
        if (duplicate) continue;
        const doc = await ReleaseEvent.findByIdAndUpdate(id, { $set: input }, { new: true });
        if (doc) docs.push(doc);
      }
      return docs.map((doc) => mapReleaseEvent(doc));
    },
    bulkDeleteReleaseEvents: async (_: unknown, args: any, context: any) => {
      assertDb();
      await requireAdmin(context);
      await ReleaseEvent.deleteMany({ _id: { $in: args.ids ?? [] } });
      return true;
    },
  },
};

function mapProvider(provider: any) {
  return {
    providerId: provider.provider_id,
    providerName: provider.provider_name,
    logoPath: provider.logo_path ?? null,
  };
}

function normalizeReleaseDateParts(input: any) {
  const datePrecision: DatePrecision = DATE_PRECISIONS.includes(input.datePrecision)
    ? input.datePrecision
    : input.releaseDate
      ? "EXACT"
      : "UNKNOWN";
  const releaseDate =
    datePrecision === "EXACT" && input.releaseDate ? String(input.releaseDate) : null;
  const parsedDate = releaseDate ? new Date(`${releaseDate}T00:00:00.000Z`) : null;
  const exactYear =
    parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.getUTCFullYear() : null;
  const exactMonth =
    parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.getUTCMonth() + 1 : null;
  const releaseYear =
    datePrecision === "EXACT"
      ? exactYear
      : input.releaseYear
        ? Number(input.releaseYear)
        : exactYear;
  const releaseMonth =
    datePrecision === "EXACT"
      ? exactMonth
      : input.releaseMonth
        ? Number(input.releaseMonth)
        : exactMonth;
  const releaseQuarter =
    datePrecision === "QUARTER"
      ? Number(input.releaseQuarter ?? Math.ceil(Number(releaseMonth ?? 1) / 3))
      : releaseMonth
        ? Math.ceil(Number(releaseMonth) / 3)
        : input.releaseQuarter
          ? Number(input.releaseQuarter)
          : null;

  return {
    datePrecision,
    releaseDate,
    releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
    releaseMonth: Number.isFinite(releaseMonth) ? releaseMonth : null,
    releaseQuarter: Number.isFinite(releaseQuarter) ? releaseQuarter : null,
  };
}

function normalizeReleaseInput(input: any, adminId: string, existing?: any) {
  const releaseType: ReleaseType = RELEASE_TYPES.includes(input.releaseType)
    ? input.releaseType
    : "MOVIE_CATALOG";
  const publicationStatus: PublicationStatus = PUBLICATION_STATUSES.includes(
    input.publicationStatus,
  )
    ? input.publicationStatus
    : "DRAFT";
  const confirmationStatus: ConfirmationStatus = CONFIRMATION_STATUSES.includes(
    input.confirmationStatus,
  )
    ? input.confirmationStatus
    : "ANNOUNCED";
  const dateParts = normalizeReleaseDateParts(input);
  const provider = String(input.provider ?? existing?.provider ?? "").trim();
  const region = String(input.region ?? existing?.region ?? "DE")
    .trim()
    .toUpperCase();

  if (!input.tmdbId && !existing?.tmdbId) throw new Error("Titel fehlt.");
  if (!provider) throw new Error("Streaming-Anbieter fehlt.");
  if (!region) throw new Error("Region fehlt.");
  if (dateParts.datePrecision === "EXACT" && !dateParts.releaseDate) {
    throw new Error("Exaktes Datum fehlt.");
  }

  return {
    tmdbId: Number(input.tmdbId ?? existing?.tmdbId),
    mediaType: input.mediaType ?? existing?.mediaType,
    title: String(input.title ?? existing?.title ?? "Untitled"),
    posterPath: input.posterPath ?? existing?.posterPath ?? null,
    backdropPath: input.backdropPath ?? existing?.backdropPath ?? null,
    voteAverage: Number(input.voteAverage ?? existing?.voteAverage ?? 0),
    popularity: Number(input.popularity ?? existing?.popularity ?? 0),
    genreIds: input.genreIds ?? existing?.genreIds ?? [],
    provider,
    region,
    releaseType,
    publicationStatus,
    confirmationStatus,
    ...dateParts,
    seasonNumber: input.seasonNumber == null ? null : Number(input.seasonNumber),
    episodeNumber: input.episodeNumber == null ? null : Number(input.episodeNumber),
    sourceUrl: input.sourceUrl?.trim?.() ? String(input.sourceUrl).trim() : null,
    notes: input.notes ?? "",
    lastVerifiedAt: input.lastVerifiedAt ? new Date(input.lastVerifiedAt) : null,
    updatedBy: adminId,
    ...(existing ? {} : { createdBy: adminId }),
  };
}

function releaseDuplicateFilter(input: any, excludeId?: string) {
  const filter: Record<string, unknown> = {
    tmdbId: input.tmdbId,
    mediaType: input.mediaType,
    provider: input.provider,
    region: input.region,
    releaseType: input.releaseType,
    datePrecision: input.datePrecision,
    releaseDate: input.releaseDate ?? null,
    releaseYear: input.releaseYear ?? null,
    releaseMonth: input.releaseMonth ?? null,
    releaseQuarter: input.releaseQuarter ?? null,
    seasonNumber: input.seasonNumber ?? null,
    episodeNumber: input.episodeNumber ?? null,
    publicationStatus: { $ne: "ARCHIVED" },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return filter;
}

function mapReleaseEvent(doc: any, watchlistMatches = new Set<string>()) {
  const key = `${doc.mediaType}-${doc.tmdbId}`;
  return {
    id: doc._id.toString(),
    tmdbId: doc.tmdbId,
    mediaType: doc.mediaType,
    title: doc.title,
    posterPath: doc.posterPath ?? null,
    backdropPath: doc.backdropPath ?? null,
    voteAverage: doc.voteAverage ?? 0,
    popularity: doc.popularity ?? 0,
    genreIds: doc.genreIds ?? [],
    provider: doc.provider,
    region: doc.region,
    releaseDate: doc.releaseDate ?? null,
    datePrecision: doc.datePrecision,
    releaseYear: doc.releaseYear ?? null,
    releaseMonth: doc.releaseMonth ?? null,
    releaseQuarter: doc.releaseQuarter ?? null,
    releaseType: doc.releaseType,
    publicationStatus: doc.publicationStatus,
    confirmationStatus: doc.confirmationStatus,
    seasonNumber: doc.seasonNumber ?? null,
    episodeNumber: doc.episodeNumber ?? null,
    sourceUrl: doc.sourceUrl ?? null,
    notes: doc.notes ?? "",
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    createdAt: doc.createdAt?.getTime?.() ?? Date.now(),
    updatedAt: doc.updatedAt?.getTime?.() ?? Date.now(),
    isWatchlisted: watchlistMatches.has(key),
  };
}

function buildReleaseFilter(args: any, publicOnly = true) {
  const filter: Record<string, any> = {};
  if (publicOnly) filter.publicationStatus = "PUBLISHED";
  else if (args.publicationStatus) filter.publicationStatus = args.publicationStatus;
  if (args.region) filter.region = String(args.region).toUpperCase();
  if (args.providers?.length) filter.provider = { $in: args.providers };
  if (args.mediaType) filter.mediaType = args.mediaType;
  if (args.releaseTypes?.length) filter.releaseType = { $in: args.releaseTypes };
  if (args.confirmationStatuses?.length)
    filter.confirmationStatus = { $in: args.confirmationStatuses };
  if (args.genreIds?.length) filter.genreIds = { $in: args.genreIds.map(Number) };
  if (args.tmdbId) filter.tmdbId = Number(args.tmdbId);
  if (args.datePrecision) filter.datePrecision = args.datePrecision;
  if (args.year) filter.releaseYear = Number(args.year);
  if (args.month) filter.releaseMonth = Number(args.month);
  if (args.fromDate || args.toDate) {
    filter.releaseDate = {};
    if (args.fromDate) filter.releaseDate.$gte = args.fromDate;
    if (args.toDate) filter.releaseDate.$lte = args.toDate;
  }
  return filter;
}

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use((request, response, next) => {
  (request as any).res = response;
  next();
});

app.get("/health", (_request, response) => {
  response.json({ ok: true, mongo: hasDb() });
});

app.get("/api/me", async (request, response) => {
  const user = getAuthUserFromRequest(request as any);
  response.json({ user: user ? await getUserProfile(user) : null });
});

app.post("/api/register", async (request, response) => {
  try {
    assertDb();
    const name = String(request.body?.name ?? "").trim();
    const email = String(request.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(request.body?.password ?? "");

    if (!name || !email || password.length < 6) {
      response.status(400).json({
        error:
          "Bitte gib einen Namen, eine gültige E-Mail und ein Passwort mit mindestens 6 Zeichen ein.",
      });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      response.status(409).json({ error: "Ein Konto mit dieser E-Mail existiert bereits." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: isAdminEmail(email) ? "ADMIN" : "USER",
    });
    const safeUser = { id: user._id.toString(), name: user.name, email: user.email };
    setAuthCookie(response, safeUser);
    response.json({ user: await getUserProfile(safeUser) });
  } catch (error: any) {
    response.status(400).json({ error: error.message ?? "Registrierung fehlgeschlagen." });
  }
});

app.post("/api/login", async (request, response) => {
  try {
    assertDb();
    const email = String(request.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(request.body?.password ?? "");
    const user = await User.findOne({ email });

    if (!user) {
      response.status(401).json({ error: "Konto nicht gefunden." });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      response.status(401).json({ error: "Falsches Passwort." });
      return;
    }

    const safeUser = { id: user._id.toString(), name: user.name, email: user.email };
    setAuthCookie(response, safeUser);
    response.json({ user: await getUserProfile(safeUser) });
  } catch (error: any) {
    response.status(400).json({ error: error.message ?? "Login fehlgeschlagen." });
  }
});

app.post("/api/logout", async (_request, response) => {
  clearAuthCookie(response);
  response.json({ ok: true });
});

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: "/graphql",
  context: ({ request }: { request: any }) => {
    return {
      request,
      response: (request as any)?.res ?? null,
      user: getAuthUserFromRequest(request),
    };
  },
});

app.use("/graphql", yoga as RequestHandler);

await connectDb();

app.listen(PORT, () => {
  console.log(`GraphQL server running at http://localhost:${PORT}/graphql`);
  if (!hasDb()) {
    console.warn(
      "MongoDB is not connected; watchlist and ratings will be unavailable until a valid MONGODB_URI is configured.",
    );
  }
});
