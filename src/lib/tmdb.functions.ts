import { graphqlClient } from "./graphql";

export type Media = "movie" | "tv";

export interface MediaItem {
  id: number;
  media_type: Media;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date: string | null;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
}

export interface MediaDetails extends MediaItem {
  tagline: string;
  runtime: number | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  genres: { id: number; name: string }[];
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
  voteAverage
  voteCount
  genreIds
`;

function fromMedia(raw: any): MediaItem {
  return {
    id: raw.id,
    media_type: raw.mediaType,
    title: raw.title,
    poster_path: raw.posterPath,
    backdrop_path: raw.backdropPath,
    overview: raw.overview,
    release_date: raw.releaseDate,
    vote_average: raw.voteAverage,
    vote_count: raw.voteCount,
    genre_ids: raw.genreIds,
  };
}

function fromProvider(raw: any): Provider {
  return {
    provider_id: raw.providerId,
    provider_name: raw.providerName,
    logo_path: raw.logoPath,
  };
}

function fromDetails(raw: any): MediaDetails {
  return {
    ...fromMedia(raw),
    tagline: raw.tagline ?? "",
    runtime: raw.runtime,
    number_of_seasons: raw.numberOfSeasons,
    number_of_episodes: raw.numberOfEpisodes,
    genres: raw.genres ?? [],
    imdb_rating: raw.imdbRating,
    rt_rating: raw.rottenTomatoesRating,
    imdb_id: raw.imdbId,
    cast: (raw.cast ?? []).map((member: any) => ({
      id: member.id,
      name: member.name,
      character: member.character,
      profile_path: member.profilePath,
    })),
    recommendations: (raw.recommendations ?? []).map(fromMedia),
    watchProviders: raw.watchProviders
      ? {
          link: raw.watchProviders.link,
          region: raw.watchProviders.region,
          flatrate: raw.watchProviders.flatrate.map(fromProvider),
          rent: raw.watchProviders.rent.map(fromProvider),
          buy: raw.watchProviders.buy.map(fromProvider),
        }
      : null,
    trailerKey: raw.trailerKey,
    myRating: raw.myRating,
    inWatchlist: raw.inWatchlist,
  };
}

export async function getHomeData() {
  const data = await graphqlClient.request<any>(`
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

export async function searchMulti({ data }: { data: { query: string; page?: number } }) {
  const result = await graphqlClient.request<any>(
    `
      query Search($query: String!, $page: Int) {
        search(query: $query, page: $page) { ${MEDIA_FIELDS} }
      }
    `,
    data,
  );

  return { results: result.search.map(fromMedia), total: result.search.length };
}

export async function discover({
  data,
}: {
  data: { media: Media; genre?: string; year?: string; sort_by?: string; page?: number };
}) {
  const result = await graphqlClient.request<any>(
    `
      query Discover($media: MediaType!, $genre: String, $year: String, $sort: String, $page: Int) {
        discover(media: $media, genre: $genre, year: $year, sort: $sort, page: $page) { ${MEDIA_FIELDS} }
      }
    `,
    {
      media: data.media,
      genre: data.genre,
      year: data.year,
      sort: data.sort_by,
      page: data.page,
    },
  );

  return { results: result.discover.map(fromMedia), total_pages: 1, page: data.page ?? 1 };
}

export async function getGenres({ data }: { data: { media: Media } }) {
  const result = await graphqlClient.request<any>(
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

export async function getDetails({ data }: { data: { media: Media; id: number; userId?: string } }) {
  const result = await graphqlClient.request<any>(
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
        }
      }
    `,
    data,
  );

  return fromDetails(result.details);
}

export async function getRecommendationsFor({ data }: { data: { media: Media; id: number } }) {
  const result = await graphqlClient.request<any>(
    `
      query Recommendations($media: MediaType!, $id: Int!) {
        recommendations(media: $media, id: $id) { ${MEDIA_FIELDS} }
      }
    `,
    data,
  );

  return result.recommendations.map(fromMedia) as MediaItem[];
}
