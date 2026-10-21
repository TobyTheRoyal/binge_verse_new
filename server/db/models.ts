import mongoose, {
  Schema,
  type Model,
  type InferSchemaType,
  type HydratedDocument,
} from "mongoose";
import {
  WATCH_STATUSES,
  USER_ROLES,
  RELEASE_TYPES,
  PUBLICATION_STATUSES,
  CONFIRMATION_STATUSES,
  DATE_PRECISIONS,
} from "../../shared/catalog.js";

function modelFor<S extends Schema>(name: string, schema: S): Model<InferSchemaType<S>> {
  return (
    (mongoose.models[name] as Model<InferSchemaType<S>> | undefined) ??
    mongoose.model<InferSchemaType<S>>(name, schema)
  );
}

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
ratingSchema.index({ seasonNumber: 1, tmdbId: 1, mediaType: 1, userId: 1 });
ratingSchema.index({ userId: 1, updatedAt: -1 });

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
export type WatchProgressDocument = HydratedDocument<InferSchemaType<typeof watchProgressSchema>>;

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

const tasteProfileSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    sourceHash: { type: String, required: true, index: true },
    computedAt: { type: Date, required: true, default: Date.now, index: true },
    ratingCount: { type: Number, required: true, default: 0 },
    confidence: { type: Number, required: true, default: 0 },
    averageRating: { type: Number, required: true, default: 0 },
    summary: { type: String, default: "" },
    favoriteMediaType: { type: String, default: null },
    genrePreferences: { type: [Schema.Types.Mixed], default: [] },
    actorPreferences: { type: [Schema.Types.Mixed], default: [] },
    directorPreferences: { type: [Schema.Types.Mixed], default: [] },
    storyPreferences: { type: [Schema.Types.Mixed], default: [] },
    excludedGenres: { type: [Number], default: [] },
    useViewingSignals: { type: Boolean, default: true },
  },
  { timestamps: true },
);

tasteProfileSchema.index({ userId: 1, computedAt: -1 });

const storyDnaSchema = new Schema(
  {
    tmdbId: { type: Number, required: true },
    mediaType: { type: String, required: true, enum: ["movie", "tv"] },
    themes: { type: [String], default: [] },
    source: { type: String, required: true, default: "tmdb-keywords" },
    confidence: { type: Number, required: true, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

storyDnaSchema.index({ tmdbId: 1, mediaType: 1 }, { unique: true });

export const Rating = modelFor("Rating", ratingSchema);
export const WatchlistItem = modelFor("WatchlistItem", watchlistSchema);
export const WatchProgress = modelFor("WatchProgress", watchProgressSchema);
export const EpisodeProgress = modelFor("EpisodeProgress", episodeProgressSchema);
export const ReleaseEvent = modelFor("ReleaseEvent", releaseEventSchema);
export const TasteProfile = modelFor("TasteProfile", tasteProfileSchema);
export const StoryDna = modelFor("StoryDna", storyDnaSchema);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, enum: USER_ROLES, default: "USER", index: true },
  },
  { timestamps: true },
);

export const User = modelFor("User", userSchema);

const sessionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);
export const Session = modelFor("Session", sessionSchema);
