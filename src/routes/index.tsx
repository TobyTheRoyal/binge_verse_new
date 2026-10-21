import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clapperboard, Star, Loader2, TrendingUp } from "lucide-react";
import { TMDB_IMG, posterUrl } from "@/lib/media-assets";
import { MediaRow } from "@/components/MediaRow";
import { MatchScore } from "@/components/MatchScore";
import { RecommendedRow } from "@/components/RecommendedRow";
import { getHomeData } from "@/lib/home.functions";
import { Link } from "@/lib/navigation";
import { useContinueWatching } from "@/lib/user-data";
import {
  getReleaseEvents,
  getWatchlistReleaseEvents,
  type ReleaseEvent,
} from "@/lib/release-calendar";
import { useAuth } from "@/lib/auth-context";
import { getTasteDna } from "@/lib/taste-dna";
import { WATCH_REGION } from "../../shared/catalog";

function ContinueWatchingRow() {
  const { items, loading } = useContinueWatching();

  if (loading || items.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Weiter schauen</h2>
        <p className="text-sm text-muted-foreground">
          Deine laufenden Serien, sortiert nach letzter Aktivität
        </p>
      </div>
      <div className="flex gap-4 overflow-x-auto scroll-row pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6">
        {items.map((item) => {
          const poster = posterUrl(item.poster_path, "w185");
          const pct = item.totalEpisodes
            ? Math.round((item.watchedEpisodes / item.totalEpisodes) * 100)
            : 0;
          return (
            <Link
              key={`${item.media_type}-${item.id}`}
              href={`/title/${item.media_type}/${item.id}`}
              className="group w-[280px] shrink-0 rounded-lg border border-border bg-surface p-3 hover:border-primary/40 transition"
            >
              <div className="flex gap-3">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-background border border-border">
                  {poster && (
                    <img src={poster} alt={item.title} className="size-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-sm font-bold group-hover:text-primary">
                    {item.title}
                  </h3>
                  {item.nextEpisode && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Weiter mit S{item.nextEpisode.season_number}E{item.nextEpisode.episode_number}
                      : {item.nextEpisode.name}
                    </p>
                  )}
                  <div className="mt-3">
                    <div className="mb-1 text-[10px] text-muted-foreground">
                      {item.watchedEpisodes}/{item.totalEpisodes || "?"} Episoden
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-background">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ReleaseMiniCard({ item }: { item: ReleaseEvent }) {
  const poster = posterUrl(item.poster_path, "w185");
  return (
    <Link
      href={`/title/${item.media_type}/${item.tmdbId}`}
      className="group w-[170px] shrink-0 snap-start"
    >
      <div className="media-poster aspect-[2/3] overflow-hidden rounded-lg border border-border bg-surface">
        {poster ? (
          <img src={poster} alt={item.title} loading="lazy" className="size-full object-cover" />
        ) : null}
      </div>
      <div className="mt-2 line-clamp-2 text-sm font-bold group-hover:text-primary">
        {item.title}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {item.release_date
          ? new Date(`${item.release_date}T00:00:00`).toLocaleDateString()
          : "Coming soon"}
      </div>
      <div className="mt-1 text-xs font-semibold text-primary">{item.provider}</div>
      {item.match_score && (
        <div className="mt-2">
          <MatchScore score={item.match_score} />
        </div>
      )}
    </Link>
  );
}

function ComingSoonStreamingRow() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["home-release-events"],
    queryFn: () => getReleaseEvents({ region: WATCH_REGION, limit: 16 }),
  });
  const { data: watchlistReleases } = useQuery({
    queryKey: ["home-watchlist-release-events", user?.id],
    enabled: Boolean(user),
    queryFn: () => getWatchlistReleaseEvents({ userId: user!.id, region: WATCH_REGION }),
  });

  const items = data?.items ?? [];
  const watchlistItems = watchlistReleases ?? [];
  if (!items.length && !watchlistItems.length) return null;

  return (
    <>
      {watchlistItems.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">
                Demnächst auf deiner Watchlist
              </h2>
              <p className="text-sm text-muted-foreground">
                {watchlistItems.length} Watchlist-Titel mit Streamingstart.
              </p>
            </div>
            <Link
              href="/calendar"
              className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-primary hover:underline sm:text-sm"
            >
              Zum Kalender <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="flex snap-x gap-4 overflow-x-auto scroll-row pb-4">
            {watchlistItems.slice(0, 10).map((item) => (
              <ReleaseMiniCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
      {items.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Bald auf deinem Bildschirm</h2>
              <p className="text-sm text-muted-foreground">
                Die nächsten Kino- und Streamingstarts in Österreich
              </p>
            </div>
            <Link
              href="/calendar"
              className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-primary hover:underline sm:text-sm"
            >
              Zum Kalender <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="flex snap-x gap-4 overflow-x-auto scroll-row pb-4">
            {items.slice(0, 14).map((item) => (
              <ReleaseMiniCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function PersonalizedTasteRows() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["home-taste-dna", user?.id],
    enabled: Boolean(user),
    queryFn: () => getTasteDna(),
  });

  const sections = data?.recommendations.filter((section) => section.items.length) ?? [];
  if (!sections.length) return null;

  return (
    <>
      {sections.slice(0, 2).map((section) => (
        <MediaRow
          key={section.title}
          title={section.title}
          subtitle={section.subtitle ?? undefined}
          items={section.items}
        />
      ))}
    </>
  );
}

export function HomePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["home"],
    queryFn: getHomeData,
  });

  if (isLoading) {
    return (
      <div className="py-24 grid place-items-center text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-24 text-center text-muted-foreground">
        Die Startdaten konnten nicht geladen werden.
      </div>
    );
  }

  const f = data.featured;

  return (
    <div className="pb-16">
      {f && (
        <section className="feature-hero" aria-label="Aktueller Spotlight-Titel">
          {f.backdrop_path && (
            <img
              src={`${TMDB_IMG}/original${f.backdrop_path}`}
              alt={f.title}
              fetchPriority="high"
              className="absolute inset-0 -z-20 size-full object-cover object-[65%_center]"
            />
          )}
          <div className="hero-shade absolute inset-0 -z-10" />
          <div className="hero-content relative mx-auto flex h-full max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 md:py-12">
            <div className="max-w-[660px] space-y-5">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-primary">
                <TrendingUp className="size-4" />
                Im Spotlight
                <span className="ml-1 h-px w-10 bg-primary/50" />
              </div>
              <h1 className="text-4xl font-bold leading-[1.08] text-foreground sm:text-5xl lg:text-6xl">
                {f.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-foreground/70">
                <span className="rounded-sm border border-white/20 px-2 py-0.5 text-[11px] font-bold text-foreground">
                  {f.media_type === "tv" ? "SERIE" : "FILM"}
                </span>
                {f.release_date && <span>{new Date(f.release_date).getFullYear()}</span>}
                <span className="size-1 rounded-full bg-muted-foreground/50" />
                <span className="inline-flex items-center gap-1.5 text-gold">
                  <Star className="size-4 text-[var(--color-gold)] fill-[var(--color-gold)]" />
                  {f.vote_average.toFixed(1)}
                </span>
              </div>
              <p className="max-w-lg text-sm leading-relaxed text-foreground/75 line-clamp-3 sm:text-base">
                {f.overview}
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href={`/title/${f.media_type}/${f.id}`}
                  className="primary-action px-4 text-sm"
                >
                  <Clapperboard className="size-4" />
                  Details ansehen
                </Link>
                <Link href="/browse" className="secondary-action px-4 text-sm">
                  Mehr entdecken
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="content-stack mx-auto mt-6 max-w-7xl space-y-8 px-4 sm:px-6 sm:space-y-10">
        <ContinueWatchingRow />
        <PersonalizedTasteRows />
        <MediaRow
          title="Trending heute"
          subtitle="Was die Welt gerade schaut"
          items={data.trending}
        />
        <ComingSoonStreamingRow />
        <RecommendedRow />
        <MediaRow title="Top-Filme der Woche" items={data.trendingMovies} />
        <MediaRow title="Top-Serien der Woche" items={data.trendingTv} />
        <MediaRow title="Populäre Filme" items={data.popularMovies} />
        <MediaRow title="Populäre Serien" items={data.popularTv} />
        <MediaRow title="Bestbewertete Filme aller Zeiten" items={data.topMovies} />
        <MediaRow title="Bestbewertete Serien" items={data.topTv} />
      </div>
    </div>
  );
}
