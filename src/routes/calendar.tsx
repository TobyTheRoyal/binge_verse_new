import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Sparkles,
} from "lucide-react";
import { posterUrl } from "@/components/MediaCard";
import { MatchScore } from "@/components/MatchScore";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@/lib/navigation";
import { useWatchlist } from "@/lib/user-data";
import {
  getReleaseEvents,
  getWatchlistReleaseEvents,
  type ReleaseEvent,
  type ReleaseType,
} from "@/lib/release-calendar";

const PROVIDERS = [
  "Netflix",
  "Prime Video",
  "Disney+",
  "Apple TV+",
  "HBO Max",
  "Sky",
  "Paramount+",
  "Kino",
];
const REGIONS = ["AT"];
const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  CINEMA_RELEASE: "Kinostart",
  MOVIE_PREMIERE: "Filmpremiere",
  MOVIE_CATALOG: "Film im Katalog",
  TV_SERIES_PREMIERE: "Serienpremiere",
  TV_SEASON: "Neue Staffel",
  TV_EPISODE: "Neue Episode",
  TV_CATALOG: "Serie im Katalog",
};

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatReleaseDate(item: ReleaseEvent) {
  if (item.date_precision === "EXACT" && item.release_date) {
    return new Date(`${item.release_date}T00:00:00`).toLocaleDateString();
  }
  if (item.date_precision === "MONTH") return `${item.release_month}.${item.release_year}`;
  if (item.date_precision === "QUARTER") return `Q${item.release_quarter} ${item.release_year}`;
  if (item.date_precision === "YEAR") return `${item.release_year}`;
  return "Coming soon";
}

function monthBounds(year: number, monthIndex: number) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  return {
    first,
    last,
    fromDate: toDateKey(first),
    toDate: toDateKey(last),
  };
}

function ReleaseCard({
  item,
  canToggleWatchlist,
  inList,
  toggle,
}: {
  item: ReleaseEvent;
  canToggleWatchlist: boolean;
  inList: boolean;
  toggle: () => void;
}) {
  const poster = posterUrl(item.poster_path, "w185");

  return (
    <div
      className={`group flex gap-3 rounded-lg border bg-surface p-3 transition hover:border-primary/40 ${
        item.is_watchlisted ? "border-primary/60" : "border-border"
      }`}
    >
      <Link href={`/title/${item.media_type}/${item.tmdbId}`} className="shrink-0">
        <div className="h-28 w-20 overflow-hidden rounded-md border border-border bg-background">
          {poster ? <img src={poster} alt={item.title} className="size-full object-cover" /> : null}
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/title/${item.media_type}/${item.tmdbId}`}
            className="line-clamp-2 text-sm font-bold hover:text-primary"
          >
            {item.title}
          </Link>
          {canToggleWatchlist && (
            <button
              type="button"
              onClick={toggle}
              className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-background"
              title={inList ? "Aus Watchlist entfernen" : "Zur Watchlist"}
            >
              {inList ? (
                <BookmarkCheck className="size-4 text-primary" />
              ) : (
                <Bookmark className="size-4" />
              )}
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase">
          <span className="rounded-full bg-primary/15 px-2 py-1 text-primary">{item.provider}</span>
          <span className="rounded-full bg-background px-2 py-1 text-muted-foreground">
            {item.region}
          </span>
          <span className="rounded-full bg-background px-2 py-1 text-muted-foreground">
            {item.media_type === "tv" ? "Serie" : "Film"}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {formatReleaseDate(item)} · {RELEASE_TYPE_LABELS[item.release_type]}
          {item.season_number ? ` · S${item.season_number}` : ""}
          {item.episode_number ? `E${item.episode_number}` : ""}
        </p>
        {item.is_watchlisted && (
          <p className="mt-2 text-xs font-semibold text-primary">Aus deiner Watchlist</p>
        )}
        {item.match_score && (
          <div className="mt-2">
            <MatchScore score={item.match_score} />
          </div>
        )}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const { user } = useAuth();
  const { inList, toggle } = useWatchlist();
  const today = new Date();
  const [view, setView] = useState<"month" | "week" | "list" | "soon">("month");
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [region, setRegion] = useState("AT");
  const [providers, setProviders] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<"all" | "movie" | "tv">("all");
  const [selectedDate, setSelectedDate] = useState(toDateKey(today));
  const [data, setData] = useState<{ total: number; items: ReleaseEvent[] } | null>(null);
  const [comingSoon, setComingSoon] = useState<{ total: number; items: ReleaseEvent[] } | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const bounds = monthBounds(year, month);
  const providerKey = providers.join("|");

  const filter = useMemo(
    () => ({
      region,
      providers: providers.length ? providers : undefined,
      mediaType: mediaType === "all" ? undefined : mediaType,
      year,
      month: month + 1,
      limit: 160,
    }),
    [mediaType, month, providers, region, year],
  );
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getReleaseEvents(filter)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    getReleaseEvents({
      region,
      providers: providers.length ? providers : undefined,
      mediaType: mediaType === "all" ? undefined : mediaType,
      limit: 80,
    })
      .then((result) => {
        if (!cancelled) setComingSoon(result);
      })
      .catch(() => {
        if (!cancelled) setComingSoon(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaType, providerKey, providers, region]);
  const { data: watchlistReleases } = useQuery({
    queryKey: ["watchlist-release-events", user?.id, region],
    enabled: Boolean(user),
    queryFn: () => getWatchlistReleaseEvents({ userId: user!.id, region }),
  });

  const items = data?.items ?? [];
  const exactItems = items.filter((item) => item.date_precision === "EXACT" && item.release_date);
  const grouped = useMemo(() => {
    const map = new Map<string, ReleaseEvent[]>();
    for (const item of exactItems) {
      if (!item.release_date) continue;
      map.set(item.release_date, [...(map.get(item.release_date) ?? []), item]);
    }
    return map;
  }, [exactItems]);
  const selectedItems = grouped.get(selectedDate) ?? [];
  const soonItems = (comingSoon?.items ?? []).filter((item) => item.date_precision !== "EXACT");
  const watchlistItems = watchlistReleases ?? [];

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = bounds.last.getUTCDate();
  const calendarCells = [
    ...Array.from({ length: (firstWeekday + 6) % 7 }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const weekItems = exactItems.filter((item) => {
    if (!item.release_date) return false;
    const date = new Date(`${item.release_date}T00:00:00`);
    const diff = date.getTime() - today.setHours(0, 0, 0, 0);
    return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 7;
  });
  const monthDayRows = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return {
      key,
      label: new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
      }),
      items: grouped.get(key) ?? [],
    };
  });

  const toggleProvider = (provider: string) => {
    setProviders((current) =>
      current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider],
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">BingeCalendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kino und Streaming in Österreich. Alle Starts auf einen Blick.
          </p>
        </div>
        <div
          role="group"
          aria-label="Kalenderansicht"
          className="flex max-w-full flex-wrap gap-1 rounded-md border border-input bg-surface p-1"
        >
          {(["month", "week", "list", "soon"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              aria-pressed={view === mode}
              className={`h-9 rounded-sm px-3 text-sm font-semibold transition-colors ${
                view === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted-foreground"
              }`}
            >
              {mode === "month"
                ? "Monat"
                : mode === "week"
                  ? "Woche"
                  : mode === "list"
                    ? "Liste"
                    : "Coming Soon"}
            </button>
          ))}
        </div>
      </div>

      {watchlistItems.length > 0 && (
        <section className="mt-6 rounded-lg border border-primary/40 bg-primary/10 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-primary">
            <Sparkles className="size-4" />
            {watchlistItems.length} Titel aus deiner Watchlist haben kommende Streamingstarts.
          </div>
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <select
          aria-label="Region"
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          className="h-10 rounded-md border border-input bg-surface px-3 text-sm"
        >
          {REGIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          aria-label="Medientyp"
          value={mediaType}
          onChange={(event) => setMediaType(event.target.value as "all" | "movie" | "tv")}
          className="h-10 rounded-md border border-input bg-surface px-3 text-sm"
        >
          <option value="all">Alles</option>
          <option value="movie">Filme</option>
          <option value="tv">Serien</option>
        </select>
        {PROVIDERS.map((provider) => (
          <button
            key={provider}
            onClick={() => toggleProvider(provider)}
            aria-pressed={providers.includes(provider)}
            className={`h-10 rounded-md border px-3 text-sm font-semibold transition-colors ${
              providers.includes(provider)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface"
            }`}
          >
            {provider}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          aria-label="Vorheriger Monat"
          title="Vorheriger Monat"
          onClick={() => {
            const next = new Date(Date.UTC(year, month - 1, 1));
            setYear(next.getUTCFullYear());
            setMonth(next.getUTCMonth());
          }}
          className="icon-button bg-surface"
        >
          <ChevronLeft className="size-4" />
        </button>
        <h2 className="text-xl font-extrabold">
          {new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <button
          aria-label="Nächster Monat"
          title="Nächster Monat"
          onClick={() => {
            const next = new Date(Date.UTC(year, month + 1, 1));
            setYear(next.getUTCFullYear());
            setMonth(next.getUTCMonth());
          }}
          className="icon-button bg-surface"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          Kalenderdaten konnten nicht geladen werden.
        </div>
      ) : isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Kalender wird geladen…</div>
      ) : view === "month" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-border bg-surface">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
              <div
                key={day}
                className="border-b border-border p-2 text-center text-xs font-bold text-muted-foreground"
              >
                {day}
              </div>
            ))}
            {calendarCells.map((day, index) => {
              const key = day
                ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                : "";
              const count = grouped.get(key)?.length ?? 0;
              return (
                <button
                  key={`${day ?? "blank"}-${index}`}
                  disabled={!day}
                  onClick={() => day && setSelectedDate(key)}
                  className={`min-h-24 border-b border-r border-border p-2 text-left transition ${
                    key === selectedDate
                      ? "bg-primary/15"
                      : count
                        ? "bg-background/70 hover:bg-primary/10"
                        : "hover:bg-background"
                  }`}
                >
                  {day && (
                    <>
                      <div className="text-sm font-bold">{day}</div>
                      {count > 0 && (
                        <div className="mt-2 text-xs font-semibold text-primary">
                          {count} Starts
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <CalendarDays className="size-5 text-primary" />
              {new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}
            </h3>
            {selectedItems.length ? (
              selectedItems.map((item) => (
                <ReleaseCard
                  key={item.id}
                  item={item}
                  canToggleWatchlist={Boolean(user)}
                  inList={inList(item.tmdbId, item.media_type)}
                  toggle={() =>
                    toggle({
                      id: item.tmdbId,
                      media_type: item.media_type,
                      title: item.title,
                      poster_path: item.poster_path,
                      release_date: item.release_date,
                      vote_average: item.vote_average,
                    })
                  }
                />
              ))
            ) : (
              <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
                Keine Releases an diesem Tag.
              </div>
            )}
            {exactItems.length > 0 && (
              <div className="pt-3">
                <h3 className="mb-3 text-lg font-bold">Releases im Monat</h3>
                <div className="space-y-3">
                  {exactItems.map((item) => (
                    <ReleaseCard
                      key={item.id}
                      item={item}
                      canToggleWatchlist={Boolean(user)}
                      inList={inList(item.tmdbId, item.media_type)}
                      toggle={() =>
                        toggle({
                          id: item.tmdbId,
                          media_type: item.media_type,
                          title: item.title,
                          poster_path: item.poster_path,
                          release_date: item.release_date,
                          vote_average: item.vote_average,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2 text-lg font-bold">
            <List className="size-5 text-primary" />
            {view === "week" ? "Diese Woche" : view === "soon" ? "Coming Soon" : "Alle Releases"}
          </div>
          {view === "list" ? (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {monthDayRows.map((row) => (
                <div
                  key={row.key}
                  className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[170px_1fr]"
                >
                  <div>
                    <div className="text-sm font-extrabold">{row.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.items.length
                        ? `${row.items.length} Release${row.items.length === 1 ? "" : "s"}`
                        : "Keine Releases"}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {row.items.length ? (
                      row.items.map((item) => (
                        <ReleaseCard
                          key={item.id}
                          item={item}
                          canToggleWatchlist={Boolean(user)}
                          inList={inList(item.tmdbId, item.media_type)}
                          toggle={() =>
                            toggle({
                              id: item.tmdbId,
                              media_type: item.media_type,
                              title: item.title,
                              poster_path: item.poster_path,
                              release_date: item.release_date,
                              vote_average: item.vote_average,
                            })
                          }
                        />
                      ))
                    ) : (
                      <div className="rounded-md border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                        An diesem Tag ist noch nichts eingetragen.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (view === "week" ? weekItems : soonItems).length ? (
            (view === "week" ? weekItems : soonItems).map((item) => (
              <ReleaseCard
                key={item.id}
                item={item}
                canToggleWatchlist={Boolean(user)}
                inList={inList(item.tmdbId, item.media_type)}
                toggle={() =>
                  toggle({
                    id: item.tmdbId,
                    media_type: item.media_type,
                    title: item.title,
                    poster_path: item.poster_path,
                    release_date: item.release_date,
                    vote_average: item.vote_average,
                  })
                }
              />
            ))
          ) : (
            <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted-foreground">
              Keine passenden Releases.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
