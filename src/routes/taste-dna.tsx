import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { MatchScore } from "@/components/MatchScore";
import { MediaCard } from "@/components/MediaCard";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@/lib/navigation";
import { getTasteDna, recomputeTasteDna, type TastePreference } from "@/lib/taste-dna";

function PreferenceBars({ title, items }: { title: string; items: TastePreference[] }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {items.length ? (
        <div className="mt-4 space-y-3">
          {items.slice(0, 8).map((item) => (
            <div key={item.id}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.score}% · {item.observations} Signale
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${item.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Noch nicht genug verlässliche Daten vorhanden.
        </p>
      )}
    </section>
  );
}

export function TasteDnaPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["taste-dna", user?.id],
    enabled: Boolean(user),
    queryFn: () => getTasteDna(),
  });
  const recompute = useMutation({
    mutationFn: () => recomputeTasteDna(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["taste-dna", user?.id] }),
  });

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-4xl font-extrabold">TasteDNA</h1>
        <p className="mt-3 text-muted-foreground">
          Logge dich ein, damit BingeVerse dein persönliches Geschmacksprofil berechnen kann.
        </p>
        <Link
          href="/auth"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground"
        >
          Login
        </Link>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="grid py-24 place-items-center text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="py-24 text-center text-muted-foreground">TasteDNA konnte nicht laden.</div>
    );
  }

  const { profile, stats, recommendations } = query.data;
  const hours = Math.round(stats.estimatedMinutesWatched / 60);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
      <section className="border-b border-border pb-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-bold text-primary">TasteDNA</div>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Dein Filmgeschmack</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">{profile.summary}</p>
          </div>
          <button
            type="button"
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${recompute.isPending ? "animate-spin" : ""}`} />
            Neu berechnen
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Confidence", `${profile.confidence}%`],
            ["Bewertungen", String(profile.ratingCount)],
            ["Ø Bewertung", profile.averageRating.toFixed(1)],
            ["Watchtime", `${hours}h geschätzt`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-2xl font-black">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <PreferenceBars title="Lieblingsgenres" items={profile.genrePreferences} />
        <PreferenceBars title="StoryDNA-Themen" items={profile.storyPreferences} />
        <PreferenceBars title="Schauspieler" items={profile.actorPreferences} />
        <PreferenceBars title="Regie & Creator" items={profile.directorPreferences} />
      </div>

      <section className="border-y border-border py-6">
        <h2 className="text-lg font-extrabold">BingeStats</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Filme gesehen", stats.moviesWatched],
            ["Serien gesehen", stats.tvSeriesWatched],
            ["Episoden gesehen", stats.episodesWatched],
            ["Serien abgeschlossen", stats.completedSeries],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-background p-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-2xl font-black">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {stats.ratingDistribution.map((bucket) => (
            <div
              key={bucket.rating}
              className="rounded-full border border-border px-3 py-1 text-xs"
            >
              {bucket.rating}: {bucket.count}
            </div>
          ))}
        </div>
      </section>

      {recommendations.map((section) => (
        <section key={section.title} className="space-y-4">
          <div>
            <h2 className="text-2xl font-extrabold">{section.title}</h2>
            {section.subtitle && (
              <p className="text-sm text-muted-foreground">{section.subtitle}</p>
            )}
          </div>
          {section.items.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {section.items.map((item) => (
                <MediaCard key={`${item.media_type}-${item.id}`} item={item} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
              Bewerte mehr Titel, damit diese Sektion sinnvoll gefüllt werden kann.
            </div>
          )}
        </section>
      ))}

      {profile.ratingCount < 3 && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <MatchScore
            score={{
              score: null,
              label: "TasteMatch freischalten",
              color: "neutral",
              confidence: profile.confidence,
              reasons: [],
              insufficientData: true,
            }}
            size="large"
          />
        </div>
      )}
    </div>
  );
}
