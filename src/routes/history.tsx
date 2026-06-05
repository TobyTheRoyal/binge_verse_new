import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { History as HistoryIcon, Star, Trash2 } from "lucide-react";
import { posterUrl } from "@/components/MediaCard";
import { useAuth } from "@/lib/auth-context";
import { useRatings } from "@/lib/user-data";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History · Bingeverse" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { user } = useAuth();
  const { items, removeRating } = useRatings();
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState<"recent" | "highest" | "lowest" | "title">("recent");

  const filtered = useMemo(() => {
    let arr = filter === "all" ? items : items.filter((x) => x.media_type === filter);
    arr = arr.filter((x) => x.rating >= minRating);
    arr = [...arr];
    if (sort === "highest") arr.sort((a, b) => b.rating - a.rating);
    else if (sort === "lowest") arr.sort((a, b) => a.rating - b.rating);
    else if (sort === "title") arr.sort((a, b) => a.title.localeCompare(b.title));
    else arr.sort((a, b) => b.ratedAt - a.ratedAt);
    return arr;
  }, [items, filter, minRating, sort]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <HistoryIcon className="size-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-extrabold mb-2">Login erforderlich</h1>
        <p className="text-muted-foreground mb-6">Deine Bewertungs-Historie erscheint hier nach dem Login.</p>
        <Link to="/auth" className="inline-flex h-11 px-6 items-center rounded-full bg-primary text-primary-foreground font-semibold">Zum Login</Link>
      </div>
    );
  }

  const avg = items.length ? items.reduce((s, x) => s + x.rating, 0) / items.length : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Bewertungs-Historie</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length} Bewertungen · Ø {avg.toFixed(1)}/10
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="inline-flex p-1 rounded-full bg-surface border border-border">
          {(["all", "movie", "tv"] as const).map((t) => (
            <button key={t} onClick={() => setFilter(t)} className={`px-4 h-9 rounded-full text-sm font-semibold transition ${filter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "all" ? "Alle" : t === "movie" ? "Filme" : "Serien"}
            </button>
          ))}
        </div>
        <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="h-10 px-4 rounded-full bg-surface border border-border text-sm">
          <option value={0}>Alle Bewertungen</option>
          <option value={5}>≥ 5 ⭐</option>
          <option value={7}>≥ 7 ⭐</option>
          <option value={8}>≥ 8 ⭐</option>
          <option value={9}>≥ 9 ⭐</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-10 px-4 rounded-full bg-surface border border-border text-sm">
          <option value="recent">Zuletzt bewertet</option>
          <option value="highest">Beste zuerst</option>
          <option value="lowest">Schlechteste zuerst</option>
          <option value="title">Titel A-Z</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">Keine Einträge.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((it) => {
            const poster = posterUrl(it.poster_path, "w185");
            return (
              <div key={`${it.media_type}-${it.id}`} className="group flex gap-4 p-3 rounded-2xl bg-surface border border-border hover:border-primary/40 transition">
                <Link to="/title/$type/$id" params={{ type: it.media_type, id: String(it.id) }} className="shrink-0">
                  <div className="w-20 h-28 rounded-lg overflow-hidden bg-background">
                    {poster && <img src={poster} alt={it.title} className="size-full object-cover" />}
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to="/title/$type/$id" params={{ type: it.media_type, id: String(it.id) }} className="font-semibold line-clamp-2 hover:text-primary">
                    {it.title}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-1">
                    {it.release_date ? new Date(it.release_date).getFullYear() : "—"} · {it.media_type === "tv" ? "Serie" : "Film"}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-gold)]/15 border border-[var(--color-gold)]/30">
                    <Star className="size-3.5 text-[var(--color-gold)] fill-[var(--color-gold)]" />
                    <span className="text-sm font-bold text-[var(--color-gold)]">{it.rating}/10</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(it.ratedAt).toLocaleDateString()}</p>
                </div>
                <button onClick={() => removeRating(it.id, it.media_type)} className="self-start size-9 grid place-items-center rounded-full hover:bg-destructive/10 hover:text-destructive transition opacity-0 group-hover:opacity-100">
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
