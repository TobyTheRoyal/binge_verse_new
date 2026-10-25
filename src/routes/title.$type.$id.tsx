import { useQuery } from "@tanstack/react-query";
import { WATCH_REGION } from "../../shared/catalog";
import { useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Star,
  Play,
  Calendar,
  Clock,
  Tv,
  Loader2,
  CheckCircle2,
  Circle,
  RotateCcw,
} from "lucide-react";
import { MediaCard } from "@/components/MediaCard";
import { TMDB_IMG, posterUrl } from "@/lib/media-assets";
import { MatchScore } from "@/components/MatchScore";
import { useAuth } from "@/lib/auth-context";
import { getDetails, getSeasonDetails, type EpisodeInfo } from "@/lib/tmdb.functions";
import { useWatchlist, useRatings, useWatchProgress, type WatchStatus } from "@/lib/user-data";
import { Link } from "@/lib/navigation";
import { getReleaseEventsByTitle } from "@/lib/release-calendar";

const STATUS_LABELS: Record<WatchStatus, string> = {
  PLAN_TO_WATCH: "Geplant",
  WATCHING: "Angefangen",
  COMPLETED: "Abgeschlossen",
  ON_HOLD: "Pausiert",
  DROPPED: "Abgebrochen",
};

function progressPercent(watched: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((watched / total) * 100));
}

function isAvailable(episode: EpisodeInfo) {
  if (!episode.air_date) return false;
  const airDate = new Date(episode.air_date).getTime();
  return Number.isFinite(airDate) && airDate <= Date.now();
}

function formatRating(rating: number) {
  if (!rating) return "–";
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}

function RatingStars({
  currentRating,
  onRate,
  ariaPrefix,
  starClassName = "size-5",
}: {
  currentRating: number;
  onRate?: (rating: number) => void;
  ariaPrefix: string;
  starClassName?: string;
}) {
  const [hover, setHover] = useState(0);
  const displayRating = hover || currentRating;

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: 10 }, (_, index) => {
        const halfRating = index + 0.5;
        const fullRating = index + 1;
        const fill = Math.max(0, Math.min(1, displayRating - index)) * 100;

        return (
          <div key={fullRating} className={`relative shrink-0 ${starClassName}`}>
            <Star
              className={`absolute inset-0 ${starClassName} text-muted-foreground/35`}
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute inset-0 overflow-hidden text-[var(--color-gold)]"
              style={{ width: `${fill}%` }}
              aria-hidden="true"
            >
              <Star className={`${starClassName} fill-[var(--color-gold)]`} />
            </span>
            {onRate && (
              <>
                <button
                  type="button"
                  onMouseEnter={() => setHover(halfRating)}
                  onFocus={() => setHover(halfRating)}
                  onClick={() => onRate(halfRating)}
                  className="absolute inset-y-0 left-0 z-10 w-1/2 rounded-l-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  aria-label={`${ariaPrefix}: ${halfRating} von 10 Sternen`}
                />
                <button
                  type="button"
                  onMouseEnter={() => setHover(fullRating)}
                  onFocus={() => setHover(fullRating)}
                  onClick={() => onRate(fullRating)}
                  className="absolute inset-y-0 right-0 z-10 w-1/2 rounded-r-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  aria-label={`${ariaPrefix}: ${fullRating} von 10 Sternen`}
                />
              </>
            )}
          </div>
        );
      })}
      <span className="ml-3 min-w-[4ch] text-sm font-bold text-[var(--color-gold)]">
        {formatRating(displayRating)}/10
      </span>
    </div>
  );
}

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
  onRate?: (rating: number) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/80 p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-xl border border-border bg-background/50">
          {posterPath ? (
            <img
              src={posterUrl(posterPath, "w92")!}
              alt={seasonName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[10px] font-bold text-muted-foreground">
              S{seasonNumber}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase text-muted-foreground">Staffel {seasonNumber}</div>
          <div className="truncate text-sm font-semibold">{seasonName}</div>
        </div>
        {currentRating > 0 && onRemove && (
          <button
            onClick={onRemove}
            className="text-[10px] text-muted-foreground hover:text-destructive"
          >
            löschen
          </button>
        )}
      </div>

      <RatingStars
        currentRating={currentRating}
        onRate={onRate}
        ariaPrefix={`Staffel ${seasonNumber}`}
        starClassName="size-4"
      />
    </div>
  );
}

export function DetailPage({ media, id }: { media: "movie" | "tv"; id: number }) {
  const { user } = useAuth();
  const { inList, toggle } = useWatchlist();
  const { getRating, setRating, removeRating, error: ratingError } = useRatings();
  const { progress, setStatus, setEpisodeWatched, setSeasonWatched, removeProgress, updating } =
    useWatchProgress(id, media);
  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const {
    data: d,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["details", media, id, user?.id],
    queryFn: () => getDetails({ data: { media, id, userId: user?.id } }),
    staleTime: 1000 * 60 * 30,
  });
  const selectedSeason =
    activeSeason ??
    (media === "tv"
      ? (d?.seasons.find((season) => season.season_number !== 0)?.season_number ?? null)
      : null);
  const seasonQ = useQuery({
    queryKey: ["season-details", id, selectedSeason, user?.id],
    enabled: media === "tv" && Boolean(d && selectedSeason),
    queryFn: () =>
      getSeasonDetails({ data: { tvId: id, seasonNumber: selectedSeason!, userId: user?.id } }),
    staleTime: 1000 * 60 * 10,
  });
  const releaseQ = useQuery({
    queryKey: ["release-events-title", media, id],
    queryFn: () => getReleaseEventsByTitle({ tmdbId: id, mediaType: media, region: WATCH_REGION }),
    staleTime: 1000 * 60 * 10,
  });

  if (isLoading) {
    return (
      <div className="py-24 grid place-items-center text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error || !d) {
    return (
      <div className="py-24 text-center text-muted-foreground">
        Dieser Titel konnte nicht geladen werden.
      </div>
    );
  }

  const saved = inList(d.id, d.media_type);
  const myRating = getRating(d.id, d.media_type);
  const totalEpisodes =
    d.number_of_episodes ?? d.seasons.reduce((sum, season) => sum + season.episode_count, 0);
  const seasonCards =
    media === "tv"
      ? (d.seasons ?? [])
          .filter((season) => season.season_number !== 0)
          .map((season) => ({
            seasonNumber: season.season_number,
            seasonName: season.name,
            posterPath: season.poster_path,
            rating: getRating(d.id, d.media_type, season.season_number),
          }))
      : [];
  const ratedSeasonCards = seasonCards.filter((season) => season.rating > 0);
  const computedSeriesRating = ratedSeasonCards.length
    ? Math.round(
        (ratedSeasonCards.reduce((sum, season) => sum + season.rating, 0) /
          ratedSeasonCards.length) *
          10,
      ) / 10
    : 0;
  const displayedRating = media === "tv" ? computedSeriesRating || myRating : myRating;
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
  const watchedEpisodes = progress?.watchedEpisodes ?? 0;
  const totalForProgress = progress?.totalEpisodes || totalEpisodes;
  const pct = progressPercent(watchedEpisodes, totalForProgress);

  return (
    <div className="pb-16">
      {/* Backdrop */}
      <div className="relative">
        <div className="absolute inset-0 h-[60vh] overflow-hidden">
          {d.backdrop_path && (
            <img
              src={`${TMDB_IMG}/original${d.backdrop_path}`}
              alt=""
              className="size-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-8 md:pt-16">
          <div className="grid md:grid-cols-[280px_1fr] gap-8">
            {/* Poster */}
            <div className="mx-auto md:mx-0 w-[200px] md:w-full">
              <div className="aspect-[2/3] rounded-2xl overflow-hidden border border-border shadow-2xl">
                {d.poster_path ? (
                  <img
                    src={posterUrl(d.poster_path, "w500")!}
                    alt={d.title}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="size-full grid place-items-center bg-surface text-muted-foreground">
                    No poster
                  </div>
                )}
              </div>
            </div>

            {/* Header */}
            <div className="space-y-5 md:pt-4">
              <div>
                <div className="text-xs uppercase text-primary font-bold mb-2">
                  {d.media_type === "tv" ? "Serie" : "Film"}
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05]">
                  {d.title}
                </h1>
                {d.tagline && <p className="text-muted-foreground italic mt-2">"{d.tagline}"</p>}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                {d.match_score && <MatchScore score={d.match_score} size="large" />}
                {displayedRating > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-gold)]/15 border border-[var(--color-gold)]/30">
                    <Star className="size-4 text-[var(--color-gold)] fill-[var(--color-gold)]" />
                    <span className="font-bold text-[var(--color-gold)]">
                      {formatRating(displayedRating)}
                    </span>
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
                    <Tv className="size-4" /> {d.number_of_seasons} Staffel
                    {d.number_of_seasons > 1 ? "n" : ""}
                  </div>
                )}
              </div>

              {d.match_score && d.match_score.reasons.length > 0 && (
                <details className="max-w-xl rounded-2xl border border-border bg-surface/80 p-4">
                  <summary className="cursor-pointer text-sm font-bold">
                    Warum dieser Match?
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {typeof d.match_score.tasteScore === "number" && (
                      <span className="rounded-full border border-border bg-background/80 px-2.5 py-1">
                        TasteDNA {d.match_score.tasteScore}%
                      </span>
                    )}
                    {typeof d.match_score.similarUserScore === "number" && (
                      <span className="rounded-full border border-border bg-background/80 px-2.5 py-1">
                        Ähnliche User {d.match_score.similarUserScore}%
                      </span>
                    )}
                    {typeof d.match_score.communityScore === "number" && (
                      <span className="rounded-full border border-border bg-background/80 px-2.5 py-1">
                        Community {d.match_score.communityScore}%
                      </span>
                    )}
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {d.match_score.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex flex-wrap gap-2">
                {d.genres.map((g) => (
                  <span
                    key={g.id}
                    className="px-3 py-1 rounded-full bg-surface border border-border text-xs font-medium"
                  >
                    {g.name}
                  </span>
                ))}
              </div>

              {user && (
                <div className="bg-surface border border-border rounded-2xl p-4 max-w-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold">Watch Status</h3>
                      {media === "tv" && (
                        <p className="text-xs text-muted-foreground">
                          {watchedEpisodes}/{totalForProgress || "?"} Episoden gesehen
                        </p>
                      )}
                    </div>
                    <select
                      value={progress?.status ?? "PLAN_TO_WATCH"}
                      disabled={updating}
                      onChange={(event) =>
                        setStatus({
                          ...item,
                          status: event.target.value as WatchStatus,
                          totalEpisodes,
                        })
                      }
                      className="h-10 px-3 rounded-full bg-background border border-border text-sm"
                    >
                      {(Object.keys(STATUS_LABELS) as WatchStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {media === "tv" && (
                    <>
                      <div className="h-2 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {progress?.nextEpisode ? (
                        <p className="text-xs text-muted-foreground">
                          Nächste Episode: S{progress.nextEpisode.season_number}E
                          {progress.nextEpisode.episode_number} · {progress.nextEpisode.name}
                        </p>
                      ) : watchedEpisodes > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Keine verfügbare ungesehene Episode gefunden.
                        </p>
                      ) : null}
                    </>
                  )}
                  {progress && (
                    <button
                      type="button"
                      onClick={() => removeProgress()}
                      disabled={updating}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <RotateCcw className="size-3.5" />
                      Fortschritt zurücksetzen
                    </button>
                  )}
                </div>
              )}

              {releaseQ.data && releaseQ.data.length > 0 && (
                <div className="max-w-xl rounded-2xl border border-primary/35 bg-primary/10 p-4">
                  <h3 className="text-sm font-bold text-primary">Nächster Streamingstart</h3>
                  <p className="mt-1 text-sm text-foreground/90">
                    {releaseQ.data[0].provider} ·{" "}
                    {releaseQ.data[0].release_date
                      ? new Date(`${releaseQ.data[0].release_date}T00:00:00`).toLocaleDateString()
                      : "Coming soon"}
                    {releaseQ.data[0].season_number
                      ? ` · Staffel ${releaseQ.data[0].season_number}`
                      : ""}
                    {releaseQ.data[0].episode_number
                      ? ` Episode ${releaseQ.data[0].episode_number}`
                      : ""}
                  </p>
                  <Link
                    href="/calendar"
                    className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                  >
                    Im BingeCalendar ansehen
                  </Link>
                </div>
              )}

              <div className="space-y-2">
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-bold">
                  Inhalt
                </h2>
                <p className="text-base text-foreground/90 leading-relaxed max-w-3xl">
                  {d.overview || "Keine Beschreibung vorhanden."}
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-2">
                {d.trailerKey && (
                  <a
                    href={`https://www.youtube.com/watch?v=${d.trailerKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 shadow-lg shadow-primary/30"
                  >
                    <Play className="size-4 fill-current" /> Trailer
                  </a>
                )}
                {user ? (
                  <button
                    onClick={() => toggle(item)}
                    className={`inline-flex items-center gap-2 h-11 px-6 rounded-full font-semibold transition ${saved ? "bg-accent text-accent-foreground" : "bg-surface border border-border hover:bg-surface-2"}`}
                  >
                    {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                    {saved ? "In Watchlist" : "Zur Watchlist"}
                  </button>
                ) : (
                  <Link
                    href="/auth"
                    className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-surface border border-border font-semibold hover:bg-surface-2"
                  >
                    <Bookmark className="size-4" /> Login zum Speichern
                  </Link>
                )}
              </div>

              {/* Rating widget */}
              {user && media === "movie" && ratingError && (
                <p role="alert" className="text-sm text-destructive">
                  {ratingError}
                </p>
              )}
              {user && (
                <div className="bg-surface border border-border rounded-2xl p-4 max-w-md">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold">
                      {media === "tv" ? "Serienbewertung aus Staffeln" : "Deine Bewertung"}
                    </h3>
                    {media === "movie" && myRating > 0 && (
                      <button
                        onClick={() => removeRating(d.id, d.media_type)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        zurücksetzen
                      </button>
                    )}
                  </div>
                  <RatingStars
                    currentRating={displayedRating}
                    ariaPrefix={media === "tv" ? "Serienbewertung" : "Deine Bewertung"}
                    onRate={
                      media === "movie"
                        ? (rating) => {
                            setRating({
                              id: d.id,
                              media_type: d.media_type,
                              title: d.title,
                              poster_path: d.poster_path,
                              release_date: d.release_date,
                              vote_average: d.vote_average,
                              rating,
                            });
                          }
                        : undefined
                    }
                  />
                  {media === "tv" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {ratedSeasonCards.length
                        ? `Durchschnitt aus ${ratedSeasonCards.length} Staffelbewertung${ratedSeasonCards.length === 1 ? "" : "en"}.`
                        : "Bewerte eine Staffel, um die Serienbewertung zu setzen."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {media === "tv" && seasonCards.length > 0 && (
            <section className="mt-12 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-extrabold tracking-tight">Staffel-Bewertungen</h2>
                <span className="text-[10px] uppercase text-muted-foreground">pro Staffel</span>
              </div>
              {user && ratingError && (
                <p role="alert" className="text-sm text-destructive">
                  {ratingError}
                </p>
              )}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {seasonCards.map((season) => (
                  <SeasonRatingCard
                    key={season.seasonNumber}
                    seasonNumber={season.seasonNumber}
                    seasonName={season.seasonName}
                    posterPath={season.posterPath}
                    currentRating={season.rating}
                    onRate={
                      user
                        ? (rating) => {
                            setRating({
                              id: d.id,
                              media_type: d.media_type,
                              title: d.title,
                              poster_path: d.poster_path,
                              release_date: d.release_date,
                              vote_average: d.vote_average,
                              seasonNumber: season.seasonNumber,
                              rating,
                            });
                          }
                        : undefined
                    }
                    onRemove={() => removeRating(d.id, d.media_type, season.seasonNumber)}
                  />
                ))}
              </div>
            </section>
          )}

          {media === "tv" && seasonCards.length > 0 && (
            <section className="mt-12 space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight">Episode Tracker</h2>
                  <p className="text-sm text-muted-foreground">
                    Markiere Episoden oder ganze Staffeln als gesehen, ohne deine Bewertung zu
                    verändern.
                  </p>
                </div>
                <div className="text-sm font-semibold text-primary">{pct}% komplett</div>
              </div>

              <div className="flex gap-2 overflow-x-auto scroll-row pb-2">
                {seasonCards.map((season) => (
                  <button
                    key={season.seasonNumber}
                    type="button"
                    onClick={() => setActiveSeason(season.seasonNumber)}
                    className={`shrink-0 h-10 px-4 rounded-full border text-sm font-semibold transition ${
                      selectedSeason === season.seasonNumber
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-surface border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Staffel {season.seasonNumber}
                  </button>
                ))}
              </div>

              {seasonQ.isLoading ? (
                <div className="py-10 grid place-items-center text-muted-foreground">
                  <Loader2 className="animate-spin" />
                </div>
              ) : seasonQ.error || !seasonQ.data ? (
                <div className="py-10 text-center text-muted-foreground">
                  Diese Staffel konnte nicht geladen werden.
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-surface/70 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                    <div>
                      <h3 className="font-bold">{seasonQ.data.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {seasonQ.data.episodes.filter((episode) => episode.watched).length}/
                        {seasonQ.data.episodes.filter(isAvailable).length} verfügbare Episoden
                        gesehen
                      </p>
                    </div>
                    {user ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={updating}
                          onClick={() =>
                            setSeasonWatched({
                              item,
                              seasonNumber: seasonQ.data.season_number,
                              episodes: seasonQ.data.episodes.filter(isAvailable),
                              watched: true,
                              totalEpisodes,
                            })
                          }
                          className="h-9 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-60"
                        >
                          Staffel gesehen
                        </button>
                        <button
                          type="button"
                          disabled={updating}
                          onClick={() =>
                            setSeasonWatched({
                              item,
                              seasonNumber: seasonQ.data.season_number,
                              episodes: seasonQ.data.episodes.filter(isAvailable),
                              watched: false,
                              totalEpisodes,
                            })
                          }
                          className="h-9 px-3 rounded-full bg-background border border-border text-xs font-semibold hover:bg-surface-2 disabled:opacity-60"
                        >
                          zurücksetzen
                        </button>
                      </div>
                    ) : (
                      <Link
                        href="/auth"
                        className="h-9 px-3 inline-flex items-center rounded-full bg-background border border-border text-xs font-semibold hover:bg-surface-2"
                      >
                        Login zum Tracken
                      </Link>
                    )}
                  </div>

                  <div className="divide-y divide-border">
                    {seasonQ.data.episodes.map((episode) => {
                      const available = isAvailable(episode);
                      const still = episode.still_path
                        ? `${TMDB_IMG}/w300${episode.still_path}`
                        : null;
                      return (
                        <div
                          key={episode.episode_number}
                          className="grid gap-3 p-4 sm:grid-cols-[120px_1fr_auto]"
                        >
                          <div className="h-20 overflow-hidden rounded-xl bg-background border border-border">
                            {still && available ? (
                              <img src={still} alt="" className="size-full object-cover" />
                            ) : (
                              <div className="grid size-full place-items-center text-xs text-muted-foreground">
                                S{episode.season_number}E{episode.episode_number}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-primary">
                                E{episode.episode_number}
                              </span>
                              <h4 className="font-semibold">
                                {available ? episode.name : "Noch nicht ausgestrahlt"}
                              </h4>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>
                                {episode.air_date
                                  ? new Date(episode.air_date).toLocaleDateString()
                                  : "Kein Datum"}
                              </span>
                              {episode.runtime ? <span>{episode.runtime} min</span> : null}
                            </div>
                            <p className="mt-2 text-sm text-foreground/75 line-clamp-2">
                              {available
                                ? episode.overview || "Keine Beschreibung vorhanden."
                                : "Beschreibung wird ausgeblendet, bis die Episode verfügbar ist."}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!user || !available || updating}
                            onClick={() =>
                              setEpisodeWatched({
                                item,
                                episode,
                                watched: !episode.watched,
                                totalEpisodes,
                              })
                            }
                            className={`self-start inline-flex items-center gap-2 h-10 px-3 rounded-full border text-xs font-semibold transition disabled:opacity-50 ${
                              episode.watched
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:bg-surface-2"
                            }`}
                          >
                            {episode.watched ? (
                              <CheckCircle2 className="size-4" />
                            ) : (
                              <Circle className="size-4" />
                            )}
                            {episode.watched ? "gesehen" : "markieren"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Streaming providers */}
          {d.watchProviders &&
          (d.watchProviders.flatrate.length ||
            d.watchProviders.rent.length ||
            d.watchProviders.buy.length) ? (
            <section className="mt-12 space-y-4">
              <h2 className="text-2xl font-extrabold tracking-tight">Wo streamen?</h2>
              <p className="text-xs text-muted-foreground">Region: {d.watchProviders.region}</p>
              <div className="grid sm:grid-cols-3 gap-4">
                {(
                  [
                    ["Streaming (Flatrate)", d.watchProviders.flatrate],
                    ["Leihen", d.watchProviders.rent],
                    ["Kaufen", d.watchProviders.buy],
                  ] as const
                ).map(([label, list]) =>
                  list.length ? (
                    <div key={label} className="bg-surface border border-border rounded-2xl p-4">
                      <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">
                        {label}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {list.map((p) => (
                          <div
                            key={p.provider_id}
                            title={p.provider_name}
                            className="size-12 rounded-xl overflow-hidden border border-border"
                          >
                            {p.logo_path && (
                              <img
                                src={`${TMDB_IMG}/w92${p.logo_path}`}
                                alt={p.provider_name}
                                className="size-full object-cover"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
              {d.watchProviders.link && (
                <a
                  href={d.watchProviders.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-primary hover:underline"
                >
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
                        <img
                          src={`${TMDB_IMG}/w185${c.profile_path}`}
                          alt={c.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="size-full grid place-items-center text-2xl text-muted-foreground">
                          {c.name.charAt(0)}
                        </div>
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
