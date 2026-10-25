import type { IncomingMessage, ServerResponse } from "node:http";
import { DEMO_MOVIES, DEMO_WATCHLIST } from "../../server/demo/fixtures.js";

const genres = [
  { id: 28, name: "Action" },
  { id: 18, name: "Drama" },
  { id: 878, name: "Science Fiction" },
  { id: 10749, name: "Romantik" },
];

function movie(id: number, title: string, language = "en") {
  return {
    id,
    media_type: "movie" as const,
    title,
    original_title: title,
    original_language: language,
    overview: `Eine Geschichte ueber Freundschaft und neue Entscheidungen: ${title}.`,
    release_date: "2020-01-15",
    poster_path: `/poster-${id}.svg`,
    backdrop_path: `/backdrop-${id}.svg`,
    popularity: 100,
    vote_average: 8,
    vote_count: 2000,
    genre_ids: [18, 878],
  };
}

export const fixtureMovies = [
  movie(603, "Matrix"),
  ...[...DEMO_MOVIES, ...DEMO_WATCHLIST].map((item) => movie(item.tmdbId, item.title)),
  ...Array.from({ length: 45 }, (_, index) =>
    movie(
      900000 + index,
      `Katalogfilm ${String(index + 1).padStart(2, "0")}`,
      index % 2 ? "de" : "en",
    ),
  ),
];

function series(id: number, name: string) {
  const base = movie(id, name);
  return { ...base, media_type: "tv" as const, name, first_air_date: "2020-01-15" };
}

const fixtureSeries = [series(1396, "Breaking Bad"), series(288673, "The Gentlemen")];

function episodes(id: number, season: number) {
  const count = id === 1396 ? (season === 1 ? 7 : 13) : season === 0 ? 1 : 2;
  return Array.from({ length: count }, (_, index) => ({
    id: id * 100 + season * 10 + index,
    season_number: season,
    episode_number: index + 1,
    name: `Folge ${index + 1}`,
    overview: `Die Geschichte geht in Folge ${index + 1} weiter.`,
    air_date: "2020-01-01",
    runtime: 45,
    still_path: `/episode-${id}-${season}-${index}.svg`,
    vote_average: 8,
  }));
}

function page(items: unknown[], url: URL) {
  const number = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  // Consecutive pages overlap deliberately to exercise client-side deduplication.
  return {
    page: number,
    total_pages: Math.max(1, Math.ceil((items.length - 1) / 19)),
    total_results: items.length,
    results: items.slice((number - 1) * 19, (number - 1) * 19 + 20),
  };
}

export function metadataFixture(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = url.pathname.replace(/^\/3/, "");
  response.setHeader("Content-Type", "application/json");
  const send = (value: unknown) => response.end(JSON.stringify(value));
  const season = path.match(/^\/tv\/(\d+)\/season\/(\d+)$/);
  if (season) {
    const number = Number(season[2]);
    const items = episodes(Number(season[1]), number);
    if (Number(season[1]) === 288673 && number === 2) {
      items.push({
        ...items[0],
        id: 99999,
        episode_number: 3,
        name: "Zukunfts-Spoiler",
        air_date: "2999-01-01",
      });
    }
    return send({ season_number: number, name: `Staffel ${number}`, episodes: items });
  }
  if (/^\/genre\//.test(path)) return send({ genres });
  if (/^\/search\//.test(path)) {
    const query = (url.searchParams.get("query") ?? "").toLowerCase();
    const pool = path.endsWith("/movie")
      ? fixtureMovies
      : path.endsWith("/tv")
        ? fixtureSeries
        : [...fixtureMovies, ...fixtureSeries];
    return send(
      page(
        pool.filter((item) => item.title.toLowerCase().includes(query)),
        url,
      ),
    );
  }
  if (
    /^\/(discover|trending)\//.test(path) ||
    /\/(popular|top_rated|recommendations)$/.test(path)
  ) {
    let pool: Array<ReturnType<typeof movie> | ReturnType<typeof series>> = path.includes("/tv")
      ? [...fixtureSeries]
      : [...fixtureMovies];
    const language = url.searchParams.get("with_original_language");
    if (language) pool = pool.filter((item) => item.original_language === language);
    if (url.searchParams.get("with_watch_providers")?.includes("8"))
      pool = pool.filter((_, index) => index % 2 === 0);
    return send(page(pool, url));
  }
  const detail = path.match(/^\/(movie|tv)\/(\d+)$/);
  if (detail) {
    const id = Number(detail[2]);
    const item = [...fixtureMovies, ...fixtureSeries].find(
      (item) => item.id === id && item.media_type === detail[1],
    );
    if (!item) {
      response.statusCode = 404;
      return send({ status_message: "Fixture title not found" });
    }
    return send({
      ...item,
      tagline: "Ein neuer Blick auf vertraute Geschichten.",
      runtime: 120,
      number_of_episodes: id === 1396 ? 20 : 5,
      number_of_seasons: 2,
      seasons: [0, 1, 2].map((number) => ({
        season_number: number,
        name: `Staffel ${number}`,
        episode_count: episodes(id, number).length,
        air_date: "2020-01-01",
        poster_path: item.poster_path,
      })),
      genres: genres.filter((genre) => item.genre_ids.includes(genre.id)),
      credits: {
        cast: [{ id: 1, name: "Alex Example", character: "Alex", profile_path: null }],
        crew: [{ id: 2, name: "Taylor Example", job: "Director" }],
      },
      created_by: [{ id: 2, name: "Taylor Example" }],
      keywords: {
        keywords: [{ id: 9840, name: "friendship" }],
        results: [{ id: 9840, name: "friendship" }],
      },
      recommendations: { results: fixtureMovies.slice(0, 3) },
      external_ids: {},
      videos: { results: [] },
      "watch/providers": {
        results: {
          AT: {
            link: "https://www.justwatch.com/at",
            flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.svg" }],
            rent: [],
            buy: [],
          },
        },
      },
    });
  }
  response.statusCode = 404;
  return send({ status_message: "Unexpected metadata fixture request" });
}
