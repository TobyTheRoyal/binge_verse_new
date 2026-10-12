import "dotenv/config";

import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { createSchema, createYoga } from "graphql-yoga";
import jwt from "jsonwebtoken";
import mongoose, { Schema } from "mongoose";

const PORT = Number(process.env.PORT ?? 4000);
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const AUTH_COOKIE_NAME = "bingeverse_session";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type MediaType = "movie" | "tv";

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
    rating: { type: Number, required: true, min: 1, max: 10 },
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

const Rating = mongoose.models.Rating || mongoose.model("Rating", ratingSchema);
const WatchlistItem = mongoose.models.WatchlistItem || mongoose.model("WatchlistItem", watchlistSchema);

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
    console.warn("MongoDB connection failed. Continuing without MongoDB-backed features.", error instanceof Error ? error.message : error);
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
  const cookieHeader = typeof request?.headers?.get === "function"
    ? request.headers.get("cookie") ?? ""
    : request?.headers?.cookie ?? "";

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

  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
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

async function tmdb<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
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
    myRating: Int
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

  type UserProfile {
    id: ID!
    name: String!
    email: String!
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
    rating: Int!
    ratedAt: Float!
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
    rating: Int!
  }

  type Query {
    me: UserProfile
    home: HomeData!
    discover(media: MediaType!, genre: String, year: String, sort: String, page: Int): [MediaItem!]!
    search(query: String!, page: Int): [MediaItem!]!
    genres(media: MediaType!): [Genre!]!
    details(media: MediaType!, id: Int!, userId: String): MovieDetails!
    recommendations(media: MediaType!, id: Int!): [MediaItem!]!
    watchlist(userId: String!): [SavedItem!]!
    ratings(userId: String!): [RatingEntry!]!
  }

  type Mutation {
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    logout: Boolean!
    addWatchlist(input: SavedItemInput!): SavedItem!
    removeWatchlist(userId: String!, tmdbId: Int!, mediaType: MediaType!): Boolean!
    rateMovie(input: RatingInput!): RatingEntry!
    removeRating(userId: String!, tmdbId: Int!, mediaType: MediaType!, seasonNumber: Int): Boolean!
  }
`;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

const resolvers = {
  Query: {
    me: async (_root: unknown, _args: any, context: any) => {
      const user = context?.user ?? getAuthUserFromRequest(context?.request);
      if (!user) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
      };
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
        (result.results ?? []).map((item: TmdbMedia) => normalizeMedia(item, fallback)).filter((item: any) => item.posterPath);

      const sortHomeItems = (items: any[]) =>
        [...items].sort((a, b) => {
          const popularityDelta = Number(b.popularity ?? 0) - Number(a.popularity ?? 0);
          if (popularityDelta !== 0) return popularityDelta;
          const ratingDelta = Number(b.voteAverage ?? 0) - Number(a.voteAverage ?? 0);
          if (ratingDelta !== 0) return ratingDelta;
          const releaseDelta = (b.releaseDate ? new Date(b.releaseDate).getTime() : 0) - (a.releaseDate ? new Date(a.releaseDate).getTime() : 0);
          return releaseDelta;
        });

      const trending = sortHomeItems(pick(trendDay));
      const featured = trending.find((item: any) => item.backdropPath && item.overview) ?? trending[0] ?? null;

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
        sort_by: args.sort || "popularity.desc",
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
        ? process.env.TMDB_REGION ?? "DE"
        : providers.US
          ? "US"
          : Object.keys(providers)[0];
      const region = regionKey ? providers[regionKey] : null;
      const trailer = (raw.videos?.results ?? []).find(
        (video: any) => video.site === "YouTube" && (video.type === "Trailer" || video.type === "Teaser"),
      );

      let myRating: number | null = null;
      let inWatchlist = false;
      const effectiveUserId = authUser ? authUser.id : null;

      if (effectiveUserId && hasDb()) {
        const [rating, saved] = await Promise.all([
          Rating.findOne({ userId: effectiveUserId, tmdbId: args.id, mediaType: args.media, seasonNumber: null }),
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
      return WatchlistItem.find({ userId }).sort({ createdAt: -1 }).then((docs) => docs.map(mapSaved));
    },
    ratings: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId);
      if (!hasDb()) return [];
      return Rating.find({ userId }).sort({ updatedAt: -1 }).then((docs) => docs.map(mapRating));
    },
  },
  Mutation: {
    register: async (_root: unknown, args: any, context: any) => {
      assertDb();
      const name = String(args.input.name ?? "").trim();
      const email = String(args.input.email ?? "").trim().toLowerCase();
      const password = String(args.input.password ?? "");

      if (!name || !email || password.length < 6) {
        throw new Error("Bitte gib einen Namen, eine gültige E-Mail und ein Passwort mit mindestens 6 Zeichen ein.");
      }

      const existing = await User.findOne({ email });
      if (existing) {
        throw new Error("Ein Konto mit dieser E-Mail existiert bereits.");
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({ name, email, passwordHash });
      const safeUser = { id: user._id.toString(), name: user.name, email: user.email };
      setAuthCookie(context.response, safeUser);

      return { user: safeUser };
    },
    login: async (_root: unknown, args: any, context: any) => {
      assertDb();
      const email = String(args.input.email ?? "").trim().toLowerCase();
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
      return { user: safeUser };
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
        rating: args.input.rating,
      };
      const doc = await Rating.findOneAndUpdate(
        { userId, tmdbId: input.tmdbId, mediaType: input.mediaType, seasonNumber: input.seasonNumber ?? null },
        { $set: input },
        { upsert: true, new: true },
      );
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
  response.json({ user: user ? { id: user.id, name: user.name, email: user.email } : null });
});

app.post("/api/register", async (request, response) => {
  try {
    assertDb();
    const name = String(request.body?.name ?? "").trim();
    const email = String(request.body?.email ?? "").trim().toLowerCase();
    const password = String(request.body?.password ?? "");

    if (!name || !email || password.length < 6) {
      response.status(400).json({ error: "Bitte gib einen Namen, eine gültige E-Mail und ein Passwort mit mindestens 6 Zeichen ein." });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      response.status(409).json({ error: "Ein Konto mit dieser E-Mail existiert bereits." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    const safeUser = { id: user._id.toString(), name: user.name, email: user.email };
    setAuthCookie(response, safeUser);
    response.json({ user: safeUser });
  } catch (error: any) {
    response.status(400).json({ error: error.message ?? "Registrierung fehlgeschlagen." });
  }
});

app.post("/api/login", async (request, response) => {
  try {
    assertDb();
    const email = String(request.body?.email ?? "").trim().toLowerCase();
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
    response.json({ user: safeUser });
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

app.use("/graphql", yoga);

await connectDb();

app.listen(PORT, () => {
  console.log(`GraphQL server running at http://localhost:${PORT}/graphql`);
  if (!hasDb()) {
    console.warn("MongoDB is not connected; watchlist and ratings will be unavailable until a valid MONGODB_URI is configured.");
  }
});
