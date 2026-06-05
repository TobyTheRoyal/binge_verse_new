import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { graphqlClient } from "./graphql";

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
  rating: number;
  ratedAt: number;
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
  rating
  ratedAt
`;

function fromSaved(raw: any): SavedItem {
  return {
    id: raw.tmdbId,
    media_type: raw.mediaType,
    title: raw.title,
    poster_path: raw.posterPath,
    release_date: raw.releaseDate,
    vote_average: raw.voteAverage,
    addedAt: raw.addedAt,
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

function toRatingInput(userId: string, item: Omit<RatingEntry, "ratedAt" | "addedAt">) {
  return {
    ...toInput(userId, item),
    rating: item.rating,
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
      const data = await graphqlClient.request<any>(
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

  const items = query.data ?? [];
  const inList = (id: number, media_type: Media) => items.some((item) => item.id === id && item.media_type === media_type);

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
      const data = await graphqlClient.request<any>(
        `
          query Ratings($userId: String!) {
            ratings(userId: $userId) { ${ratingFields} }
          }
        `,
        { userId: user!.id },
      );
      return data.ratings.map((entry: any) => ({ ...fromSaved(entry), rating: entry.rating, ratedAt: entry.ratedAt })) as RatingEntry[];
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
    mutationFn: async ({ id, media_type }: Pick<RatingEntry, "id" | "media_type">) => {
      await graphqlClient.request(
        `
          mutation RemoveRating($userId: String!, $tmdbId: Int!, $mediaType: MediaType!) {
            removeRating(userId: $userId, tmdbId: $tmdbId, mediaType: $mediaType)
          }
        `,
        { userId: user!.id, tmdbId: id, mediaType: media_type },
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const items = query.data ?? [];
  const getRating = (id: number, media_type: Media) =>
    items.find((entry) => entry.id === id && entry.media_type === media_type)?.rating ?? 0;

  const setRating = (item: Omit<RatingEntry, "ratedAt" | "addedAt">) => {
    if (!user) return false;
    setMutation.mutate(item);
    return true;
  };

  const removeRating = (id: number, media_type: Media) => {
    if (!user) return;
    removeMutation.mutate({ id, media_type });
  };

  return { items, getRating, setRating, removeRating, loading: query.isLoading };
}
