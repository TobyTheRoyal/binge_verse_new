import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bookmark, BookmarkCheck, Star, Play, Calendar, Clock, Tv, Loader2 } from "lucide-react";
import { TMDB_IMG, posterUrl, MediaCard } from "@/components/MediaCard";
import { useAuth } from "@/lib/auth-context";
import { getDetails } from "@/lib/tmdb.functions";
import { useWatchlist, useRatings } from "@/lib/user-data";
import { Link } from "@/lib/navigation";

function SeasonRatingCard({
  seasonNumber,
  seasonName,
  posterPath,
  currentRating,
  onRate,
  onRemove,
}: {
  seasonNumber: number;
  seasonName: string;
  posterPath?: string | null;
  currentRating: number;
  onRate: (rating: number) => void;
  onRemove: () => void;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div className="rounded-2xl border border-border bg-surface/80 p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-xl border border-border bg-background/50">
          {posterPath ? (
            <img src={posterUrl(posterPath, "w92")!} alt={seasonName} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-[10px] font-bold text-muted-foreground">S{seasonNumber}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Staffel {seasonNumber}</div>
          <div className="truncate text-sm font-semibold">{seasonName}</div>
        </div>
        {currentRating > 0 && (
          <button onClick={onRemove} className="text-[10px] text-muted-foreground hover:text-destructive">
            löschen
          </button>
        )}
      </div>

      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = (hover || currentRating) >= n;
          return (
            <button
              key={n}
              onMouseEnter={() => setHover(n)}
              onClick={() => onRate(n)}
              className="p-0.5 transition-transform hover:scale-110"
              aria-label={`Staffel ${seasonNumber}: ${n} von 10 Sternen`}
            >
              <Star className={`size-4 transition-colors ${active ? "text-[var(--color-gold)] fill-[var(--color-gold)]" : "text-muted-foreground/35"}`} />
            </button>
          );
        })}
        <span className="ml-2 min-w-[3ch] text-sm font-bold text-[var(--color-gold)]">
          {hover || currentRating || "–"}
        </span>
      </div>
    </div>
  );
}

export function DetailPage({ media, id }: { media: "movie" | "tv"; id: number }) {
  const { user } = useAuth();
  const { inList, toggle } = useWatchlist();
  const { getRating, setRating, removeRating } = useRatings();
  const [hover, setHover] = useState(0);
  const { data: d, isLoading, error } = useQuery({
    queryKey: ["details", media, id, user?.id],
    queryFn: () => getDetails({ data: { media, id, userId: user?.id } }),
    staleTime: 1000 * 60 * 30,
  });

  if (isLoading) {
    return <div className="py-24 grid place-items-center text-muted-foreground"><Loader2 className="animate-spin" /></div>;
  }

  if (error || !d) {
    return <div className="py-24 text-center text-muted-foreground">Dieser Titel konnte nicht geladen werden.</div>;
  }

  const saved = inList(d.id, d.media_type);
  const myRating = getRating(d.id, d.media_type);
  const seasonCards = media === "tv"
    ? (d.seasons ?? []).filter((season) => season.season_number !== 0).map((season) => ({
        seasonNumber: season.season_number,
        seasonName: season.name,
        posterPath: season.poster_path,
        rating: getRating(d.id, d.media_type, season.season_number),
      }))
    : [];

  const item = {
    id: d.id,
    media_type: d.media_type,
    title: d.title,
    poster_path: d.poster_path,
    release_date: d.release_date,
    vote_average: d.vote_average,
  };

  const year = d.release_date ? new Date(d.release_date).getFullYear() : "—";
  const runtime = d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : null;

  return (
    <div className="pb-16">
      {/* Backdrop */}
      <div className="relative">
        <div className="absolute inset-0 h-[60vh] overflow-hidden">
          {d.backdrop_path && (
            <img src={`${TMDB_IMG}/original${d.backdrop_path}`} alt="" className="size-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-8 md:pt-16">
          <div className="grid md:grid-cols-[280px_1fr] gap-8">
            {/* Poster */}
            <div className="mx-auto md:mx-0 w-[200px] md:w-full">
              <div className="aspect-[2/3] rounded-2xl overflow-hidden border border-border shadow-2xl">
                {d.poster_path ? (
                  <img src={posterUrl(d.poster_path, "w500")!} alt={d.title} className="size-full object-cover" />
                ) : (
                  <div className="size-full grid place-items-center bg-surface text-muted-foreground">No poster</div>
                )}
              </div>
            </div>

            {/* Header */}
            <div className="space-y-5 md:pt-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-2">
                  {d.media_type === "tv" ? "Serie" : "Film"}
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05]">
                  <span className="gradient-text">{d.title}</span>
                </h1>
                {d.tagline && <p className="text-muted-foreground italic mt-2">"{d.tagline}"</p>}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                {myRating > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-gold)]/15 border border-[var(--color-gold)]/30">
                    <Star className="size-4 text-[var(--color-gold)] fill-[var(--color-gold)]" />
                    <span className="font-bold text-[var(--color-gold)]">{myRating}</span>
                    <span className="text-muted-foreground text-xs">Meine Bewertung</span>
                  </div>
                )}
                {d.imdb_rating && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-400/15 border border-yellow-400/30">
                    <span className="font-black text-yellow-400 text-xs tracking-wider">IMDB</span>
                    <span className="font-bold text-yellow-400">{d.imdb_rating}</span>
                  </div>
                )}
                {d.rt_rating && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/15 border border-red-500/30">
                    <span className="font-black text-red-400 text-xs tracking-wider">🍅 RT</span>
                    <span className="font-bold text-red-400">{d.rt_rating}</span>
                  </div>
                )}
                <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="size-4" /> {year}
                </div>
                {runtime && (
                  <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="size-4" /> {runtime}
                  </div>
                )}
                {d.number_of_seasons && (
                  <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Tv className="size-4" /> {d.number_of_seasons} Staffel{d.number_of_seasons > 1 ? "n" : ""}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {d.genres.map((g) => (
                  <span key={g.id} className="px-3 py-1 rounded-full bg-surface border border-border text-xs font-medium">{g.name}</span>
                ))}
              </div>

              <div className="space-y-2">
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-bold">Inhalt</h2>
                <p className="text-base text-foreground/90 leading-relaxed max-w-3xl">{d.overview || "Keine Beschreibung vorhanden."}</p>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-2">
                {d.trailerKey && (
                  <a href={`https://www.youtube.com/watch?v=${d.trailerKey}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 shadow-lg shadow-primary/30">
                    <Play className="size-4 fill-current" /> Trailer
                  </a>
                )}
                {user ? (
                  <button onClick={() => toggle(item)} className={`inline-flex items-center gap-2 h-11 px-6 rounded-full font-semibold transition ${saved ? "bg-accent text-accent-foreground" : "bg-surface border border-border hover:bg-surface-2"}`}>
                    {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                    {saved ? "In Watchlist" : "Zur Watchlist"}
                  </button>
                ) : (
                  <Link href="/auth" className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-surface border border-border font-semibold hover:bg-surface-2">
                    <Bookmark className="size-4" /> Login zum Speichern
                  </Link>
                )}
              </div>

              {/* Rating widget */}
              {user && (
                <div className="bg-surface border border-border rounded-2xl p-4 max-w-md">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold">{media === "tv" ? "Gesamtbewertung der Serie" : "Deine Bewertung"}</h3>
                    {myRating > 0 && (
                      <button onClick={() => removeRating(d.id, d.media_type)} className="text-xs text-muted-foreground hover:text-destructive">
                        zurücksetzen
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                      const active = (hover || myRating) >= n;
                      return (
                        <button
                          key={n}
                          onMouseEnter={() => setHover(n)}
                          onClick={() => setRating({ id: d.id, media_type: d.media_type, title: d.title, poster_path: d.poster_path, release_date: d.release_date, vote_average: d.vote_average, rating: n })}
                          className="p-1 transition-transform hover:scale-110"
                          aria-label={`${n} Sterne`}
                        >
                          <Star className={`size-5 transition-colors ${active ? "text-[var(--color-gold)] fill-[var(--color-gold)]" : "text-muted-foreground/40"}`} />
                        </button>
                      );
                    })}
                    <span className="ml-3 text-sm font-bold text-[var(--color-gold)] min-w-[3ch]">
                      {hover || myRating || "–"}/10
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {media === "tv" && seasonCards.length > 0 && (
            <section className="mt-12 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-extrabold tracking-tight">Staffel-Bewertungen</h2>
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">pro Staffel</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {seasonCards.map((season) => (
                  <SeasonRatingCard
                    key={season.seasonNumber}
                    seasonNumber={season.seasonNumber}
                    seasonName={season.seasonName}
                    posterPath={season.posterPath}
                    currentRating={season.rating}
                    onRate={(rating) => setRating({
                      id: d.id,
                      media_type: d.media_type,
                      title: d.title,
                      poster_path: d.poster_path,
                      release_date: d.release_date,
                      vote_average: d.vote_average,
                      seasonNumber: season.seasonNumber,
                      rating,
                    })}
                    onRemove={() => removeRating(d.id, d.media_type, season.seasonNumber)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Streaming providers */}
          {d.watchProviders && (d.watchProviders.flatrate.length || d.watchProviders.rent.length || d.watchProviders.buy.length) ? (
            <section className="mt-12 space-y-4">
              <h2 className="text-2xl font-extrabold tracking-tight">Wo streamen?</h2>
              <p className="text-xs text-muted-foreground">Region: {d.watchProviders.region}</p>
              <div className="grid sm:grid-cols-3 gap-4">
                {([
                  ["Streaming (Flatrate)", d.watchProviders.flatrate],
                  ["Leihen", d.watchProviders.rent],
                  ["Kaufen", d.watchProviders.buy],
                ] as const).map(([label, list]) =>
                  list.length ? (
                    <div key={label} className="bg-surface border border-border rounded-2xl p-4">
                      <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">{label}</h3>
                      <div className="flex flex-wrap gap-2">
                        {list.map((p: any) => (
                          <div key={p.provider_id} title={p.provider_name} className="size-12 rounded-xl overflow-hidden border border-border">
                            {p.logo_path && <img src={`${TMDB_IMG}/w92${p.logo_path}`} alt={p.provider_name} className="size-full object-cover" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
              {d.watchProviders.link && (
                <a href={d.watchProviders.link} target="_blank" rel="noreferrer" className="inline-block text-sm text-primary hover:underline">
                  Details bei JustWatch →
                </a>
              )}
            </section>
          ) : null}

          {/* Cast */}
          {d.cast.length > 0 && (
            <section className="mt-12 space-y-4">
              <h2 className="text-2xl font-extrabold tracking-tight">Cast</h2>
              <div className="flex gap-4 overflow-x-auto scroll-row pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6">
                {d.cast.map((c) => (
                  <div key={c.id} className="shrink-0 w-[120px] text-center">
                    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-surface border border-border mb-2">
                      {c.profile_path ? (
                        <img src={`${TMDB_IMG}/w185${c.profile_path}`} alt={c.name} className="size-full object-cover" />
                      ) : (
                        <div className="size-full grid place-items-center text-2xl text-muted-foreground">{c.name.charAt(0)}</div>
                      )}
                    </div>
                    <p className="text-xs font-semibold line-clamp-1">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{c.character}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recommendations */}
          {d.recommendations.length > 0 && (
            <section className="mt-12 space-y-4">
              <h2 className="text-2xl font-extrabold tracking-tight">Ähnliche Titel</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {d.recommendations.slice(0, 12).map((rec) => (
                  <MediaCard key={`${rec.media_type}-${rec.id}`} item={rec} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
