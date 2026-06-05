import { useMemo, useState } from "react";
import { Bookmark, Trash2, Star } from "lucide-react";
import { posterUrl } from "@/components/MediaCard";
import { useAuth } from "@/lib/auth-context";
import { useWatchlist } from "@/lib/user-data";
import { Link } from "@/lib/navigation";

export function WatchlistPage() {
  const { user } = useAuth();
  const { items, remove } = useWatchlist();
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");
  const [sort, setSort] = useState<"added" | "title" | "rating">("added");

  const filtered = useMemo(() => {
    let arr = filter === "all" ? items : items.filter((x) => x.media_type === filter);
    arr = [...arr];
    if (sort === "title") arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "rating") arr.sort((a, b) => b.vote_average - a.vote_average);
    else arr.sort((a, b) => b.addedAt - a.addedAt);
    return arr;
  }, [items, filter, sort]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <Bookmark className="size-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-extrabold mb-2">Login erforderlich</h1>
        <p className="text-muted-foreground mb-6">Logge dich ein, um deine Watchlist zu verwalten.</p>
        <Link href="/auth" className="inline-flex h-11 px-6 items-center rounded-full bg-primary text-primary-foreground font-semibold">Zum Login</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Deine Watchlist</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} Einträge</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex p-1 rounded-full bg-surface border border-border">
            {(["all", "movie", "tv"] as const).map((t) => (
              <button key={t} onClick={() => setFilter(t)} className={`px-4 h-9 rounded-full text-sm font-semibold transition ${filter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "all" ? "Alle" : t === "movie" ? "Filme" : "Serien"}
              </button>
            ))}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-10 px-4 rounded-full bg-surface border border-border text-sm">
            <option value="added">Zuletzt hinzugefügt</option>
            <option value="title">Titel A-Z</option>
            <option value="rating">Beste Bewertung</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <p>Noch nichts gespeichert.</p>
          <Link href="/" className="inline-block mt-4 text-primary font-semibold hover:underline">Filme & Serien entdecken</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((it) => {
            const year = it.release_date ? new Date(it.release_date).getFullYear() : "—";
            const poster = posterUrl(it.poster_path, "w185");
            return (
              <div key={`${it.media_type}-${it.id}`} className="group flex gap-4 p-3 rounded-2xl bg-surface border border-border hover:border-primary/40 transition">
                <Link href={`/title/${it.media_type}/${it.id}`} className="shrink-0">
                  <div className="w-20 h-28 rounded-lg overflow-hidden bg-background">
                    {poster && <img src={poster} alt={it.title} className="size-full object-cover" />}
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/title/${it.media_type}/${it.id}`} className="font-semibold line-clamp-2 hover:text-primary">
                    {it.title}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <span>{year}</span>
                    <span className="size-1 rounded-full bg-muted-foreground/40" />
                    <span className="uppercase">{it.media_type === "tv" ? "Serie" : "Film"}</span>
                    {it.vote_average > 0 && (
                      <>
                        <span className="size-1 rounded-full bg-muted-foreground/40" />
                        <span className="inline-flex items-center gap-1"><Star className="size-3 text-[var(--color-gold)] fill-[var(--color-gold)]" />{it.vote_average.toFixed(1)}</span>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => remove(it.id, it.media_type)} className="self-start size-9 grid place-items-center rounded-full hover:bg-destructive/10 hover:text-destructive transition opacity-0 group-hover:opacity-100">
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
