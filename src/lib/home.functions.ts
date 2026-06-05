import { createServerFn } from "@tanstack/react-start";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdb(path: string, params: Record<string, string> = {}) {
  const key = process.env.TMDB_API_KEY!;
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

function normalize(raw: any, fallback?: "movie" | "tv") {
  const mt = (raw.media_type ?? fallback ?? (raw.title ? "movie" : "tv")) as "movie" | "tv";
  return {
    id: raw.id as number,
    media_type: mt,
    title: (raw.title ?? raw.name ?? "Untitled") as string,
    poster_path: (raw.poster_path ?? null) as string | null,
    backdrop_path: (raw.backdrop_path ?? null) as string | null,
    overview: (raw.overview ?? "") as string,
    release_date: (raw.release_date ?? raw.first_air_date ?? null) as string | null,
    vote_average: (raw.vote_average ?? 0) as number,
    vote_count: (raw.vote_count ?? 0) as number,
    genre_ids: (raw.genre_ids ?? []) as number[],
  };
}

export const getHomeData = createServerFn({ method: "GET" }).handler(async () => {
  const [trendDay, trendMovie, trendTv, popMovie, popTv, topMovie, topTv] = await Promise.all([
    tmdb("/trending/all/day"),
    tmdb("/trending/movie/week"),
    tmdb("/trending/tv/week"),
    tmdb("/movie/popular"),
    tmdb("/tv/popular"),
    tmdb("/movie/top_rated"),
    tmdb("/tv/top_rated"),
  ]);

  const pick = (r: any, fb?: "movie" | "tv") =>
    (r.results ?? []).map((x: any) => normalize(x, fb)).filter((x: any) => x.poster_path);

  const trending = pick(trendDay);
  const featured =
    trending.find((x: any) => x.backdrop_path && x.overview) ?? trending[0] ?? null;

  return {
    featured,
    trending,
    trendingMovies: pick(trendMovie, "movie"),
    trendingTv: pick(trendTv, "tv"),
    popularMovies: pick(popMovie, "movie"),
    popularTv: pick(popTv, "tv"),
    topMovies: pick(topMovie, "movie"),
    topTv: pick(topTv, "tv"),
  };
});