import type { MatchScore, Media, MediaItem } from "./tmdb.functions";

export type {
  ReleaseType,
  PublicationStatus,
  ConfirmationStatus,
  DatePrecision,
} from "../../shared/catalog";
import type {
  ReleaseType,
  PublicationStatus,
  ConfirmationStatus,
  DatePrecision,
} from "../../shared/catalog";

export interface ReleaseEvent {
  id: string;
  tmdbId: number;
  media_type: Media;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  popularity: number;
  genre_ids: number[];
  provider: string;
  region: string;
  release_date: string | null;
  date_precision: DatePrecision;
  release_year: number | null;
  release_month: number | null;
  release_quarter: number | null;
  release_type: ReleaseType;
  publication_status: PublicationStatus;
  confirmation_status: ConfirmationStatus;
  season_number: number | null;
  episode_number: number | null;
  source_url: string | null;
  notes: string;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
  is_watchlisted: boolean;
  match_score?: MatchScore | null;
}

export interface ReleaseFilters {
  region?: string;
  providers?: string[];
  mediaType?: Media;
  releaseTypes?: ReleaseType[];
  confirmationStatuses?: ConfirmationStatus[];
  publicationStatus?: PublicationStatus;
  genreIds?: number[];
  tmdbId?: number;
  year?: number;
  month?: number;
  fromDate?: string;
  toDate?: string;
  datePrecision?: DatePrecision;
  sort?: "upcoming" | "newest" | "popularity";
  limit?: number;
  offset?: number;
}

export interface ReleaseInput {
  tmdbId: number;
  mediaType: Media;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  voteAverage?: number;
  popularity?: number;
  genreIds?: number[];
  provider: string;
  region: string;
  releaseDate?: string | null;
  datePrecision: DatePrecision;
  releaseYear?: number | null;
  releaseMonth?: number | null;
  releaseQuarter?: number | null;
  releaseType: ReleaseType;
  publicationStatus?: PublicationStatus;
  confirmationStatus: ConfirmationStatus;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  sourceUrl?: string | null;
  notes?: string;
}

interface ReleaseEventResponse {
  id: string;
  tmdbId: number;
  mediaType: Media;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  popularity: number | null;
  genreIds: number[] | null;
  provider: string;
  region: string;
  releaseDate: string | null;
  datePrecision: DatePrecision;
  releaseYear: number | null;
  releaseMonth: number | null;
  releaseQuarter: number | null;
  releaseType: ReleaseType;
  publicationStatus: PublicationStatus;
  confirmationStatus: ConfirmationStatus;
  seasonNumber: number | null;
  episodeNumber: number | null;
  sourceUrl: string | null;
  notes: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
  isWatchlisted: boolean;
  matchScore?: MatchScore | null;
}

interface ReleaseConnectionResponse {
  total: number;
  items: ReleaseEventResponse[];
}

interface AdminReleaseStatsResponse {
  releasesThisMonth: number;
  upcomingReleases: number;
  drafts: number;
  unconfirmed: number;
  recentlyEdited: ReleaseEventResponse[];
}

const releaseFields = `
  id
  tmdbId
  mediaType
  title
  posterPath
  backdropPath
  voteAverage
  popularity
  genreIds
  provider
  region
  releaseDate
  datePrecision
  releaseYear
  releaseMonth
  releaseQuarter
  releaseType
  publicationStatus
  confirmationStatus
  seasonNumber
  episodeNumber
  sourceUrl
  notes
  createdBy
  updatedBy
  createdAt
  updatedAt
  isWatchlisted
  matchScore {
    score
    label
    color
    confidence
    tasteScore
    communityScore
    communityRatingCount
    similarUserScore
    similarUserCount
    reasons
    insufficientData
  }
`;

async function requestReleaseGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    typeof window === "undefined" ? "/graphql" : `${window.location.origin}/graphql`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
  );
  const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.[0]?.message ?? "Release calendar request failed.");
  }
  return payload.data;
}

function fromRelease(raw: ReleaseEventResponse): ReleaseEvent {
  return {
    id: raw.id,
    tmdbId: raw.tmdbId,
    media_type: raw.mediaType,
    title: raw.title,
    poster_path: raw.posterPath,
    backdrop_path: raw.backdropPath,
    vote_average: raw.voteAverage ?? 0,
    popularity: raw.popularity ?? 0,
    genre_ids: raw.genreIds ?? [],
    provider: raw.provider,
    region: raw.region,
    release_date: raw.releaseDate,
    date_precision: raw.datePrecision,
    release_year: raw.releaseYear,
    release_month: raw.releaseMonth,
    release_quarter: raw.releaseQuarter,
    release_type: raw.releaseType,
    publication_status: raw.publicationStatus,
    confirmation_status: raw.confirmationStatus,
    season_number: raw.seasonNumber,
    episode_number: raw.episodeNumber,
    source_url: raw.sourceUrl,
    notes: raw.notes ?? "",
    created_by: raw.createdBy,
    updated_by: raw.updatedBy,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    is_watchlisted: Boolean(raw.isWatchlisted),
    match_score: raw.matchScore ?? null,
  };
}

export function releaseInputFromMedia(
  media: MediaItem,
  values: Omit<ReleaseInput, "tmdbId" | "mediaType" | "title">,
): ReleaseInput {
  return {
    ...values,
    tmdbId: media.id,
    mediaType: media.media_type,
    title: media.title,
    posterPath: media.poster_path,
    backdropPath: media.backdrop_path,
    voteAverage: media.vote_average,
    popularity: media.popularity,
    genreIds: media.genre_ids,
  };
}

export async function getReleaseEvents(filter: ReleaseFilters = {}) {
  const data = await requestReleaseGraphql<{ releaseEvents: ReleaseConnectionResponse }>(
    `
      query ReleaseEvents($filter: ReleaseEventFilterInput) {
        releaseEvents(filter: $filter) {
          total
          items { ${releaseFields} }
        }
      }
    `,
    { filter },
  );
  return {
    total: data.releaseEvents.total as number,
    items: data.releaseEvents.items.map(fromRelease) as ReleaseEvent[],
  };
}

export async function getAdminReleaseEvents(filter: ReleaseFilters = {}) {
  const data = await requestReleaseGraphql<{ adminReleaseEvents: ReleaseConnectionResponse }>(
    `
      query AdminReleaseEvents($filter: ReleaseEventFilterInput) {
        adminReleaseEvents(filter: $filter) {
          total
          items { ${releaseFields} }
        }
      }
    `,
    { filter },
  );
  return {
    total: data.adminReleaseEvents.total as number,
    items: data.adminReleaseEvents.items.map(fromRelease) as ReleaseEvent[],
  };
}

export async function getReleaseEventsByTitle(input: {
  tmdbId: number;
  mediaType: Media;
  region?: string;
}) {
  const data = await requestReleaseGraphql<{ releaseEventsByTitle: ReleaseEventResponse[] }>(
    `
      query ReleaseEventsByTitle($tmdbId: Int!, $mediaType: MediaType!, $region: String) {
        releaseEventsByTitle(tmdbId: $tmdbId, mediaType: $mediaType, region: $region) {
          ${releaseFields}
        }
      }
    `,
    input,
  );
  return data.releaseEventsByTitle.map(fromRelease) as ReleaseEvent[];
}

export async function getWatchlistReleaseEvents(input: { userId: string; region?: string }) {
  const data = await requestReleaseGraphql<{ watchlistReleaseEvents: ReleaseEventResponse[] }>(
    `
      query WatchlistReleaseEvents($userId: String!, $region: String) {
        watchlistReleaseEvents(userId: $userId, region: $region) { ${releaseFields} }
      }
    `,
    input,
  );
  return data.watchlistReleaseEvents.map(fromRelease) as ReleaseEvent[];
}

export async function getAdminReleaseStats() {
  const data = await requestReleaseGraphql<{ adminReleaseStats: AdminReleaseStatsResponse }>(
    `
      query AdminReleaseStats {
        adminReleaseStats {
          releasesThisMonth
          upcomingReleases
          drafts
          unconfirmed
          recentlyEdited { ${releaseFields} }
        }
      }
    `,
  );
  return {
    releasesThisMonth: data.adminReleaseStats.releasesThisMonth as number,
    upcomingReleases: data.adminReleaseStats.upcomingReleases as number,
    drafts: data.adminReleaseStats.drafts as number,
    unconfirmed: data.adminReleaseStats.unconfirmed as number,
    recentlyEdited: data.adminReleaseStats.recentlyEdited.map(fromRelease) as ReleaseEvent[],
  };
}

export async function createReleaseEvent(input: ReleaseInput) {
  const data = await requestReleaseGraphql<{ createReleaseEvent: ReleaseEventResponse }>(
    `
      mutation CreateReleaseEvent($input: ReleaseEventInput!) {
        createReleaseEvent(input: $input) { ${releaseFields} }
      }
    `,
    { input },
  );
  return fromRelease(data.createReleaseEvent);
}

export async function updateReleaseEvent(id: string, input: Partial<ReleaseInput>) {
  const data = await requestReleaseGraphql<{ updateReleaseEvent: ReleaseEventResponse }>(
    `
      mutation UpdateReleaseEvent($id: ID!, $input: ReleaseEventPatchInput!) {
        updateReleaseEvent(id: $id, input: $input) { ${releaseFields} }
      }
    `,
    { id, input },
  );
  return fromRelease(data.updateReleaseEvent);
}

export async function deleteReleaseEvent(id: string) {
  await requestReleaseGraphql<{ deleteReleaseEvent: boolean }>(
    `
      mutation DeleteReleaseEvent($id: ID!) {
        deleteReleaseEvent(id: $id)
      }
    `,
    { id },
  );
}

export async function bulkCreateReleaseEvents(inputs: ReleaseInput[]) {
  const data = await requestReleaseGraphql<{ bulkCreateReleaseEvents: ReleaseEventResponse[] }>(
    `
      mutation BulkCreateReleaseEvents($inputs: [ReleaseEventInput!]!) {
        bulkCreateReleaseEvents(inputs: $inputs) { ${releaseFields} }
      }
    `,
    { inputs },
  );
  return data.bulkCreateReleaseEvents.map(fromRelease) as ReleaseEvent[];
}

export async function bulkUpdateReleaseEvents(ids: string[], input: Partial<ReleaseInput>) {
  const data = await requestReleaseGraphql<{ bulkUpdateReleaseEvents: ReleaseEventResponse[] }>(
    `
      mutation BulkUpdateReleaseEvents($ids: [ID!]!, $input: ReleaseEventPatchInput!) {
        bulkUpdateReleaseEvents(ids: $ids, input: $input) { ${releaseFields} }
      }
    `,
    { ids, input },
  );
  return data.bulkUpdateReleaseEvents.map(fromRelease) as ReleaseEvent[];
}

export async function bulkDeleteReleaseEvents(ids: string[]) {
  await requestReleaseGraphql<{ bulkDeleteReleaseEvents: boolean }>(
    `
      mutation BulkDeleteReleaseEvents($ids: [ID!]!) {
        bulkDeleteReleaseEvents(ids: $ids)
      }
    `,
    { ids },
  );
}
