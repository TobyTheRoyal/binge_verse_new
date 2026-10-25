import type { MediaType } from "../../shared/catalog.js";

export interface TmdbMedia {
  id: number;
  media_type?: MediaType | "person";
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
}

export interface TmdbPage {
  results: TmdbMedia[];
  page?: number;
  total_pages?: number;
  total_results?: number;
}

export interface TmdbEpisode {
  id: number;
  name?: string;
  overview?: string;
  air_date?: string | null;
  episode_number: number;
  season_number: number;
  runtime?: number | null;
  still_path?: string | null;
  vote_average?: number;
}

export interface TmdbSeason {
  season_number: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  air_date?: string | null;
  episode_count?: number;
  episodes?: TmdbEpisode[];
}

export interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
}

interface TmdbPerson {
  id: number;
  name: string;
  job?: string;
  character?: string;
  profile_path?: string | null;
}

export interface TmdbDetails extends TmdbMedia {
  tagline?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres?: { id: number; name: string }[];
  seasons?: TmdbSeason[];
  keywords?: { keywords?: { name: string }[]; results?: { name: string }[] };
  credits?: { cast?: TmdbPerson[]; crew?: TmdbPerson[] };
  created_by?: TmdbPerson[];
  external_ids?: { imdb_id?: string | null };
  imdb_id?: string | null;
  recommendations?: TmdbPage;
  videos?: { results?: { key: string; site: string; type: string }[] };
  "watch/providers"?: {
    results?: Record<
      string,
      { link?: string; flatrate?: TmdbProvider[]; rent?: TmdbProvider[]; buy?: TmdbProvider[] }
    >;
  };
}
