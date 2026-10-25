import { WATCH_REGION, type MediaType } from "../../shared/catalog.js";

export type DiscoverOptions = {
  media: MediaType;
  page?: number | null;
  sort?: string | null;
  genre?: string | null;
  language?: string | null;
  provider?: string | null;
  year?: string | null;
};

export function discoverParameters(args: DiscoverOptions) {
  const params: Record<string, string | number | boolean | undefined> = {
    sort_by:
      args.media === "tv" && args.sort?.startsWith("primary_release_date")
        ? args.sort.replace("primary_release_date", "first_air_date")
        : args.sort || "popularity.desc",
    page: args.page ?? 1,
    include_adult: false,
  };
  if (args.genre?.startsWith("keyword:"))
    params.with_keywords = args.genre.slice("keyword:".length);
  else if (args.genre) params.with_genres = args.genre;
  if (args.language) params.with_original_language = args.language;
  if (args.provider) {
    params.watch_region = WATCH_REGION;
    params.with_watch_providers = args.provider;
    params.with_watch_monetization_types = "flatrate";
  }
  if (args.year)
    params[args.media === "movie" ? "primary_release_year" : "first_air_date_year"] = args.year;
  return params;
}
