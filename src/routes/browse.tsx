import { useMediaSuggestions } from "@/hooks/use-media-suggestions";
import { STREAMING_PROVIDERS } from "../../shared/catalog";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Loader2, Search, SlidersHorizontal, Tv } from "lucide-react";
import { MediaCard } from "@/components/MediaCard";
import { posterUrl } from "@/lib/media-assets";
import { discoverPage, getGenres, searchMultiPage, type MediaItem } from "@/lib/tmdb.functions";
import { useNavigate, useSearchParams } from "@/lib/navigation-context";
const YEARS = Array.from({ length: 50 }, (_, i) => String(new Date().getFullYear() - i));
const SORTS = [
  { v: "popularity.desc", l: "Beliebtheit" },
  { v: "vote_average.desc", l: "Beste Bewertung" },
  { v: "primary_release_date.desc", l: "Neueste" },
  { v: "primary_release_date.asc", l: "Älteste" },
];
const LANGUAGES = [
  { v: "en", l: "Englisch" },
  { v: "de", l: "Deutsch" },
  { v: "es", l: "Spanisch" },
  { v: "ko", l: "Koreanisch" },
  { v: "ja", l: "Japanisch" },
  { v: "fr", l: "Französisch" },
  { v: "it", l: "Italienisch" },
  { v: "tr", l: "Türkisch" },
  { v: "hi", l: "Hindi" },
  { v: "zh", l: "Chinesisch" },
  { v: "pt", l: "Portugiesisch" },
  { v: "ar", l: "Arabisch" },
  { v: "ru", l: "Russisch" },
  { v: "sv", l: "Schwedisch" },
  { v: "da", l: "Dänisch" },
  { v: "nl", l: "Niederländisch" },
];
const TV_ROMANCE_GENRE = { id: "keyword:9840", name: "Romantik" };
const STREAMING_PROVIDERS_AT = STREAMING_PROVIDERS.map((provider) => ({
  v: provider.id,
  l: "browseName" in provider ? provider.browseName : provider.name,
}));
export function BrowsePage() {
  const navigate = useNavigate();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const type = searchParams.get("type") === "tv" ? "tv" : "movie";
  const genre = searchParams.get("genre") ?? undefined;
  const year = searchParams.get("year") ?? undefined;
  const sort = searchParams.get("sort") ?? undefined;
  const language = searchParams.get("language") ?? undefined;
  const provider = searchParams.get("provider") ?? undefined;
  const [text, setText] = useState(q);
  const suggestions = useMediaSuggestions(text);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setText(q), [q]);
  const genresQ = useQuery({
    queryKey: ["genres", type],
    queryFn: () => getGenres({ data: { media: type } }),
    staleTime: 1000 * 60 * 60,
  });
  const isSearch = Boolean(q.trim());
  const genreOptions = useMemo(() => {
    const base =
      genresQ.data?.map((genre) => ({
        id: String(genre.id),
        name: genre.id === 10749 ? "Romantik" : genre.name,
      })) ?? [];
    if (type !== "tv" || base.some((genre) => genre.name === TV_ROMANCE_GENRE.name)) return base;
    return [...base, TV_ROMANCE_GENRE].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [genresQ.data, type]);
  const resultsQ = useInfiniteQuery({
    queryKey: ["browse", { q, type, genre, year, sort, language, provider }],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      if (isSearch) {
        return searchMultiPage({ data: { query: q, page: pageParam, language } });
      }
      return discoverPage({
        data: {
          media: type,
          genre,
          year,
          sort_by: sort,
          page: pageParam,
          language,
          provider,
        },
      });
    },
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  });
  const results = useMemo(() => {
    const seen = new Set<string>();
    const items: MediaItem[] = [];
    for (const page of resultsQ.data?.pages ?? []) {
      for (const item of page.results) {
        const key = `${item.media_type}-${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
      }
    }
    return items;
  }, [resultsQ.data]);
  const hasNextPage = resultsQ.hasNextPage;
  const isFetchingNextPage = resultsQ.isFetchingNextPage;
  const fetchNextPage = resultsQ.fetchNextPage;
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "900px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    navigate(`/browse${query ? `?${query}` : ""}`);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    update({ q: text.trim() || undefined });
  };
  const heading = useMemo(() => {
    if (isSearch) return `Ergebnisse für "${q}"`;
    return type === "tv" ? "Serien durchstöbern" : "Filme durchstöbern";
  }, [isSearch, q, type]);
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
      <div className="space-y-6 border-b border-border pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
            <SlidersHorizontal className="size-3.5" />
            Dein nächster Filmabend
          </div>
          <h1 className="text-3xl font-semibold md:text-4xl">{heading}</h1>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                aria-hidden="true"
                className="absolute left-3.5 top-3.5 size-4 text-muted-foreground"
              />
              <input
                aria-label="Titel suchen"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Nach Titel suchen"
                className="w-full h-11 pl-10 pr-4 rounded-md bg-surface border border-input focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-sm z-20">
                  {suggestions.map((item) => {
                    const year = item.release_date
                      ? new Date(item.release_date).getFullYear()
                      : "—";
                    const poster = posterUrl(item.poster_path, "w92");
                    return (
                      <button
                        key={`${item.media_type}-${item.id}`}
                        type="button"
                        onClick={() => {
                          setText(item.title);
                          navigate(`/title/${item.media_type}/${item.id}`);
                        }}
                        className="flex w-full items-center gap-3 px-2 py-2 text-left text-sm hover:bg-surface border-b border-border last:border-b-0"
                      >
                        <div className="h-14 w-10 overflow-hidden rounded-md border border-border bg-surface/60 shrink-0">
                          {poster ? (
                            <img
                              src={poster}
                              alt={item.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-[9px] text-muted-foreground">
                              IMG
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-foreground">{item.title}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{year}</span>
                            <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {item.media_type === "tv" ? "Serie" : "Film"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="submit"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 font-bold text-primary-foreground transition hover:bg-primary/90"
            >
              <Search className="size-4" />
              Suchen
            </button>
            {isSearch && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  update({ q: undefined });
                }}
                className="h-11 px-4 rounded-md bg-surface border border-border text-sm font-medium hover:bg-surface-2"
              >
                Filter zeigen
              </button>
            )}
          </div>

          {!isSearch && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <div
                role="group"
                aria-label="Medientyp"
                className="col-span-2 inline-flex shrink-0 rounded-md border border-input bg-surface p-1"
              >
                <button
                  type="button"
                  onClick={() => update({ type: "movie", genre: undefined })}
                  aria-pressed={type === "movie"}
                  className={`inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-sm px-4 text-sm font-semibold transition ${type === "movie" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Clapperboard className="size-4" />
                  Filme
                </button>
                <button
                  type="button"
                  onClick={() => update({ type: "tv", genre: undefined })}
                  aria-pressed={type === "tv"}
                  className={`inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-sm px-4 text-sm font-semibold transition ${type === "tv" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Tv className="size-4" />
                  Serien
                </button>
              </div>

              <select
                aria-label="Genre"
                value={genre ?? ""}
                onChange={(event) => update({ genre: event.target.value || undefined })}
                className="h-11 min-w-0 rounded-md border border-input bg-surface px-3 text-sm sm:max-w-48"
              >
                <option value="">Alle Genres</option>
                {genreOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Erscheinungsjahr"
                value={year ?? ""}
                onChange={(event) => update({ year: event.target.value || undefined })}
                className="h-11 min-w-0 rounded-md border border-input bg-surface px-3 text-sm"
              >
                <option value="">Alle Jahre</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <select
                aria-label="Originalsprache"
                value={language ?? ""}
                onChange={(event) => update({ language: event.target.value || undefined })}
                className="h-11 min-w-0 rounded-md border border-input bg-surface px-3 text-sm"
              >
                <option value="">Alle Sprachen</option>
                {LANGUAGES.map((language) => (
                  <option key={language.v} value={language.v}>
                    {language.l}
                  </option>
                ))}
              </select>

              <select
                aria-label="Streamingdienst in Österreich"
                value={provider ?? ""}
                onChange={(event) => update({ provider: event.target.value || undefined })}
                className="h-11 min-w-0 rounded-md border border-input bg-surface px-3 text-sm sm:max-w-56"
              >
                <option value="">Alle Anbieter</option>
                {STREAMING_PROVIDERS_AT.map((provider) => (
                  <option key={provider.v} value={provider.v}>
                    {provider.l}
                  </option>
                ))}
              </select>

              <select
                aria-label="Sortierung"
                value={sort ?? "popularity.desc"}
                onChange={(event) => update({ sort: event.target.value })}
                className="col-span-2 h-11 min-w-0 rounded-md border border-input bg-surface px-3 text-sm"
              >
                {SORTS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.l}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>
      </div>

      {resultsQ.isError ? (
        <div role="alert" className="py-20 text-center text-muted-foreground">
          <p>Die Titel konnten nicht geladen werden.</p>
          <button
            type="button"
            onClick={() => void resultsQ.refetch()}
            className="mt-4 rounded-md border border-border px-4 py-2 font-semibold hover:text-foreground"
          >
            Erneut versuchen
          </button>
        </div>
      ) : resultsQ.isLoading ? (
        <div className="py-20 grid place-items-center text-muted-foreground">
          <Loader2 className="animate-spin" />
        </div>
      ) : results.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {results.length} geladen
              {resultsQ.data?.pages[0]?.total_results
                ? ` von ${resultsQ.data.pages[0].total_results.toLocaleString()} Treffern`
                : ""}
            </span>
            {resultsQ.isFetching && !resultsQ.isFetchingNextPage && (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" />
                Aktualisiere…
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
            {results.map((it) => (
              <MediaCard key={`${it.media_type}-${it.id}`} item={it} />
            ))}
          </div>
          <div
            ref={loadMoreRef}
            className="min-h-16 grid place-items-center text-sm text-muted-foreground"
          >
            {resultsQ.isFetchingNextPage ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Weitere Titel werden geladen…
              </span>
            ) : resultsQ.hasNextPage ? (
              <button
                type="button"
                onClick={() => void resultsQ.fetchNextPage()}
                className="h-10 rounded-full border border-border bg-surface px-5 font-semibold hover:bg-surface-2"
              >
                Mehr laden
              </button>
            ) : (
              "Alle passenden Titel geladen."
            )}
          </div>
        </>
      ) : (
        <div className="py-20 text-center text-muted-foreground">Keine Ergebnisse.</div>
      )}
    </div>
  );
}
