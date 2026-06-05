import "dotenv/config";

import cors from "cors";
import express from "express";
import { createSchema, createYoga } from "graphql-yoga";
import mongoose, { Schema } from "mongoose";

const PORT = Number(process.env.PORT ?? 4000);
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

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
    title: { type: String, required: true },
    posterPath: { type: String, default: null },
    releaseDate: { type: String, default: null },
    voteAverage: { type: Number, default: 0 },
    rating: { type: Number, required: true, min: 1, max: 10 },
  },
  { timestamps: true },
);

ratingSchema.index({ userId: 1, tmdbId: 1, mediaType: 1 }, { unique: true });

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
    rating: doc.rating,
    ratedAt: doc.updatedAt?.getTime?.() ?? doc.createdAt?.getTime?.() ?? Date.now(),
  };
}

async function connectDb() {
  if (!process.env.MONGODB_URI) {
    console.warn("MONGODB_URI missing. TMDB queries work, MongoDB user data is disabled.");
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB ?? "binge_verse",
  });
  console.log("MongoDB connected");
}

function hasDb() {
  return mongoose.connection.readyState === 1;
}

function assertDb() {
  if (!hasDb()) {
    throw new Error("MongoDB is not connected. Set MONGODB_URI in .env.");
  }
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
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float!
    addedAt: Float!
    rating: Int!
    ratedAt: Float!
  }

  input SavedItemInput {
    userId: String!
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
  }

  input RatingInput {
    userId: String!
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
    rating: Int!
  }

  type Query {
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
    addWatchlist(input: SavedItemInput!): SavedItem!
    removeWatchlist(userId: String!, tmdbId: Int!, mediaType: MediaType!): Boolean!
    rateMovie(input: RatingInput!): RatingEntry!
    removeRating(userId: String!, tmdbId: Int!, mediaType: MediaType!): Boolean!
  }
`;

const resolvers = {
  Query: {
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
      const trending = pick(trendDay);

      return {
        featured: trending.find((item: any) => item.backdropPath && item.overview) ?? trending[0] ?? null,
        trending,
        trendingMovies: pick(trendMovie, "movie"),
        trendingTv: pick(trendTv, "tv"),
        popularMovies: pick(popMovie, "movie"),
        popularTv: pick(popTv, "tv"),
        topMovies: pick(topMovie, "movie"),
        topTv: pick(topTv, "tv"),
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
    details: async (_: unknown, args: any) => {
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

      if (args.userId && hasDb()) {
        const [rating, saved] = await Promise.all([
          Rating.findOne({ userId: args.userId, tmdbId: args.id, mediaType: args.media }),
          WatchlistItem.exists({ userId: args.userId, tmdbId: args.id, mediaType: args.media }),
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
    watchlist: async (_: unknown, args: any) => {
      if (!hasDb()) return [];
      return WatchlistItem.find({ userId: args.userId }).sort({ createdAt: -1 }).then((docs) => docs.map(mapSaved));
    },
    ratings: async (_: unknown, args: any) => {
      if (!hasDb()) return [];
      return Rating.find({ userId: args.userId }).sort({ updatedAt: -1 }).then((docs) => docs.map(mapRating));
    },
  },
  Mutation: {
    addWatchlist: async (_: unknown, args: any) => {
      assertDb();
      const input = toSavedInput(args.input);
      const doc = await WatchlistItem.findOneAndUpdate(
        { userId: input.userId, tmdbId: input.tmdbId, mediaType: input.mediaType },
        { $setOnInsert: input },
        { upsert: true, new: true },
      );
      return mapSaved(doc);
    },
    removeWatchlist: async (_: unknown, args: any) => {
      assertDb();
      await WatchlistItem.deleteOne({ userId: args.userId, tmdbId: args.tmdbId, mediaType: args.mediaType });
      return true;
    },
    rateMovie: async (_: unknown, args: any) => {
      assertDb();
      const input = { ...toSavedInput(args.input), rating: args.input.rating };
      const doc = await Rating.findOneAndUpdate(
        { userId: input.userId, tmdbId: input.tmdbId, mediaType: input.mediaType },
        { $set: input },
        { upsert: true, new: true },
      );
      return mapRating(doc);
    },
    removeRating: async (_: unknown, args: any) => {
      assertDb();
      await Rating.deleteOne({ userId: args.userId, tmdbId: args.tmdbId, mediaType: args.mediaType });
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

app.get("/health", (_request, response) => {
  response.json({ ok: true, mongo: hasDb() });
});

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: "/graphql",
});

app.use(cors());
app.use("/graphql", yoga);

await connectDb();

app.listen(PORT, () => {
  console.log(`GraphQL server running at http://localhost:${PORT}/graphql`);
});
