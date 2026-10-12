import { useQuery } from "@tanstack/react-query";
import { Play, Info, Star, Loader2 } from "lucide-react";
import { TMDB_IMG, posterUrl } from "@/components/MediaCard";
import { MediaRow } from "@/components/MediaRow";
import { RecommendedRow } from "@/components/RecommendedRow";
import { getHomeData } from "@/lib/home.functions";
import { Link } from "@/lib/navigation";
import { useContinueWatching } from "@/lib/user-data";

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
              className="group w-[260px] shrink-0 rounded-2xl border border-border bg-surface p-3 hover:border-primary/40 transition"
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
        <section className="relative h-[68vh] min-h-[460px] w-full overflow-hidden">
          {f.backdrop_path && (
            <img
              src={`${TMDB_IMG}/original${f.backdrop_path}`}
              alt={f.title}
              className="absolute inset-0 size-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
          <div className="relative h-full mx-auto max-w-7xl px-4 sm:px-6 flex flex-col justify-end pb-12 md:pb-20">
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 backdrop-blur border border-primary/40 text-xs font-bold uppercase tracking-wider text-primary">
                <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                Trending heute
              </div>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
                <span className="gradient-text">{f.title}</span>
              </h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {f.release_date && <span>{new Date(f.release_date).getFullYear()}</span>}
                <span className="size-1 rounded-full bg-muted-foreground/50" />
                <span className="inline-flex items-center gap-1">
                  <Star className="size-4 text-[var(--color-gold)] fill-[var(--color-gold)]" />
                  {f.vote_average.toFixed(1)}
                </span>
                <span className="size-1 rounded-full bg-muted-foreground/50" />
                <span className="uppercase tracking-wider text-xs">
                  {f.media_type === "tv" ? "Serie" : "Film"}
                </span>
              </div>
              <p className="text-base md:text-lg text-foreground/80 line-clamp-3 max-w-xl">
                {f.overview}
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href={`/title/${f.media_type}/${f.id}`}
                  className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-primary/30"
                >
                  <Play className="size-4 fill-current" />
                  Details ansehen
                </Link>
                <Link
                  href="/browse"
                  className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-surface border border-border font-semibold hover:bg-surface-2 transition-colors"
                >
                  <Info className="size-4" />
                  Mehr entdecken
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-10 space-y-12">
        <ContinueWatchingRow />
        <RecommendedRow />
        <MediaRow
          title="Trending heute"
          subtitle="Was die Welt gerade schaut"
          items={data.trending}
        />
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
