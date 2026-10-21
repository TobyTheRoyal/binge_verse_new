import { discoverParameters } from "./services/discover.js";
import { config } from "./config.js";
import {
  WATCH_STATUSES,
  RELEASE_TYPES,
  PUBLICATION_STATUSES,
  CONFIRMATION_STATUSES,
  DATE_PRECISIONS,
  WATCH_REGION,
} from "../shared/catalog.js";
import {
  authorizeUser,
  requireAdmin,
  getUserProfile,
  loginUser,
  registerUser,
  setAuthCookie,
  clearAuthCookie,
} from "./auth.js";
import { tmdb, getOmdbRatings } from "./services/metadata.js";
import { createApplication } from "./http/app.js";
import { LRUCache } from "lru-cache";
import { createHash } from "node:crypto";
import {
  buildMatchSocialContext,
  invalidateSocialMatches,
  type MatchSocialSignal,
} from "./services/social-match.js";
import type {
  ReleaseType,
  PublicationStatus,
  ConfirmationStatus,
  DatePrecision,
} from "../shared/catalog.js";
import { validateSavedMedia } from "./validation.js";
import { PublicError } from "./errors.js";
import type { WatchProgressDocument } from "./db/models.js";

import { createSchema } from "graphql-yoga";
import mongoose from "mongoose";
import {
  Rating,
  WatchlistItem,
  WatchProgress,
  EpisodeProgress,
  ReleaseEvent,
  TasteProfile,
} from "./db/models.js";
import { typeDefs } from "./graphql/schema.js";

type MediaType = import("../shared/catalog.js").MediaType;
type WatchStatus = import("../shared/catalog.js").WatchStatus;
type TmdbMedia = {
  id: number;
  media_type?: MediaType;
  original_language?: string;
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

type TastePreference = {
  id: string;
  name: string;
  score: number;
  observations: number;
  averageRating: number;
};

type BuiltTasteProfile = {
  userId: string;
  sourceHash: string;
  computedAt: Date;
  ratingCount: number;
  confidence: number;
  averageRating: number;
  summary: string;
  favoriteMediaType: MediaType | null;
  genrePreferences: TastePreference[];
  actorPreferences: TastePreference[];
  directorPreferences: TastePreference[];
  storyPreferences: TastePreference[];
  excludedGenres: number[];
  useViewingSignals: boolean;
};

type MatchScoreResult = {
  score: number | null;
  label: string;
  color: string;
  confidence: number;
  tasteScore: number | null;
  communityScore: number | null;
  communityRatingCount: number;
  similarUserScore: number | null;
  similarUserCount: number;
  reasons: string[];
  insufficientData: boolean;
};

const GENRE_NAMES: Record<number, string> = {
  12: "Abenteuer",
  14: "Fantasy",
  16: "Animation",
  18: "Drama",
  27: "Horror",
  28: "Action",
  35: "Komödie",
  36: "Historie",
  37: "Western",
  53: "Thriller",
  80: "Krimi",
  99: "Dokumentarfilm",
  878: "Science Fiction",
  9648: "Mystery",
  10402: "Musik",
  10749: "Romantik",
  10751: "Familie",
  10752: "Kriegsfilm",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  10770: "TV-Film",
};

const STORY_TAXONOMY = [
  {
    id: "revenge-justice",
    name: "Revenge & Justice",
    keywords: ["revenge", "vengeance", "justice", "vigilante", "retribution"],
  },
  {
    id: "betrayal",
    name: "Betrayal",
    keywords: ["betrayal", "traitor", "deception", "double cross"],
  },
  {
    id: "survival",
    name: "Survival",
    keywords: ["survival", "survivor", "apocalypse", "stranded", "disaster"],
  },
  {
    id: "investigation",
    name: "Crime Investigation",
    keywords: ["investigation", "detective", "murder", "serial killer", "case", "crime"],
  },
  {
    id: "psychological-mystery",
    name: "Psychological Mystery",
    keywords: ["psychological", "mind game", "mystery", "paranoia", "manipulation"],
  },
  {
    id: "time-travel",
    name: "Time Travel",
    keywords: ["time travel", "time loop", "timeline", "alternate reality"],
  },
  {
    id: "political-intrigue",
    name: "Political Intrigue",
    keywords: ["political", "conspiracy", "government", "cover-up", "espionage"],
  },
  {
    id: "transformation",
    name: "Training & Transformation",
    keywords: ["training", "transformation", "underdog", "coming of age", "mentor"],
  },
  {
    id: "family-conflict",
    name: "Family Conflict",
    keywords: ["family", "parent", "sibling", "inheritance", "marriage"],
  },
  {
    id: "dark-atmosphere",
    name: "Dark Atmosphere",
    keywords: ["dark", "noir", "bleak", "gritty", "disturbing"],
  },
  {
    id: "romance",
    name: "Romance",
    keywords: ["romance", "love", "relationship", "couple", "heartbreak"],
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function matchScoreMeta(score: number | null) {
  if (score == null) return { label: "TasteMatch freischalten", color: "neutral" };
  if (score >= 90) return { label: "Excellent Match", color: "dark-green" };
  if (score >= 75) return { label: "Very Good Match", color: "light-green" };
  if (score >= 60) return { label: "Good Match", color: "yellow" };
  if (score >= 40) return { label: "Moderate Match", color: "orange" };
  return { label: "Low Match", color: "red" };
}

function mediaDateValue(item: any) {
  const value = item.releaseDate ?? item.release_date ?? item.first_air_date ?? null;
  return value ? new Date(value).getTime() || 0 : 0;
}

function extractStoryThemes(raw: any) {
  const keywords = [
    ...((raw.keywords?.keywords ?? raw.keywords?.results ?? []) as any[]).map((item) =>
      String(item.name ?? "").toLowerCase(),
    ),
    String(raw.overview ?? "").toLowerCase(),
    String(raw.tagline ?? "").toLowerCase(),
  ].join(" ");

  return STORY_TAXONOMY.filter((theme) =>
    theme.keywords.some((keyword) => keywords.includes(keyword)),
  ).map((theme) => ({ id: theme.id, name: theme.name }));
}

async function fetchTasteDetails(mediaType: MediaType, tmdbId: number) {
  const raw = await tmdb<any>(`/${mediaType}/${tmdbId}`, {
    append_to_response: "credits,keywords",
  });
  const crew = raw.credits?.crew ?? [];
  const directors =
    mediaType === "movie"
      ? crew
          .filter((member: any) => member.job === "Director")
          .map((member: any) => ({ id: String(member.id), name: member.name }))
      : (raw.created_by ?? []).map((member: any) => ({ id: String(member.id), name: member.name }));

  return {
    genres: (raw.genres ?? []).map((genre: any) => ({
      id: Number(genre.id),
      name: genre.id === 10749 ? "Romantik" : genre.name,
    })),
    cast: (raw.credits?.cast ?? []).slice(0, 8).map((member: any, index: number) => ({
      id: String(member.id),
      name: member.name,
      weight: index < 3 ? 1 : 0.55,
    })),
    directors,
    storyThemes: extractStoryThemes(raw),
    runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? 0,
    numberOfEpisodes: raw.number_of_episodes ?? 0,
  };
}

function addPreference(
  map: Map<
    string,
    { id: string; name: string; total: number; ratingTotal: number; observations: number }
  >,
  id: string | number,
  name: string,
  affinity: number,
  rating: number,
  weight = 1,
) {
  const key = String(id);
  const current = map.get(key) ?? {
    id: key,
    name,
    total: 0,
    ratingTotal: 0,
    observations: 0,
  };
  current.total += affinity * weight;
  current.ratingTotal += rating * weight;
  current.observations += weight;
  map.set(key, current);
}

function preferenceList(
  map: Map<
    string,
    { id: string; name: string; total: number; ratingTotal: number; observations: number }
  >,
  minObservations: number,
  limit: number,
) {
  return [...map.values()]
    .filter((item) => item.observations >= minObservations)
    .map((item) => {
      const confidence = clamp(item.observations / 5, 0.25, 1);
      return {
        id: item.id,
        name: item.name,
        score: Math.round(clamp(50 + item.total * 12 * confidence, 0, 100)),
        observations: Math.round(item.observations),
        averageRating: Number((item.ratingTotal / Math.max(item.observations, 1)).toFixed(1)),
      };
    })
    .sort((a, b) => b.score - a.score || b.observations - a.observations)
    .slice(0, limit);
}

async function tasteSourceHash(userId: string) {
  const [ratings, progress] = await Promise.all([
    Rating.find({ userId })
      .sort({ tmdbId: 1, mediaType: 1, seasonNumber: 1 })
      .select("tmdbId mediaType seasonNumber rating updatedAt")
      .lean(),
    WatchProgress.find({ userId })
      .sort({ tmdbId: 1, mediaType: 1 })
      .select("tmdbId mediaType status updatedAt lastActivityAt")
      .lean(),
  ]);
  return createHash("sha256")
    .update(
      JSON.stringify({
        ratings: ratings.map((rating: any) => [
          rating.tmdbId,
          rating.mediaType,
          rating.seasonNumber ?? null,
          rating.rating,
          new Date(rating.updatedAt ?? 0).getTime(),
        ]),
        progress: progress.map((item: any) => [
          item.tmdbId,
          item.mediaType,
          item.status,
          new Date(item.updatedAt ?? item.lastActivityAt ?? 0).getTime(),
        ]),
      }),
    )
    .digest("hex");
}

async function buildTasteProfile(userId: string, force = false): Promise<BuiltTasteProfile> {
  assertDb();
  const sourceHash = await tasteSourceHash(userId);
  if (!force) {
    const cached = await TasteProfile.findOne({ userId, sourceHash }).lean();
    if (cached) return cached as unknown as BuiltTasteProfile;
  }

  const ratings = await Rating.find({ userId }).sort({ updatedAt: -1 }).lean();
  const usableRatings = ratings.filter((rating: any) => rating.seasonNumber == null);
  const ratingCount = usableRatings.length;
  const averageRating =
    usableRatings.reduce((sum: number, item: any) => sum + Number(item.rating ?? 0), 0) /
    Math.max(ratingCount, 1);

  const genreMap = new Map<string, any>();
  const actorMap = new Map<string, any>();
  const directorMap = new Map<string, any>();
  const storyMap = new Map<string, any>();
  const mediaTypeCounts = new Map<MediaType, number>();

  const details = await Promise.all(
    usableRatings.slice(0, 80).map(async (rating: any) => {
      try {
        return { rating, details: await fetchTasteDetails(rating.mediaType, rating.tmdbId) };
      } catch {
        return { rating, details: null };
      }
    }),
  );

  for (const entry of details) {
    if (!entry.details) continue;
    const rating = Number(entry.rating.rating ?? 0);
    const affinity = clamp((rating - averageRating) / 1.8, -2, 2);
    mediaTypeCounts.set(
      entry.rating.mediaType,
      (mediaTypeCounts.get(entry.rating.mediaType) ?? 0) + 1,
    );

    for (const genre of entry.details.genres)
      addPreference(genreMap, genre.id, genre.name, affinity, rating);
    for (const actor of entry.details.cast) {
      addPreference(actorMap, actor.id, actor.name, affinity, rating, actor.weight);
    }
    for (const director of entry.details.directors) {
      addPreference(directorMap, director.id, director.name, affinity, rating);
    }
    for (const theme of entry.details.storyThemes) {
      addPreference(storyMap, theme.id, theme.name, affinity, rating);
    }
  }

  const genrePreferences = preferenceList(genreMap, 1, 12);
  const actorPreferences = preferenceList(actorMap, 2, 10);
  const directorPreferences = preferenceList(directorMap, 1.5, 8);
  const storyPreferences = preferenceList(storyMap, 1, 10);
  const excludedGenres = genrePreferences
    .filter((genre) => genre.score < 35 && genre.observations >= 2)
    .map((genre) => Number(genre.id))
    .filter(Number.isFinite);
  const favoriteMediaType: MediaType =
    (mediaTypeCounts.get("movie") ?? 0) >= (mediaTypeCounts.get("tv") ?? 0) ? "movie" : "tv";
  const confidence = clamp(Math.round((ratingCount / 12) * 100), 0, 100);
  const topWords = [
    ...genrePreferences
      .filter((item) => item.score >= 65)
      .slice(0, 3)
      .map((item) => item.name),
    ...storyPreferences
      .filter((item) => item.score >= 65)
      .slice(0, 2)
      .map((item) => item.name),
  ];
  const summary =
    ratingCount < 3
      ? "Bewerte mehr Filme und Serien, damit BingeVerse deinen Geschmack zuverlässig erkennen kann."
      : topWords.length
        ? `Dein Geschmack tendiert stark zu ${topWords.join(", ")}.`
        : "Dein TasteDNA-Profil ist noch breit gefächert und wird mit weiteren Bewertungen genauer.";

  const profile: BuiltTasteProfile = {
    userId,
    sourceHash,
    computedAt: new Date(),
    ratingCount,
    confidence,
    averageRating: Number(averageRating.toFixed(2)) || 0,
    summary,
    favoriteMediaType,
    genrePreferences,
    actorPreferences,
    directorPreferences,
    storyPreferences,
    excludedGenres,
    useViewingSignals: true,
  };

  if (details.every((entry) => entry.details)) {
    await TasteProfile.findOneAndUpdate({ userId }, { $set: profile }, { upsert: true, new: true });
  }
  return profile;
}

function matchItemKey(mediaType: MediaType, tmdbId: number) {
  return `${mediaType}:${tmdbId}`;
}

function getMatchItemKey(item: {
  id?: number;
  tmdbId?: number;
  mediaType?: MediaType;
  media_type?: MediaType;
}) {
  const mediaType = item.mediaType ?? item.media_type;
  const tmdbId = item.tmdbId ?? item.id;
  return mediaType && Number.isFinite(Number(tmdbId))
    ? matchItemKey(mediaType, Number(tmdbId))
    : null;
}

function scoreFromProfile(
  profile: BuiltTasteProfile,
  item: {
    id?: number;
    tmdbId?: number;
    mediaType?: MediaType;
    media_type?: MediaType;
    title?: string;
    genreIds?: number[];
    genre_ids?: number[];
    genres?: { id: number; name: string }[];
    voteAverage?: number;
    vote_average?: number;
    popularity?: number;
    overview?: string;
    cast?: { id: number | string; name: string }[];
    directors?: { id: number | string; name: string }[];
    storyThemes?: { id: string; name: string }[];
  },
  socialSignal?: MatchSocialSignal | null,
): MatchScoreResult {
  if (profile.ratingCount < 3 || profile.confidence < 20) {
    return {
      score: null,
      ...matchScoreMeta(null),
      confidence: profile.confidence,
      tasteScore: null,
      communityScore: socialSignal?.communityScore ?? null,
      communityRatingCount: socialSignal?.communityRatingCount ?? 0,
      similarUserScore: null,
      similarUserCount: 0,
      reasons: ["Bewerte mindestens 3 Titel, um personalisierte TasteMatch-Scores freizuschalten."],
      insufficientData: true,
    };
  }

  const genreIds = [
    ...(item.genreIds ?? item.genre_ids ?? []),
    ...((item.genres ?? []).map((genre) => genre.id) ?? []),
  ];
  const genrePrefs = new Map(profile.genrePreferences.map((pref) => [Number(pref.id), pref]));
  const actorPrefs = new Map(profile.actorPreferences.map((pref) => [pref.id, pref]));
  const directorPrefs = new Map(profile.directorPreferences.map((pref) => [pref.id, pref]));
  const storyPrefs = new Map(profile.storyPreferences.map((pref) => [pref.id, pref]));

  const matchedGenres = genreIds
    .map((id) => genrePrefs.get(id))
    .filter(Boolean) as TastePreference[];
  const genreScore = matchedGenres.length
    ? matchedGenres.reduce((sum, pref) => sum + pref.score, 0) / matchedGenres.length
    : 50;
  const excludedPenalty = genreIds.some((id) => profile.excludedGenres.includes(id)) ? 12 : 0;

  const matchedActors = (item.cast ?? [])
    .map((actor) => actorPrefs.get(String(actor.id)))
    .filter(Boolean) as TastePreference[];
  const actorScore = matchedActors.length
    ? matchedActors.reduce((sum, pref) => sum + pref.score, 0) / matchedActors.length
    : 50;

  const matchedDirectors = (item.directors ?? [])
    .map((director) => directorPrefs.get(String(director.id)))
    .filter(Boolean) as TastePreference[];
  const directorScore = matchedDirectors.length
    ? matchedDirectors.reduce((sum, pref) => sum + pref.score, 0) / matchedDirectors.length
    : 50;

  const matchedStories = [
    ...(item.storyThemes ?? []),
    ...extractStoryThemes({ overview: item.overview ?? "" }),
  ]
    .map((theme) => storyPrefs.get(theme.id))
    .filter(Boolean) as TastePreference[];
  const storyScore = matchedStories.length
    ? matchedStories.reduce((sum, pref) => sum + pref.score, 0) / matchedStories.length
    : 50;

  const qualityScore = clamp(Number(item.voteAverage ?? item.vote_average ?? 0) * 10, 35, 95);
  const popularityScore = clamp(Math.log10(Number(item.popularity ?? 0) + 1) * 25, 30, 90);
  const mediaType = item.mediaType ?? item.media_type;
  const mediaTypeBonus = mediaType && mediaType === profile.favoriteMediaType ? 3 : 0;

  const baseTasteScore = clamp(
    genreScore * 0.42 +
      storyScore * 0.18 +
      actorScore * 0.12 +
      directorScore * 0.1 +
      qualityScore * 0.12 +
      popularityScore * 0.06 +
      mediaTypeBonus -
      excludedPenalty,
    0,
    100,
  );

  const strongestGenre = Math.max(50, ...matchedGenres.map((pref) => pref.score));
  const strongestStory = Math.max(50, ...matchedStories.map((pref) => pref.score));
  const hasStrongActor = matchedActors.some((pref) => pref.score >= 75);
  const hasStrongDirector = matchedDirectors.some((pref) => pref.score >= 75);
  const strongSignalBoost =
    (strongestGenre >= 80 ? 7 : strongestGenre >= 68 ? 4 : 0) +
    (strongestStory >= 78 ? 6 : strongestStory >= 66 ? 3 : 0) +
    (hasStrongActor ? 3 : 0) +
    (hasStrongDirector ? 3 : 0);
  const spread = 1.18 + clamp(profile.ratingCount / 12, 0, 1) * 0.32;
  const confidenceCap = profile.ratingCount < 6 ? 82 : profile.ratingCount < 10 ? 90 : 97;
  const tasteScore = Math.round(
    clamp(50 + (baseTasteScore - 50) * spread + strongSignalBoost, 0, confidenceCap),
  );

  const communityScore = socialSignal?.communityScore ?? null;
  const similarUserScore = socialSignal?.similarUserScore ?? null;
  const similarWeight =
    similarUserScore == null ? 0 : 0.25 * clamp((socialSignal?.similarUserCount ?? 0) / 5, 0.35, 1);
  const communityWeight =
    communityScore == null
      ? 0
      : 0.1 * clamp((socialSignal?.communityRatingCount ?? 0) / 8, 0.25, 1);
  const tasteWeight = Math.max(0.55, 1 - similarWeight - communityWeight);
  const weightTotal = tasteWeight + similarWeight + communityWeight;
  const score = Math.round(
    clamp(
      (tasteScore * tasteWeight +
        (similarUserScore ?? 50) * similarWeight +
        (communityScore ?? 50) * communityWeight) /
        Math.max(weightTotal, 0.01),
      0,
      100,
    ),
  );
  const meta = matchScoreMeta(score);
  const reasons = [
    ...matchedGenres
      .filter((pref) => pref.score >= 60)
      .slice(0, 2)
      .map((pref) => `Du bewertest ${pref.name} überdurchschnittlich gut.`),
    ...matchedStories
      .filter((pref) => pref.score >= 60)
      .slice(0, 1)
      .map((pref) => `Das passt zu deinem StoryDNA-Thema ${pref.name}.`),
    ...matchedActors
      .filter((pref) => pref.score >= 65)
      .slice(0, 1)
      .map((pref) => `Du mochtest mehrere Titel mit ${pref.name}.`),
    ...matchedDirectors
      .filter((pref) => pref.score >= 65)
      .slice(0, 1)
      .map((pref) => `Der kreative Stil von ${pref.name} passt zu deinen Bewertungen.`),
  ];
  if (
    similarUserScore != null &&
    similarUserScore >= 72 &&
    (socialSignal?.similarUserCount ?? 0) > 0
  ) {
    reasons.push("User mit ähnlichem Geschmack bewerten diesen Titel überdurchschnittlich gut.");
  }
  if (
    communityScore != null &&
    communityScore >= 72 &&
    (socialSignal?.communityRatingCount ?? 0) >= 2
  ) {
    reasons.push(
      `Die BingeVerse-Community bewertet diesen Titel stark (${socialSignal?.communityRatingCount} Bewertungen).`,
    );
  }
  if (!reasons.length && qualityScore >= 75) {
    reasons.push(
      "Die globale Qualität ist stark, aber dein persönliches Profil liefert noch wenige direkte Signale.",
    );
  }

  return {
    score,
    ...meta,
    confidence: profile.confidence,
    tasteScore,
    communityScore,
    communityRatingCount: socialSignal?.communityRatingCount ?? 0,
    similarUserScore,
    similarUserCount: socialSignal?.similarUserCount ?? 0,
    reasons: reasons.slice(0, 4),
    insufficientData: false,
  };
}

async function scoreMediaBatchForContext(items: any[], context: any) {
  const user = context?.user ?? null;
  if (!user || !hasDb() || !items.length) return items;
  const [profile, socialContext] = await Promise.all([
    buildTasteProfile(user.id),
    buildMatchSocialContext(user.id, items),
  ]);
  return items.map((item) => ({
    ...item,
    matchScore: scoreFromProfile(
      profile,
      item,
      socialContext.signals.get(getMatchItemKey(item) ?? ""),
    ),
  }));
}

async function scoreReleaseEventsForContext(items: any[], context: any) {
  const user = context?.user ?? null;
  if (!user || !hasDb() || !items.length) return items;
  const scoreItems = items.map((item) => ({
    id: item.tmdbId,
    mediaType: item.mediaType,
  }));
  const [profile, socialContext] = await Promise.all([
    buildTasteProfile(user.id),
    buildMatchSocialContext(user.id, scoreItems),
  ]);
  return items.map((item) => ({
    ...item,
    matchScore: scoreFromProfile(
      profile,
      {
        id: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title,
        genreIds: item.genreIds,
        voteAverage: item.voteAverage,
        popularity: item.popularity,
      },
      socialContext.signals.get(matchItemKey(item.mediaType, Number(item.tmdbId))),
    ),
  }));
}

const suggestionCache = new LRUCache<
  string,
  { expiresAt: number; items: SearchSuggestionCandidate[] }
>({ max: config.METADATA_CACHE_MAX, ttl: config.METADATA_CACHE_TTL_MS });
const seasonCache = new LRUCache<string, { expiresAt: number; data: any }>({
  max: config.METADATA_CACHE_MAX,
  ttl: config.METADATA_CACHE_TTL_MS,
});

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

  const [multi, movies, tv] = await Promise.all([
    tmdb<any>("/search/multi", searchParams),
    tmdb<any>("/search/movie", searchParams),
    tmdb<any>("/search/tv", searchParams),
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

  const items = directCandidates.filter((item) => {
    const key = `${item.mediaType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.posterPath);
  });

  suggestionCache.set(cacheKey, {
    expiresAt: Date.now() + config.METADATA_CACHE_TTL_MS,
    items,
  });

  return items;
}

function toSavedInput(input: any): SavedMedia {
  return validateSavedMedia(input);
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

async function enrichWatchProgress(doc: any, includeNextEpisode = false, episodeCount?: number) {
  const watchedEpisodes =
    doc.mediaType === "tv"
      ? (episodeCount ??
        (await EpisodeProgress.countDocuments({ userId: doc.userId, tmdbId: doc.tmdbId })))
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

async function enrichWatchProgressList(docs: WatchProgressDocument[], includeNextEpisode = false) {
  if (!docs.length) return [];
  const counts = await EpisodeProgress.aggregate<{ _id: number; count: number }>([
    {
      $match: {
        userId: docs[0].userId,
        tmdbId: { $in: docs.filter((doc) => doc.mediaType === "tv").map((doc) => doc.tmdbId) },
      },
    },
    { $group: { _id: "$tmdbId", count: { $sum: 1 } } },
  ]);
  const countByTitle = new Map(counts.map((item) => [item._id, item.count]));
  return Promise.all(
    docs.map((doc) =>
      enrichWatchProgress(doc, includeNextEpisode, countByTitle.get(doc.tmdbId) ?? 0),
    ),
  );
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

function mapTasteProfile(profile: BuiltTasteProfile | any) {
  return {
    userId: profile.userId,
    computedAt: new Date(profile.computedAt ?? Date.now()).getTime(),
    ratingCount: profile.ratingCount ?? 0,
    confidence: profile.confidence ?? 0,
    averageRating: profile.averageRating ?? 0,
    summary: profile.summary ?? "",
    favoriteMediaType: profile.favoriteMediaType ?? null,
    genrePreferences: profile.genrePreferences ?? [],
    actorPreferences: profile.actorPreferences ?? [],
    directorPreferences: profile.directorPreferences ?? [],
    storyPreferences: profile.storyPreferences ?? [],
    excludedGenres: profile.excludedGenres ?? [],
    useViewingSignals: profile.useViewingSignals ?? true,
  };
}

async function buildBingeStats(userId: string) {
  assertDb();
  const [ratings, progress, episodeCount] = await Promise.all([
    Rating.find({ userId }).sort({ rating: -1, updatedAt: -1 }).lean(),
    WatchProgress.find({ userId }).lean(),
    EpisodeProgress.countDocuments({ userId }),
  ]);
  const titleRatings = ratings.filter((rating: any) => rating.seasonNumber == null);
  const movieRatings = titleRatings.filter((rating: any) => rating.mediaType === "movie");
  const seriesRatings = titleRatings.filter((rating: any) => rating.mediaType === "tv");
  const watchedMovies = progress.filter(
    (item: any) => item.mediaType === "movie" && item.status === "COMPLETED",
  );
  const watchedSeries = progress.filter((item: any) => item.mediaType === "tv");
  const ratingDistributionMap = new Map<number, number>();
  for (const rating of titleRatings) {
    const bucket = Math.round(Number(rating.rating ?? 0) * 2) / 2;
    ratingDistributionMap.set(bucket, (ratingDistributionMap.get(bucket) ?? 0) + 1);
  }
  const movieMinutes = watchedMovies.length * 105;
  const seriesMinutes = episodeCount * 42;
  const averageRating =
    titleRatings.reduce((sum: number, item: any) => sum + Number(item.rating ?? 0), 0) /
    Math.max(titleRatings.length, 1);

  return {
    userId,
    moviesWatched: watchedMovies.length,
    tvSeriesWatched: watchedSeries.length,
    episodesWatched: episodeCount,
    moviesRated: movieRatings.length,
    seriesRated: seriesRatings.length,
    averageRating: Number(averageRating.toFixed(2)) || 0,
    estimatedMinutesWatched: movieMinutes + seriesMinutes,
    ratingDistribution: [...ratingDistributionMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rating, count]) => ({ rating, count })),
    topRatedMovies: movieRatings.slice(0, 10).map(mapRating),
    topRatedSeries: seriesRatings.slice(0, 10).map(mapRating),
    completedSeries: watchedSeries.filter((item: any) => item.status === "COMPLETED").length,
    watchingSeries: watchedSeries.filter((item: any) => item.status === "WATCHING").length,
  };
}

async function personalizedRecommendationSections(
  userId: string,
  mediaType?: MediaType,
  limit = 12,
) {
  const profile = await buildTasteProfile(userId);
  if (profile.ratingCount < 3) {
    return [
      {
        title: "Recommended For You",
        subtitle:
          "Bewerte mindestens 3 Titel, damit BingeVerse personalisierte Empfehlungen berechnen kann.",
        items: [],
      },
    ];
  }

  const watched = await WatchProgress.find({ userId }).select("tmdbId mediaType status").lean();
  const rated = await Rating.find({ userId, seasonNumber: null }).select("tmdbId mediaType").lean();
  const blocked = new Set(
    [...watched, ...rated].map((item: any) => `${item.mediaType}:${item.tmdbId}`),
  );
  const topGenres = profile.genrePreferences
    .filter((genre) => genre.score >= 60)
    .slice(0, 3)
    .map((genre) => genre.id)
    .filter((id) => /^\d+$/.test(id));
  const targets: MediaType[] = mediaType ? [mediaType] : ["movie", "tv"];
  const candidates: any[] = [];

  for (const target of targets) {
    const genre = topGenres[0];
    const result = await tmdb<any>(`/discover/${target}`, {
      sort_by: "popularity.desc",
      with_genres: genre,
      page: 1,
      include_adult: false,
    });
    candidates.push(
      ...(result.results ?? [])
        .map((item: TmdbMedia) => normalizeMedia(item, target))
        .filter((item: any) => item.posterPath && !blocked.has(`${item.mediaType}:${item.id}`)),
    );
  }

  const socialContext = await buildMatchSocialContext(userId, candidates);
  const scored = candidates
    .map((item) => ({
      ...item,
      matchScore: scoreFromProfile(
        profile,
        item,
        socialContext.signals.get(getMatchItemKey(item) ?? ""),
      ),
    }))
    .filter((item) => item.matchScore.score != null)
    .sort((a, b) => (b.matchScore.score ?? 0) - (a.matchScore.score ?? 0))
    .slice(0, Math.min(Math.max(limit, 1), 24));

  const hiddenGems = scored
    .filter((item) => Number(item.popularity ?? 0) < 100 && (item.matchScore.score ?? 0) >= 65)
    .slice(0, Math.min(10, limit));

  return [
    {
      title: "Recommended For You",
      subtitle: "Nach deinem TasteDNA-Profil sortiert",
      items: scored,
    },
    {
      title: "Hidden Gems For You",
      subtitle: "Weniger offensichtliche Titel mit gutem persönlichem Match",
      items: hiddenGems,
    },
  ].filter((section) => section.items.length || section.title === "Recommended For You");
}

function normalizeUserRating(value: unknown) {
  const rating = Math.round(Number(value) * 2) / 2;
  if (!Number.isFinite(rating) || rating < 0.5 || rating > 10) {
    throw new PublicError("Bewertung muss zwischen 0.5 und 10 liegen.");
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
  mongoose.set("bufferCommands", false);
  mongoose.set("maxTimeMS", config.DATABASE_MAX_TIME_MS);
  if (!config.MONGODB_URI) {
    console.warn("MONGODB_URI missing. TMDB queries work, MongoDB user data is disabled.");
    return;
  }

  try {
    await mongoose.connect(config.MONGODB_URI, {
      dbName: config.MONGODB_DB,
      maxPoolSize: config.DATABASE_POOL_SIZE,
      serverSelectionTimeoutMS: config.DATABASE_MAX_TIME_MS,
      autoIndex: !config.isProduction,
    });
    console.log("MongoDB connected");
  } catch (error) {
    if (config.isProduction) throw new Error("MongoDB connection failed during startup.");
    console.warn(
      "MongoDB connection failed. Continuing without MongoDB-backed features.",
      error instanceof Error ? error.name : "ConnectionError",
    );
  }
}

function hasDb() {
  return mongoose.connection.readyState === 1;
}

function assertDb() {
  if (!hasDb()) {
    throw new PublicError("Dienst vorübergehend nicht verfügbar.");
  }
}

const resolvers = {
  Query: {
    me: async (_root: unknown, _args: any, context: any) => {
      const user = context?.user ?? null;
      if (!user) return null;
      return getUserProfile(user);
    },
    home: async (_root: unknown, _args: any, context: any) => {
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

      const homeData = {
        featured,
        trending,
        trendingMovies: sortHomeItems(pick(trendMovie, "movie")),
        trendingTv: sortHomeItems(pick(trendTv, "tv")),
        popularMovies: sortHomeItems(pick(popMovie, "movie")),
        popularTv: sortHomeItems(pick(popTv, "tv")),
        topMovies: sortHomeItems(pick(topMovie, "movie")),
        topTv: sortHomeItems(pick(topTv, "tv")),
      };

      const groups = [
        homeData.featured ? [homeData.featured] : [],
        homeData.trending,
        homeData.trendingMovies,
        homeData.trendingTv,
        homeData.popularMovies,
        homeData.popularTv,
        homeData.topMovies,
        homeData.topTv,
      ];
      const scored = await scoreMediaBatchForContext(groups.flat(), context);
      let position = 0;
      const scoredGroups = groups.map((group) => {
        const result = scored.slice(position, position + group.length);
        position += group.length;
        return result;
      });

      return {
        featured: scoredGroups[0][0] ?? null,
        trending: scoredGroups[1],
        trendingMovies: scoredGroups[2],
        trendingTv: scoredGroups[3],
        popularMovies: scoredGroups[4],
        popularTv: scoredGroups[5],
        topMovies: scoredGroups[6],
        topTv: scoredGroups[7],
      };
    },
    discover: async (_: unknown, args: any, context: any) => {
      const params = discoverParameters(args);

      const result = await tmdb<any>(`/discover/${args.media}`, params);
      const items = (result.results ?? [])
        .map((item: TmdbMedia) => normalizeMedia(item, args.media))
        .filter((item: any) => item.posterPath);
      return scoreMediaBatchForContext(items, context);
    },
    discoverPage: async (_: unknown, args: any, context: any) => {
      const page = Math.max(1, Number(args.page ?? 1));
      const params = discoverParameters(args);

      const result = await tmdb<any>(`/discover/${args.media}`, params);
      const items = (result.results ?? [])
        .map((item: TmdbMedia) => normalizeMedia(item, args.media))
        .filter((item: any) => item.posterPath);
      return {
        results: await scoreMediaBatchForContext(items, context),
        page: result.page ?? page,
        totalPages: Math.min(Number(result.total_pages ?? page), 500),
        totalResults: Number(result.total_results ?? 0),
      };
    },
    search: async (_: unknown, args: any, context: any) => {
      if (!args.query.trim()) return [];
      const result = await tmdb<any>("/search/multi", {
        query: args.query,
        page: args.page ?? 1,
        include_adult: false,
      });

      const items = (result.results ?? [])
        .filter(
          (item: TmdbMedia) =>
            (item.media_type === "movie" || item.media_type === "tv") &&
            (!args.language || item.original_language === args.language),
        )
        .map((item: TmdbMedia) => normalizeMedia(item))
        .filter((item: any) => item.posterPath);
      return scoreMediaBatchForContext(items, context);
    },
    searchPage: async (_: unknown, args: any, context: any) => {
      if (!args.query.trim()) {
        return { results: [], page: 1, totalPages: 1, totalResults: 0 };
      }
      const page = Math.max(1, Number(args.page ?? 1));
      const result = await tmdb<any>("/search/multi", {
        query: args.query,
        page,
        include_adult: false,
      });
      const filteredResults = (result.results ?? []).filter(
        (item: TmdbMedia) =>
          (item.media_type === "movie" || item.media_type === "tv") &&
          (!args.language || item.original_language === args.language),
      );
      return {
        results: await scoreMediaBatchForContext(
          filteredResults
            .map((item: TmdbMedia) => normalizeMedia(item))
            .filter((item: any) => item.posterPath),
          context,
        ),
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
      const authUser = context?.user ?? null;
      if (args.userId && authUser && args.userId !== authUser.id) {
        throw new PublicError("Unauthorized.");
      }

      const raw = await tmdb<any>(`/${args.media}/${args.id}`, {
        append_to_response: "credits,recommendations,videos,watch/providers,external_ids",
      });

      const imdbId = raw.external_ids?.imdb_id ?? raw.imdb_id ?? null;
      const externalRatings = await getOmdbRatings(imdbId);
      const providers = raw["watch/providers"]?.results ?? {};
      const regionKey = providers[WATCH_REGION] ? WATCH_REGION : null;
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
      const detailScoreItem = {
        id: raw.id,
        mediaType: args.media,
        title: raw.title ?? raw.name ?? "Untitled",
        overview: raw.overview ?? "",
        genres: raw.genres ?? [],
        voteAverage: raw.vote_average ?? 0,
        popularity: raw.popularity ?? 0,
        cast: (raw.credits?.cast ?? []).slice(0, 8).map((member: any) => ({
          id: String(member.id),
          name: member.name,
        })),
        directors:
          args.media === "movie"
            ? (raw.credits?.crew ?? [])
                .filter((member: any) => member.job === "Director")
                .map((member: any) => ({ id: String(member.id), name: member.name }))
            : (raw.created_by ?? []).map((member: any) => ({
                id: String(member.id),
                name: member.name,
              })),
        storyThemes: extractStoryThemes(raw),
      };
      const detailMatchScore =
        effectiveUserId && hasDb()
          ? await Promise.all([
              buildTasteProfile(effectiveUserId),
              buildMatchSocialContext(effectiveUserId, [detailScoreItem]),
            ]).then(([profile, socialContext]) =>
              scoreFromProfile(
                profile,
                detailScoreItem,
                socialContext.signals.get(matchItemKey(args.media, Number(raw.id))),
              ),
            )
          : null;
      const recommendationItems = (raw.recommendations?.results ?? [])
        .map((item: TmdbMedia) => normalizeMedia(item, args.media))
        .filter((item: any) => item.posterPath)
        .slice(0, 20);

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
        recommendations: await scoreMediaBatchForContext(recommendationItems, context),
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
        matchScore: detailMatchScore,
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
      const authUser = context?.user ?? null;
      if (args.userId && authUser && args.userId !== authUser.id) {
        throw new PublicError("Unauthorized.");
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
      return enrichWatchProgressList(docs);
    },
    continueWatching: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId);
      if (!hasDb()) return [];
      const docs = await WatchProgress.find({ userId, mediaType: "tv", status: "WATCHING" })
        .sort({ lastActivityAt: -1 })
        .limit(10);
      const progress = await enrichWatchProgressList(docs, true);
      return progress.filter((item) => item.nextEpisode);
    },
    tasteProfile: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId ?? null);
      return mapTasteProfile(await buildTasteProfile(userId));
    },
    bingeStats: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId ?? null);
      return buildBingeStats(userId);
    },
    personalizedRecommendations: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId ?? null);
      return personalizedRecommendationSections(userId, args.mediaType, Number(args.limit ?? 12));
    },
    matchScores: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId ?? null);
      const scoreItems = (args.items ?? []).map((item: any) => ({
        id: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title ?? "",
        overview: item.overview ?? "",
        voteAverage: item.voteAverage ?? 0,
        popularity: item.popularity ?? 0,
        genreIds: item.genreIds ?? [],
      }));
      const [profile, socialContext] = await Promise.all([
        buildTasteProfile(userId),
        buildMatchSocialContext(userId, scoreItems),
      ]);
      return scoreItems.map((item: any) =>
        scoreFromProfile(
          profile,
          {
            ...item,
          },
          socialContext.signals.get(getMatchItemKey(item) ?? ""),
        ),
      );
    },
    matchExplanation: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId ?? null);
      const scoreItem = {
        id: args.item.tmdbId,
        mediaType: args.item.mediaType,
        title: args.item.title ?? "",
        overview: args.item.overview ?? "",
        voteAverage: args.item.voteAverage ?? 0,
        popularity: args.item.popularity ?? 0,
        genreIds: args.item.genreIds ?? [],
      };
      const [profile, socialContext] = await Promise.all([
        buildTasteProfile(userId),
        buildMatchSocialContext(userId, [scoreItem]),
      ]);
      return scoreFromProfile(
        profile,
        {
          ...scoreItem,
        },
        socialContext.signals.get(getMatchItemKey(scoreItem) ?? ""),
      );
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
      const authUser = context?.user ?? null;
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
      return {
        items: await scoreReleaseEventsForContext(
          items.map((doc) => mapReleaseEvent(doc, watchlistMatches)),
          context,
        ),
        total,
      };
    },
    releaseEventsByTitle: async (_: unknown, args: any, context: any) => {
      if (!hasDb()) return [];
      const filter: Record<string, unknown> = {
        tmdbId: args.tmdbId,
        mediaType: args.mediaType,
        publicationStatus: "PUBLISHED",
      };
      if (args.region) filter.region = String(args.region).toUpperCase();
      const authUser = context?.user ?? null;
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
      return scoreReleaseEventsForContext(
        docs.map((doc) => mapReleaseEvent(doc, watchlistMatches)),
        context,
      );
    },
    watchlistReleaseEvents: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId);
      if (!hasDb()) return [];
      const saved = await WatchlistItem.find({ userId }).select("tmdbId mediaType");
      if (!saved.length) return [];
      const pairs = saved.map((item: any) => ({ tmdbId: item.tmdbId, mediaType: item.mediaType }));
      const filter = {
        publicationStatus: "PUBLISHED",
        region: String(args.region ?? WATCH_REGION).toUpperCase(),
        $or: pairs,
      };
      const docs = await ReleaseEvent.find(filter)
        .sort({ releaseDate: 1, releaseYear: 1, releaseMonth: 1 })
        .limit(20);
      const matches = new Set(saved.map((item: any) => `${item.mediaType}-${item.tmdbId}`));
      return scoreReleaseEventsForContext(
        docs.map((doc) => mapReleaseEvent(doc, matches)),
        context,
      );
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
      const user = await registerUser(args.input);
      await setAuthCookie(context.response, user, context.request);
      return { user };
    },
    login: async (_root: unknown, args: any, context: any) => {
      const user = await loginUser(args.input);
      await setAuthCookie(context.response, user, context.request);
      return { user };
    },
    logout: async (_root: unknown, _args: any, context: any) => {
      await clearAuthCookie(context.response, context.request);
      return true;
    },
    recomputeTasteProfile: async (_: unknown, args: any, context: any) => {
      const userId = authorizeUser(context, args.userId ?? null);
      return mapTasteProfile(await buildTasteProfile(userId, true));
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

      invalidateSocialMatches(userId);
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
      invalidateSocialMatches(userId);
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
      if (!existing) throw new PublicError("Release nicht gefunden.");
      const input = normalizeReleaseInput(
        { ...existing.toObject(), ...args.input },
        admin.id,
        existing,
      );
      const duplicate = await ReleaseEvent.findOne(releaseDuplicateFilter(input, args.id));
      if (duplicate) throw new PublicError("Dieser Release existiert bereits.");
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
  const region = String(input.region ?? existing?.region ?? WATCH_REGION)
    .trim()
    .toUpperCase();

  if (!input.tmdbId && !existing?.tmdbId) throw new PublicError("Titel fehlt.");
  if (!provider) throw new PublicError("Streaming-Anbieter fehlt.");
  if (!region) throw new PublicError("Region fehlt.");
  if (dateParts.datePrecision === "EXACT" && !dateParts.releaseDate) {
    throw new PublicError("Exaktes Datum fehlt.");
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

await connectDb();
const { app, close } = await createApplication(createSchema({ typeDefs, resolvers }));
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`BINGE API listening on port ${config.PORT}`);
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 10000).unref();
  server.close(() => {
    void Promise.all([close(), mongoose.disconnect()]).then(() => {
      clearTimeout(timer);
      process.exit(0);
    });
  });
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
