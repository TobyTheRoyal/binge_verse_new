import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "./auth-context";
import { graphqlClient } from "./graphql";
import type { EpisodeInfo } from "./tmdb.functions";

export type Media = "movie" | "tv";

export interface SavedItem {
  id: number;
  media_type: Media;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number;
  addedAt: number;
}

export interface RatingEntry extends SavedItem {
  seasonNumber?: number | null;
  rating: number;
  ratedAt: number;
}

export type WatchStatus = "PLAN_TO_WATCH" | "WATCHING" | "COMPLETED" | "ON_HOLD" | "DROPPED";

export interface WatchProgress extends SavedItem {
  status: WatchStatus;
  totalEpisodes: number;
  watchedEpisodes: number;
  watchedAt: number | null;
  lastActivityAt: number;
  nextEpisode: EpisodeInfo | null;
}

interface SavedItemResponse {
  tmdbId: number;
  mediaType: Media;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number;
  addedAt?: number;
}

interface RatingResponse extends SavedItemResponse {
  seasonNumber?: number | null;
  rating: number;
  ratedAt: number;
}

interface EpisodeResponse {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
  voteAverage?: number | null;
  watched?: boolean | null;
  watchedAt?: number | null;
}

interface WatchProgressResponse extends SavedItemResponse {
  status: WatchStatus;
  totalEpisodes?: number | null;
  watchedEpisodes?: number | null;
  watchedAt?: number | null;
  lastActivityAt: number;
  nextEpisode?: EpisodeResponse | null;
}

const savedFields = `
  tmdbId
  mediaType
  title
  posterPath
  releaseDate
  voteAverage
  addedAt
`;

const ratingFields = `
  ${savedFields}
  seasonNumber
  rating
  ratedAt
`;

const episodeFields = `
  seasonNumber
  episodeNumber
  name
  overview
  airDate
  runtime
  stillPath
  voteAverage
  watched
  watchedAt
`;

const progressFields = `
  tmdbId
  mediaType
  title
  posterPath
  releaseDate
  voteAverage
  status
  totalEpisodes
  watchedEpisodes
  watchedAt
  lastActivityAt
  nextEpisode { ${episodeFields} }
`;

function fromSaved(raw: SavedItemResponse): SavedItem {
  return {
    id: raw.tmdbId,
    media_type: raw.mediaType,
    title: raw.title,
    poster_path: raw.posterPath,
    release_date: raw.releaseDate,
    vote_average: raw.voteAverage,
    addedAt: raw.addedAt ?? 0,
  };
}

function toInput(userId: string, item: Omit<SavedItem, "addedAt">) {
  return {
    userId,
    tmdbId: item.id,
    mediaType: item.media_type,
    title: item.title,
    posterPath: item.poster_path,
    releaseDate: item.release_date,
    voteAverage: item.vote_average,
  };
}

function toSeriesProgressInput(userId: string, item: Omit<SavedItem, "addedAt">) {
  const base = toInput(userId, item);
  return {
    userId: base.userId,
    tmdbId: base.tmdbId,
    title: base.title,
    posterPath: base.posterPath,
    releaseDate: base.releaseDate,
    voteAverage: base.voteAverage,
  };
}

function toRatingInput(userId: string, item: Omit<RatingEntry, "ratedAt" | "addedAt">) {
  return {
    ...toInput(userId, item),
    seasonNumber: item.seasonNumber ?? null,
    rating: item.rating,
  };
}

function fromEpisode(raw: EpisodeResponse): EpisodeInfo {
  return {
    season_number: raw.seasonNumber,
    episode_number: raw.episodeNumber,
    name: raw.name,
    overview: raw.overview,
    air_date: raw.airDate,
    runtime: raw.runtime,
    still_path: raw.stillPath,
    vote_average: raw.voteAverage ?? 0,
    watched: Boolean(raw.watched),
    watchedAt: raw.watchedAt ?? null,
  };
}

function fromProgress(raw: WatchProgressResponse): WatchProgress {
  return {
    ...fromSaved(raw),
    status: raw.status,
    totalEpisodes: raw.totalEpisodes ?? 0,
    watchedEpisodes: raw.watchedEpisodes ?? 0,
    watchedAt: raw.watchedAt ?? null,
    lastActivityAt: raw.lastActivityAt,
    nextEpisode: raw.nextEpisode ? fromEpisode(raw.nextEpisode) : null,
  };
}

function toProgressInput(
  userId: string,
  item: Omit<SavedItem, "addedAt"> & { status: WatchStatus; totalEpisodes?: number },
) {
  return {
    ...toInput(userId, item),
    status: item.status,
    totalEpisodes: item.totalEpisodes ?? 0,
  };
}

export function useWatchlist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["watchlist", user?.id];

  const query = useQuery({
    queryKey,
    enabled: Boolean(user),
    queryFn: async () => {
      const data = await graphqlClient.request<{ watchlist: SavedItemResponse[] }>(
        `
          query Watchlist($userId: String!) {
            watchlist(userId: $userId) { ${savedFields} }
          }
        `,
        { userId: user!.id },
      );
      return data.watchlist.map(fromSaved) as SavedItem[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (item: Omit<SavedItem, "addedAt">) => {
      await graphqlClient.request(
        `
          mutation AddWatchlist($input: SavedItemInput!) {
            addWatchlist(input: $input) { ${savedFields} }
          }
        `,
        { input: toInput(user!.id, item) },
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const removeMutation = useMutation({
    mutationFn: async ({ id, media_type }: Pick<SavedItem, "id" | "media_type">) => {
      await graphqlClient.request(
        `
          mutation RemoveWatchlist($userId: String!, $tmdbId: Int!, $mediaType: MediaType!) {
            removeWatchlist(userId: $userId, tmdbId: $tmdbId, mediaType: $mediaType)
          }
        `,
        { userId: user!.id, tmdbId: id, mediaType: media_type },
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const items = useMemo(() => query.data ?? [], [query.data]);
  const inList = (id: number, media_type: Media) =>
    items.some((item) => item.id === id && item.media_type === media_type);

  const add = (item: Omit<SavedItem, "addedAt">) => {
    if (!user) return false;
    addMutation.mutate(item);
    return true;
  };

  const remove = (id: number, media_type: Media) => {
    if (!user) return;
    removeMutation.mutate({ id, media_type });
  };

  const toggle = (item: Omit<SavedItem, "addedAt">) => {
    if (inList(item.id, item.media_type)) remove(item.id, item.media_type);
    else add(item);
  };

  return { items, inList, add, remove, toggle, loading: query.isLoading };
}

export function useRatings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["ratings", user?.id];

  const query = useQuery({
    queryKey,
    enabled: Boolean(user),
    queryFn: async () => {
      const data = await graphqlClient.request<{ ratings: RatingResponse[] }>(
        `
          query Ratings($userId: String!) {
            ratings(userId: $userId) { ${ratingFields} }
          }
        `,
        { userId: user!.id },
      );
      return data.ratings.map((entry) => ({
        ...fromSaved(entry),
        seasonNumber: entry.seasonNumber ?? null,
        rating: entry.rating,
        ratedAt: entry.ratedAt,
      })) as RatingEntry[];
    },
  });

  const setMutation = useMutation({
    mutationFn: async (item: Omit<RatingEntry, "ratedAt" | "addedAt">) => {
      await graphqlClient.request(
        `
          mutation RateMovie($input: RatingInput!) {
            rateMovie(input: $input) { ${ratingFields} }
          }
        `,
        { input: toRatingInput(user!.id, item) },
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const removeMutation = useMutation({
    mutationFn: async ({
      id,
      media_type,
      seasonNumber,
    }: Pick<RatingEntry, "id" | "media_type"> & { seasonNumber?: number | null }) => {
      await graphqlClient.request(
        `
          mutation RemoveRating($userId: String!, $tmdbId: Int!, $mediaType: MediaType!, $seasonNumber: Int) {
            removeRating(userId: $userId, tmdbId: $tmdbId, mediaType: $mediaType, seasonNumber: $seasonNumber)
          }
        `,
        { userId: user!.id, tmdbId: id, mediaType: media_type, seasonNumber: seasonNumber ?? null },
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const items = useMemo(() => query.data ?? [], [query.data]);
  const getRating = (id: number, media_type: Media, seasonNumber?: number | null) =>
    items.find(
      (entry) =>
        entry.id === id &&
        entry.media_type === media_type &&
        (seasonNumber == null ? entry.seasonNumber == null : entry.seasonNumber === seasonNumber),
    )?.rating ?? 0;

  const setRating = (item: Omit<RatingEntry, "ratedAt" | "addedAt">) => {
    if (!user) return false;
    setMutation.mutate(item);
    return true;
  };

  const removeRating = (id: number, media_type: Media, seasonNumber?: number | null) => {
    if (!user) return;
    removeMutation.mutate({ id, media_type, seasonNumber });
  };

  return { items, getRating, setRating, removeRating, loading: query.isLoading };
}

export function useWatchProgress(id?: number, media_type?: Media) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["watch-progress", user?.id, media_type, id];

  const query = useQuery({
    queryKey,
    enabled: Boolean(user && id && media_type),
    queryFn: async () => {
      const data = await graphqlClient.request<{ watchProgress: WatchProgressResponse | null }>(
        `
          query WatchProgress($userId: String!, $tmdbId: Int!, $mediaType: MediaType!) {
            watchProgress(userId: $userId, tmdbId: $tmdbId, mediaType: $mediaType) { ${progressFields} }
          }
        `,
        { userId: user!.id, tmdbId: id, mediaType: media_type },
      );
      return data.watchProgress ? fromProgress(data.watchProgress) : null;
    },
  });

  const invalidateProgress = () => {
    queryClient.invalidateQueries({ queryKey: ["watch-progress", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["watch-progress-list", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["continue-watching", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["season-details"] });
  };

  const setStatusMutation = useMutation({
    mutationFn: async (
      item: Omit<SavedItem, "addedAt"> & { status: WatchStatus; totalEpisodes?: number },
    ) => {
      const data = await graphqlClient.request<{ setWatchStatus: WatchProgressResponse }>(
        `
          mutation SetWatchStatus($input: WatchProgressInput!) {
            setWatchStatus(input: $input) { ${progressFields} }
          }
        `,
        { input: toProgressInput(user!.id, item) },
      );
      return fromProgress(data.setWatchStatus);
    },
    onSuccess: invalidateProgress,
  });

  const setEpisodeMutation = useMutation({
    mutationFn: async ({
      item,
      episode,
      watched,
      totalEpisodes,
    }: {
      item: Omit<SavedItem, "addedAt">;
      episode: EpisodeInfo;
      watched: boolean;
      totalEpisodes?: number;
    }) => {
      const baseInput = toSeriesProgressInput(user!.id, item);
      const data = await graphqlClient.request<{ setEpisodeWatched: WatchProgressResponse }>(
        `
          mutation SetEpisodeWatched($input: EpisodeProgressInput!) {
            setEpisodeWatched(input: $input) { ${progressFields} }
          }
        `,
        {
          input: {
            ...baseInput,
            totalEpisodes: totalEpisodes ?? 0,
            seasonNumber: episode.season_number,
            episodeNumber: episode.episode_number,
            episodeTitle: episode.name,
            airDate: episode.air_date,
            runtime: episode.runtime,
            stillPath: episode.still_path,
            watched,
          },
        },
      );
      return fromProgress(data.setEpisodeWatched);
    },
    onSuccess: invalidateProgress,
  });

  const setSeasonMutation = useMutation({
    mutationFn: async ({
      item,
      seasonNumber,
      episodes,
      watched,
      totalEpisodes,
    }: {
      item: Omit<SavedItem, "addedAt">;
      seasonNumber: number;
      episodes: EpisodeInfo[];
      watched: boolean;
      totalEpisodes?: number;
    }) => {
      const baseInput = toSeriesProgressInput(user!.id, item);
      const data = await graphqlClient.request<{ setSeasonWatched: WatchProgressResponse }>(
        `
          mutation SetSeasonWatched($input: SeasonProgressInput!) {
            setSeasonWatched(input: $input) { ${progressFields} }
          }
        `,
        {
          input: {
            ...baseInput,
            totalEpisodes: totalEpisodes ?? 0,
            seasonNumber,
            watched,
            episodes: episodes.map((episode) => ({
              episodeNumber: episode.episode_number,
              episodeTitle: episode.name,
              airDate: episode.air_date,
              runtime: episode.runtime,
              stillPath: episode.still_path,
            })),
          },
        },
      );
      return fromProgress(data.setSeasonWatched);
    },
    onSuccess: invalidateProgress,
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      await graphqlClient.request(
        `
          mutation RemoveWatchProgress($userId: String!, $tmdbId: Int!, $mediaType: MediaType!) {
            removeWatchProgress(userId: $userId, tmdbId: $tmdbId, mediaType: $mediaType)
          }
        `,
        { userId: user!.id, tmdbId: id, mediaType: media_type },
      );
    },
    onSuccess: invalidateProgress,
  });

  return {
    progress: query.data ?? null,
    loading: query.isLoading,
    setStatus: setStatusMutation.mutate,
    setEpisodeWatched: setEpisodeMutation.mutate,
    setSeasonWatched: setSeasonMutation.mutate,
    removeProgress: removeMutation.mutate,
    updating:
      setStatusMutation.isPending ||
      setEpisodeMutation.isPending ||
      setSeasonMutation.isPending ||
      removeMutation.isPending,
  };
}

export function useWatchProgressList() {
  const { user } = useAuth();
  const queryKey = ["watch-progress-list", user?.id];

  const query = useQuery({
    queryKey,
    enabled: Boolean(user),
    queryFn: async () => {
      const data = await graphqlClient.request<{ watchProgressList: WatchProgressResponse[] }>(
        `
          query WatchProgressList($userId: String!) {
            watchProgressList(userId: $userId) { ${progressFields} }
          }
        `,
        { userId: user!.id },
      );
      return data.watchProgressList.map(fromProgress) as WatchProgress[];
    },
  });

  return { items: query.data ?? [], loading: query.isLoading };
}

export function useWatchProgressActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidateProgress = () => {
    queryClient.invalidateQueries({ queryKey: ["watch-progress", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["watch-progress-list", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["continue-watching", user?.id] });
  };

  const setStatusMutation = useMutation({
    mutationFn: async (
      item: Omit<SavedItem, "addedAt"> & { status: WatchStatus; totalEpisodes?: number },
    ) => {
      const data = await graphqlClient.request<{ setWatchStatus: WatchProgressResponse }>(
        `
          mutation SetWatchStatus($input: WatchProgressInput!) {
            setWatchStatus(input: $input) { ${progressFields} }
          }
        `,
        { input: toProgressInput(user!.id, item) },
      );
      return fromProgress(data.setWatchStatus);
    },
    onSuccess: invalidateProgress,
  });

  const removeMutation = useMutation({
    mutationFn: async ({ id, media_type }: Pick<SavedItem, "id" | "media_type">) => {
      await graphqlClient.request(
        `
          mutation RemoveWatchProgress($userId: String!, $tmdbId: Int!, $mediaType: MediaType!) {
            removeWatchProgress(userId: $userId, tmdbId: $tmdbId, mediaType: $mediaType)
          }
        `,
        { userId: user!.id, tmdbId: id, mediaType: media_type },
      );
    },
    onSuccess: invalidateProgress,
  });

  return {
    setStatus: setStatusMutation.mutate,
    removeProgress: removeMutation.mutate,
    updating: setStatusMutation.isPending || removeMutation.isPending,
  };
}

export function useContinueWatching() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["continue-watching", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const data = await graphqlClient.request<{ continueWatching: WatchProgressResponse[] }>(
        `
          query ContinueWatching($userId: String!) {
            continueWatching(userId: $userId) { ${progressFields} }
          }
        `,
        { userId: user!.id },
      );
      return data.continueWatching.map(fromProgress) as WatchProgress[];
    },
  });

  return { items: query.data ?? [], loading: query.isLoading };
}
