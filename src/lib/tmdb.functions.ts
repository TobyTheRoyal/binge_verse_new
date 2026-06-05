import { createServerFn } from "@tanstack/react-start";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdb<T = any>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY missing");
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json();
}

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

function normalize(raw: any, fallbackMedia?: Media): MediaItem {
  const mt: Media = (raw.media_type ?? fallbackMedia ?? (raw.title ? "movie" : "tv")) as Media;
  return {
    id: raw.id,
    media_type: mt,
    title: raw.title ?? raw.name ?? "Untitled",
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    overview: raw.overview ?? "",
    release_date: raw.release_date ?? raw.first_air_date ?? null,
    vote_average: raw.vote_average ?? 0,
    vote_count: raw.vote_count ?? 0,
    genre_ids: raw.genre_ids ?? [],
  };
}

export const getTrending = createServerFn({ method: "GET" })
  .inputValidator((d: { media?: "all" | Media; window?: "day" | "week" }) => d)
  .handler(async ({ data }) => {
    const r = await tmdb<any>(`/trending/${data.media ?? "all"}/${data.window ?? "week"}`);
    return (r.results ?? []).map((x: any) => normalize(x)).filter((x: MediaItem) => x.poster_path);
  });

export const getList = createServerFn({ method: "GET" })
  .inputValidator((d: { media: Media; list: string; page?: number }) => d)
  .handler(async ({ data }) => {
    const r = await tmdb<any>(`/${data.media}/${data.list}`, { page: data.page ?? 1 });
    return (r.results ?? []).map((x: any) => normalize(x, data.media)).filter((x: MediaItem) => x.poster_path);
  });

export const searchMulti = createServerFn({ method: "GET" })
  .inputValidator((d: { query: string; page?: number }) => d)
  .handler(async ({ data }) => {
    if (!data.query.trim()) return { results: [] as MediaItem[], total: 0 };
    const r = await tmdb<any>(`/search/multi`, { query: data.query, page: data.page ?? 1, include_adult: "false" });
    const results = (r.results ?? [])
      .filter((x: any) => x.media_type === "movie" || x.media_type === "tv")
      .map((x: any) => normalize(x))
      .filter((x: MediaItem) => x.poster_path);
    return { results, total: r.total_results ?? results.length };
  });

export const discover = createServerFn({ method: "GET" })
  .inputValidator((d: { media: Media; genre?: string; year?: string; sort_by?: string; page?: number }) => d)
  .handler(async ({ data }) => {
    const params: Record<string, string | number> = {
      sort_by: data.sort_by || "popularity.desc",
      page: data.page ?? 1,
      include_adult: "false",
    };
    if (data.genre) params.with_genres = data.genre;
    if (data.year) {
      if (data.media === "movie") params.primary_release_year = data.year;
      else params.first_air_date_year = data.year;
    }
    const r = await tmdb<any>(`/discover/${data.media}`, params);
    return {
      results: (r.results ?? []).map((x: any) => normalize(x, data.media)).filter((x: MediaItem) => x.poster_path),
      total_pages: r.total_pages ?? 1,
      page: r.page ?? 1,
    };
  });

export const getGenres = createServerFn({ method: "GET" })
  .inputValidator((d: { media: Media }) => d)
  .handler(async ({ data }) => {
    const r = await tmdb<any>(`/genre/${data.media}/list`);
    return (r.genres ?? []) as { id: number; name: string }[];
  });

export const getDetails = createServerFn({ method: "GET" })
  .inputValidator((d: { media: Media; id: number }) => d)
  .handler(async ({ data }) => {
    const r = await tmdb<any>(`/${data.media}/${data.id}`, {
      append_to_response: "credits,recommendations,videos,watch/providers,external_ids",
    });

    // OMDb for IMDB + Rotten Tomatoes ratings
    let imdb_rating: string | null = null;
    let rt_rating: string | null = null;
    const imdbId: string | undefined = r.external_ids?.imdb_id || r.imdb_id;
    const omdbKey = process.env.OMDB_API_KEY;
    if (imdbId && omdbKey) {
      try {
        const o = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${omdbKey}`).then((x) => x.json());
        if (o?.imdbRating && o.imdbRating !== "N/A") imdb_rating = o.imdbRating;
        const rt = (o?.Ratings ?? []).find((x: any) => x.Source === "Rotten Tomatoes");
        if (rt?.Value) rt_rating = rt.Value;
      } catch {}
    }

    const cast = (r.credits?.cast ?? []).slice(0, 12).map((c: any) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profile_path: c.profile_path,
    }));

    const providers = r["watch/providers"]?.results ?? {};
    // Pick a sensible default region: US, then DE, then first available
    const regionKey = providers.US ? "US" : providers.DE ? "DE" : Object.keys(providers)[0];
    const region = regionKey ? providers[regionKey] : null;
    const watchProviders = region
      ? {
          link: region.link as string | undefined,
          flatrate: (region.flatrate ?? []) as any[],
          rent: (region.rent ?? []) as any[],
          buy: (region.buy ?? []) as any[],
          region: regionKey as string,
        }
      : null;

    const trailer = (r.videos?.results ?? []).find(
      (v: any) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"),
    );

    return {
      id: r.id as number,
      media_type: data.media,
      title: (r.title ?? r.name) as string,
      tagline: (r.tagline ?? "") as string,
      overview: (r.overview ?? "") as string,
      poster_path: r.poster_path as string | null,
      backdrop_path: r.backdrop_path as string | null,
      release_date: (r.release_date ?? r.first_air_date ?? null) as string | null,
      runtime: (r.runtime ?? r.episode_run_time?.[0] ?? null) as number | null,
      number_of_seasons: (r.number_of_seasons ?? null) as number | null,
      number_of_episodes: (r.number_of_episodes ?? null) as number | null,
      genres: ((r.genres ?? []) as { id: number; name: string }[]),
      vote_average: r.vote_average as number,
      vote_count: r.vote_count as number,
      imdb_rating,
      rt_rating,
      imdb_id: imdbId ?? null,
      cast,
      recommendations: ((r.recommendations?.results ?? []) as any[])
        .map((x) => normalize(x, data.media))
        .filter((x) => x.poster_path)
        .slice(0, 20),
      watchProviders,
      trailerKey: trailer?.key ?? null,
    };
  });

export const getRecommendationsFor = createServerFn({ method: "GET" })
  .inputValidator((d: { media: Media; id: number }) => d)
  .handler(async ({ data }) => {
    const r = await tmdb<any>(`/${data.media}/${data.id}/recommendations`);
    return (r.results ?? []).map((x: any) => normalize(x, data.media)).filter((x: MediaItem) => x.poster_path);
  });