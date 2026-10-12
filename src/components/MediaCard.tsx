import { Star } from "lucide-react";
import type { MediaItem } from "@/lib/tmdb.functions";
import { Link } from "@/lib/navigation";

export const TMDB_IMG = "https://image.tmdb.org/t/p";

export function posterUrl(path: string | null, size: "w92" | "w185" | "w342" | "w500" | "original" = "w342") {
  if (!path) return null;
  return `${TMDB_IMG}/${size}${path}`;
}

export function MediaCard({ item, priority }: { item: MediaItem; priority?: boolean }) {
  const year = item.release_date ? new Date(item.release_date).getFullYear() : null;
  const poster = posterUrl(item.poster_path, "w342");

  return (
    <Link
      href={`/title/${item.media_type}/${item.id}`}
      className="group block card-hover"
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface border border-border">
        {poster ? (
          <img
            src={poster}
            alt={item.title}
            loading={priority ? "eager" : "lazy"}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="size-full grid place-items-center text-muted-foreground text-sm">No image</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {item.vote_average > 0 && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur text-xs font-semibold">
            <Star className="size-3 text-[var(--color-gold)] fill-[var(--color-gold)]" />
            {item.vote_average.toFixed(1)}
          </div>
        )}
        <div className="absolute top-2 left-2 inline-flex items-center px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-[10px] font-bold uppercase tracking-wider">
          {item.media_type === "tv" ? "Serie" : "Film"}
        </div>
      </div>
      <div className="mt-2.5 px-0.5">
        <h3 className="text-sm font-semibold line-clamp-1 group-hover:text-primary transition-colors">{item.title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{year ?? "—"}</p>
      </div>
    </Link>
  );
}
