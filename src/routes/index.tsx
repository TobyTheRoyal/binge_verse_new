import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Play, Info, Star } from "lucide-react";
import { TMDB_IMG } from "@/components/MediaCard";
import { MediaRow } from "@/components/MediaRow";
import { RecommendedRow } from "@/components/RecommendedRow";
import { getHomeData } from "@/lib/home.functions";

const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: () => getHomeData(),
  staleTime: 1000 * 60 * 10,
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bingeverse — Discover" },
      { name: "description", content: "Entdecke Trends, Top-Bewertungen und persönliche Empfehlungen." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(homeQuery),
  component: Home,
});

function Home() {
  const { data } = useSuspenseQuery(homeQuery);
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
                <span className="uppercase tracking-wider text-xs">{f.media_type === "tv" ? "Serie" : "Film"}</span>
              </div>
              <p className="text-base md:text-lg text-foreground/80 line-clamp-3 max-w-xl">{f.overview}</p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to="/title/$type/$id"
                  params={{ type: f.media_type, id: String(f.id) }}
                  className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-primary/30"
                >
                  <Play className="size-4 fill-current" />
                  Details ansehen
                </Link>
                <Link
                  to="/browse"
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
        <RecommendedRow />
        <MediaRow title="Trending heute" subtitle="Was die Welt gerade schaut" items={data.trending} />
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
