import { graphqlClient } from "./graphql";
import type { MediaType } from "../../shared/catalog";
import type {
  MediaItem as ApiMediaItem,
  MovieDetails,
  Provider as ApiProvider,
  Episode,
  SeasonDetails as ApiSeasonDetails,
  HomeData,
  MediaItemConnection,
  Genre,
} from "../../shared/api.generated";

export type Media = MediaType;

export interface MediaItem {
  id: number;
  media_type: Media;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date: string | null;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  match_score?: MatchScore | null;
}

export interface MatchScore {
  score: number | null;
  label: string;
  color: string;
  confidence: number;
  tasteScore?: number | null;
  communityScore?: number | null;
  communityRatingCount?: number;
  similarUserScore?: number | null;
  similarUserCount?: number;
  reasons: string[];
  insufficientData: boolean;
}

export interface SeasonInfo {
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
}

export interface EpisodeInfo {
  season_number: number;
  episode_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number;
  watched: boolean;
  watchedAt: number | null;
}

export interface SeasonDetails {
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
  episodes: EpisodeInfo[];
}

export interface MediaDetails extends MediaItem {
  tagline: string;
  runtime: number | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  genres: { id: number; name: string }[];
  seasons: SeasonInfo[];
  imdb_rating: string | null;
  rt_rating: string | null;
  imdb_id: string | null;
  cast: { id: number; name: string; character: string | null; profile_path: string | null }[];
  recommendations: MediaItem[];
  watchProviders: {
    link: string | null;
    region: string;
    flatrate: Provider[];
    rent: Provider[];
    buy: Provider[];
  } | null;
  trailerKey: string | null;
  myRating: number | null;
  inWatchlist: boolean;
  match_score?: MatchScore | null;
}

type Provider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

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

function fromMedia(
  raw: Pick<
    ApiMediaItem,
    | "id"
    | "mediaType"
    | "title"
    | "posterPath"
    | "backdropPath"
    | "overview"
    | "releaseDate"
    | "voteAverage"
    | "voteCount"
    | "matchScore"
  > &
    Partial<Pick<ApiMediaItem, "popularity" | "genreIds">>,
): MediaItem {
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
    genre_ids: raw.genreIds ?? [],
    match_score: raw.matchScore ?? null,
  };
}

function fromProvider(raw: ApiProvider): Provider {
  return {
    provider_id: raw.providerId,
    provider_name: raw.providerName,
    logo_path: raw.logoPath ?? null,
  };
}

function fromDetails(raw: MovieDetails): MediaDetails {
  return {
    ...fromMedia(raw),
    tagline: raw.tagline ?? "",
    runtime: raw.runtime,
    number_of_seasons: raw.numberOfSeasons,
    number_of_episodes: raw.numberOfEpisodes,
    genres: raw.genres ?? [],
    seasons: (raw.seasons ?? [])
      .filter((season) => season.seasonNumber !== 0)
      .map((season) => ({
        season_number: season.seasonNumber,
        name: season.name,
        overview: season.overview ?? "",
        poster_path: season.posterPath ?? null,
        air_date: season.airDate ?? null,
        episode_count: season.episodeCount,
      })),
    imdb_rating: raw.imdbRating,
    rt_rating: raw.rottenTomatoesRating,
    imdb_id: raw.imdbId,
    cast: (raw.cast ?? []).map((member) => ({
      id: member.id,
      name: member.name,
      character: member.character ?? null,
      profile_path: member.profilePath ?? null,
    })),
    recommendations: (raw.recommendations ?? []).map(fromMedia),
    watchProviders: raw.watchProviders
      ? {
          link: raw.watchProviders.link ?? null,
          region: raw.watchProviders.region,
          flatrate: raw.watchProviders.flatrate.map(fromProvider),
          rent: raw.watchProviders.rent.map(fromProvider),
          buy: raw.watchProviders.buy.map(fromProvider),
        }
      : null,
    trailerKey: raw.trailerKey,
    myRating: raw.myRating,
    inWatchlist: raw.inWatchlist,
    match_score: raw.matchScore ?? null,
  };
}

function fromEpisode(raw: Episode): EpisodeInfo {
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

function fromSeasonDetails(raw: ApiSeasonDetails): SeasonDetails {
  return {
    season_number: raw.seasonNumber,
    name: raw.name,
    overview: raw.overview,
    poster_path: raw.posterPath,
    air_date: raw.airDate,
    episode_count: raw.episodeCount,
    episodes: (raw.episodes ?? []).map(fromEpisode),
  };
}

export async function getHomeData() {
  const data = await graphqlClient.request<{ home: HomeData }>(`
    query Home {
      home {
        featured { ${MEDIA_FIELDS} }
        trending { ${MEDIA_FIELDS} }
        trendingMovies { ${MEDIA_FIELDS} }
        trendingTv { ${MEDIA_FIELDS} }
        popularMovies { ${MEDIA_FIELDS} }
        popularTv { ${MEDIA_FIELDS} }
        topMovies { ${MEDIA_FIELDS} }
        topTv { ${MEDIA_FIELDS} }
      }
    }
  `);

  return {
    featured: data.home.featured ? fromMedia(data.home.featured) : null,
    trending: data.home.trending.map(fromMedia),
    trendingMovies: data.home.trendingMovies.map(fromMedia),
    trendingTv: data.home.trendingTv.map(fromMedia),
    popularMovies: data.home.popularMovies.map(fromMedia),
    popularTv: data.home.popularTv.map(fromMedia),
    topMovies: data.home.topMovies.map(fromMedia),
    topTv: data.home.topTv.map(fromMedia),
  };
}

function rankSearchResults(results: MediaItem[], query: string) {
  const normalizedQuery = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalizedQuery) return results;

  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

  return [...results].sort((a, b) => {
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();
    const aOverview = (a.overview ?? "").toLowerCase();
    const bOverview = (b.overview ?? "").toLowerCase();

    const cleanTitle = (title: string) =>
      title
        .replace(/^(the|a|an)\s+/i, "")
        .replace(/[^a-z0-9]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const toDateScore = (date: string | null) => {
      const parsed = date ? new Date(date).getTime() : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const scoreTitle = (
      title: string,
      overview: string,
      voteAverage: number,
      popularity: number,
      releaseDate: string | null,
    ) => {
      const normalizedTitle = title
        .replace(/[^a-z0-9]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const titleWithoutArticle = cleanTitle(title);

      let matchScore = 0;
      const titleWords = (normalizedTitle + " " + titleWithoutArticle).split(/\s+/).filter(Boolean);

      if (normalizedTitle === normalizedQuery || titleWithoutArticle === normalizedQuery)
        matchScore += 150000;
      if (
        normalizedTitle.startsWith(normalizedQuery) ||
        titleWithoutArticle.startsWith(normalizedQuery)
      )
        matchScore += 120000;
      if (
        normalizedTitle.includes(normalizedQuery) ||
        titleWithoutArticle.includes(normalizedQuery)
      )
        matchScore += 90000;
      if (overview.includes(normalizedQuery)) matchScore += 6000;

      for (const word of queryWords) {
        if (!word) continue;
        const exactWordMatch = titleWords.includes(word);
        if (exactWordMatch) matchScore += 30000;

        const wordStartMatch = titleWords.some((titleWord) => titleWord.startsWith(word));
        if (wordStartMatch) matchScore += 22000;

        const wordContainsMatch = titleWords.some((titleWord) => titleWord.includes(word));
        if (wordContainsMatch) matchScore += 12000;
      }

      const firstQueryWord = queryWords[0] ?? normalizedQuery;
      if (
        normalizedTitle.startsWith(firstQueryWord) ||
        titleWithoutArticle.startsWith(firstQueryWord)
      )
        matchScore += 15000;
      if (normalizedTitle.includes(firstQueryWord) || titleWithoutArticle.includes(firstQueryWord))
        matchScore += 8000;

      const recencyScore = toDateScore(releaseDate);
      return { matchScore, popularity, recencyScore, voteAverage };
    };

    const aScore = scoreTitle(
      aTitle,
      aOverview,
      a.vote_average ?? 0,
      a.popularity ?? 0,
      a.release_date ?? null,
    );
    const bScore = scoreTitle(
      bTitle,
      bOverview,
      b.vote_average ?? 0,
      b.popularity ?? 0,
      b.release_date ?? null,
    );

    if (bScore.matchScore !== aScore.matchScore) return bScore.matchScore - aScore.matchScore;
    if (bScore.popularity !== aScore.popularity)
      return (bScore.popularity ?? 0) - (aScore.popularity ?? 0);
    if (bScore.recencyScore !== aScore.recencyScore)
      return bScore.recencyScore - aScore.recencyScore;
    if (bScore.voteAverage !== aScore.voteAverage)
      return (bScore.voteAverage ?? 0) - (aScore.voteAverage ?? 0);
    return 0;
  });
}

export async function searchMulti({
  data,
}: {
  data: { query: string; page?: number; language?: string };
}) {
  const result = await graphqlClient.request<{ search: ApiMediaItem[] }>(
    `
      query Search($query: String!, $page: Int, $language: String) {
        search(query: $query, page: $page, language: $language) { ${MEDIA_FIELDS} }
      }
    `,
    data,
  );

  const items = result.search.map(fromMedia);
  return { results: rankSearchResults(items, data.query), total: items.length };
}

export async function searchMultiPage({
  data,
}: {
  data: { query: string; page?: number; language?: string };
}) {
  const result = await graphqlClient.request<{ searchPage: MediaItemConnection }>(
    `
      query SearchPage($query: String!, $page: Int, $language: String) {
        searchPage(query: $query, page: $page, language: $language) {
          page
          totalPages
          totalResults
          results { ${MEDIA_FIELDS} }
        }
      }
    `,
    data,
  );

  const items = result.searchPage.results.map(fromMedia);
  return {
    results: rankSearchResults(items, data.query),
    page: result.searchPage.page as number,
    total_pages: result.searchPage.totalPages as number,
    total_results: result.searchPage.totalResults as number,
  };
}

export async function searchSuggestions({
  data,
  signal,
}: {
  data: { query: string; limit?: number };
  signal?: AbortSignal;
}) {
  const result = await graphqlClient.request<{ searchSuggestions: ApiMediaItem[] }>({
    document: `
      query SearchSuggestions($query: String!, $limit: Int) {
        searchSuggestions(query: $query, limit: $limit) { ${MEDIA_FIELDS} }
      }
    `,
    variables: data,
    signal,
  });

  const items: MediaItem[] = result.searchSuggestions.map(fromMedia);
  return { results: items, total: items.length };
}

export async function discover({
  data,
}: {
  data: {
    media: Media;
    genre?: string;
    year?: string;
    sort_by?: string;
    page?: number;
    language?: string;
    provider?: string;
  };
}) {
  const result = await graphqlClient.request<{ discover: ApiMediaItem[] }>(
    `
      query Discover($media: MediaType!, $genre: String, $year: String, $sort: String, $page: Int, $language: String, $provider: String) {
        discover(media: $media, genre: $genre, year: $year, sort: $sort, page: $page, language: $language, provider: $provider) { ${MEDIA_FIELDS} }
      }
    `,
    {
      media: data.media,
      genre: data.genre,
      year: data.year,
      sort: data.sort_by,
      page: data.page,
      language: data.language,
      provider: data.provider,
    },
  );

  return { results: result.discover.map(fromMedia), total_pages: 1, page: data.page ?? 1 };
}

export async function discoverPage({
  data,
}: {
  data: {
    media: Media;
    genre?: string;
    year?: string;
    sort_by?: string;
    page?: number;
    language?: string;
    provider?: string;
  };
}) {
  const result = await graphqlClient.request<{ discoverPage: MediaItemConnection }>(
    `
      query DiscoverPage($media: MediaType!, $genre: String, $year: String, $sort: String, $page: Int, $language: String, $provider: String) {
        discoverPage(media: $media, genre: $genre, year: $year, sort: $sort, page: $page, language: $language, provider: $provider) {
          page
          totalPages
          totalResults
          results { ${MEDIA_FIELDS} }
        }
      }
    `,
    {
      media: data.media,
      genre: data.genre,
      year: data.year,
      sort: data.sort_by,
      page: data.page,
      language: data.language,
      provider: data.provider,
    },
  );

  return {
    results: result.discoverPage.results.map(fromMedia),
    page: result.discoverPage.page as number,
    total_pages: result.discoverPage.totalPages as number,
    total_results: result.discoverPage.totalResults as number,
  };
}

export async function getGenres({ data }: { data: { media: Media } }) {
  const result = await graphqlClient.request<{ genres: Genre[] }>(
    `
      query Genres($media: MediaType!) {
        genres(media: $media) {
          id
          name
        }
      }
    `,
    data,
  );

  return result.genres as { id: number; name: string }[];
}

export async function getDetails({
  data,
}: {
  data: { media: Media; id: number; userId?: string };
}) {
  const result = await graphqlClient.request<{ details: MovieDetails }>(
    `
      query Details($media: MediaType!, $id: Int!, $userId: String) {
        details(media: $media, id: $id, userId: $userId) {
          id
          mediaType
          title
          posterPath
          backdropPath
          overview
          releaseDate
          voteAverage
          voteCount
          tagline
          runtime
          numberOfSeasons
          numberOfEpisodes
          genres { id name }
          seasons {
            seasonNumber
            name
            overview
            posterPath
            airDate
            episodeCount
          }
          imdbRating
          rottenTomatoesRating
          imdbId
          cast {
            id
            name
            character
            profilePath
          }
          recommendations { ${MEDIA_FIELDS} }
          watchProviders {
            link
            region
            flatrate { providerId providerName logoPath }
            rent { providerId providerName logoPath }
            buy { providerId providerName logoPath }
          }
          trailerKey
          myRating
          inWatchlist
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
        }
      }
    `,
    data,
  );

  return fromDetails(result.details);
}

export async function getSeasonDetails({
  data,
}: {
  data: { tvId: number; seasonNumber: number; userId?: string };
}) {
  const result = await graphqlClient.request<{ seasonDetails: ApiSeasonDetails }>(
    `
      query SeasonDetails($tvId: Int!, $seasonNumber: Int!, $userId: String) {
        seasonDetails(tvId: $tvId, seasonNumber: $seasonNumber, userId: $userId) {
          seasonNumber
          name
          overview
          posterPath
          airDate
          episodeCount
          episodes {
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
          }
        }
      }
    `,
    data,
  );

  return fromSeasonDetails(result.seasonDetails);
}

export async function getRecommendationsFor({ data }: { data: { media: Media; id: number } }) {
  const result = await graphqlClient.request<{ recommendations: ApiMediaItem[] }>(
    `
      query Recommendations($media: MediaType!, $id: Int!) {
        recommendations(media: $media, id: $id) { ${MEDIA_FIELDS} }
      }
    `,
    data,
  );

  return result.recommendations.map(fromMedia) as MediaItem[];
}
