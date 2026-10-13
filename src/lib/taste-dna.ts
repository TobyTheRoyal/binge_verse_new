import { graphqlClient } from "./graphql";
import type { MatchScore, MediaItem } from "./tmdb.functions";

export interface TastePreference {
  id: string;
  name: string;
  score: number;
  observations: number;
  averageRating: number;
}

export interface TasteDNAProfile {
  userId: string;
  computedAt: number;
  ratingCount: number;
  confidence: number;
  averageRating: number;
  summary: string;
  favoriteMediaType: "movie" | "tv" | null;
  genrePreferences: TastePreference[];
  actorPreferences: TastePreference[];
  directorPreferences: TastePreference[];
  storyPreferences: TastePreference[];
  excludedGenres: number[];
  useViewingSignals: boolean;
}

export interface BingeStats {
  userId: string;
  moviesWatched: number;
  tvSeriesWatched: number;
  episodesWatched: number;
  moviesRated: number;
  seriesRated: number;
  averageRating: number;
  estimatedMinutesWatched: number;
  ratingDistribution: { rating: number; count: number }[];
  topRatedMovies: Array<{
    tmdbId: number;
    mediaType: "movie" | "tv";
    title: string;
    posterPath: string | null;
    releaseDate: string | null;
    voteAverage: number;
    rating: number;
  }>;
  topRatedSeries: BingeStats["topRatedMovies"];
  completedSeries: number;
  watchingSeries: number;
}

export interface RecommendationSection {
  title: string;
  subtitle: string | null;
  items: MediaItem[];
}

const MATCH_FIELDS = `
  score
  label
  color
  confidence
  reasons
  insufficientData
`;

const MEDIA_FIELDS = `
  id
  mediaType
  title
  posterPath
  backdropPath
  overview
  releaseDate
  popularity
  voteAverage
  voteCount
  genreIds
  matchScore { ${MATCH_FIELDS} }
`;

type MediaItemResponse = {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  releaseDate: string | null;
  popularity: number;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
  matchScore?: MatchScore | null;
};

function fromMedia(raw: MediaItemResponse): MediaItem {
  return {
    id: raw.id,
    media_type: raw.mediaType,
    title: raw.title,
    poster_path: raw.posterPath,
    backdrop_path: raw.backdropPath,
    overview: raw.overview,
    release_date: raw.releaseDate,
    popularity: raw.popularity ?? 0,
    vote_average: raw.voteAverage,
    vote_count: raw.voteCount,
    genre_ids: raw.genreIds,
    match_score: raw.matchScore ?? null,
  };
}

export async function getTasteDna({ data }: { data?: { userId?: string } } = {}) {
  const result = await graphqlClient.request<{
    tasteProfile: TasteDNAProfile;
    bingeStats: BingeStats;
    personalizedRecommendations: Array<{
      title: string;
      subtitle: string | null;
      items: MediaItemResponse[];
    }>;
  }>(
    `
      query TasteDNA($userId: String) {
        tasteProfile(userId: $userId) {
          userId
          computedAt
          ratingCount
          confidence
          averageRating
          summary
          favoriteMediaType
          genrePreferences { id name score observations averageRating }
          actorPreferences { id name score observations averageRating }
          directorPreferences { id name score observations averageRating }
          storyPreferences { id name score observations averageRating }
          excludedGenres
          useViewingSignals
        }
        bingeStats(userId: $userId) {
          userId
          moviesWatched
          tvSeriesWatched
          episodesWatched
          moviesRated
          seriesRated
          averageRating
          estimatedMinutesWatched
          ratingDistribution { rating count }
          topRatedMovies { tmdbId mediaType title posterPath releaseDate voteAverage rating }
          topRatedSeries { tmdbId mediaType title posterPath releaseDate voteAverage rating }
          completedSeries
          watchingSeries
        }
        personalizedRecommendations(userId: $userId, limit: 12) {
          title
          subtitle
          items { ${MEDIA_FIELDS} }
        }
      }
    `,
    { userId: data?.userId },
  );

  return {
    profile: result.tasteProfile,
    stats: result.bingeStats,
    recommendations: result.personalizedRecommendations.map((section) => ({
      ...section,
      items: section.items.map(fromMedia),
    })) as RecommendationSection[],
  };
}

export async function recomputeTasteDna({ data }: { data?: { userId?: string } } = {}) {
  const result = await graphqlClient.request<{ recomputeTasteProfile: TasteDNAProfile }>(
    `
      mutation RecomputeTasteDNA($userId: String) {
        recomputeTasteProfile(userId: $userId) {
          userId
          computedAt
          ratingCount
          confidence
          averageRating
          summary
          favoriteMediaType
          genrePreferences { id name score observations averageRating }
          actorPreferences { id name score observations averageRating }
          directorPreferences { id name score observations averageRating }
          storyPreferences { id name score observations averageRating }
          excludedGenres
          useViewingSignals
        }
      }
    `,
    { userId: data?.userId },
  );
  return result.recomputeTasteProfile;
}

export type { MatchScore };
