import { posterUrl } from "@/lib/media-assets";
import { Star } from "lucide-react";
import type { MediaItem } from "@/lib/tmdb.functions";
import { Link } from "@/lib/navigation";
import { MatchScore } from "./MatchScore";

export function MediaCard({ item, priority }: { item: MediaItem; priority?: boolean }) {
  const year = item.release_date ? new Date(item.release_date).getFullYear() : null;
  const poster = posterUrl(item.poster_path, "w342");

  return (
    <Link href={`/title/${item.media_type}/${item.id}`} className="group block min-w-0 card-hover">
      <div className="media-poster relative aspect-[2/3] rounded-lg overflow-hidden bg-surface border border-border">
        {poster ? (
          <img
            src={poster}
            alt={item.title}
            loading={priority ? "eager" : "lazy"}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="size-full grid place-items-center text-muted-foreground text-sm">
            No image
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {item.vote_average > 0 && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-sm border border-white/10 bg-black/80 px-1.5 py-1 text-[11px] font-bold text-foreground backdrop-blur">
            <Star className="size-3 text-[var(--color-gold)] fill-[var(--color-gold)]" />
            {item.vote_average.toFixed(1)}
          </div>
        )}
        <div className="absolute top-2 left-2 inline-flex items-center rounded-sm border border-white/10 bg-black/80 px-1.5 py-1 text-[10px] font-bold text-foreground backdrop-blur">
          {item.media_type === "tv" ? "Serie" : "Film"}
        </div>
        {item.match_score && (
          <div className="absolute bottom-2 left-2">
            <MatchScore score={item.match_score} />
          </div>
        )}
      </div>
      <div className="mt-2.5 px-0.5">
        <h3 className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors">
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">{year ?? "—"}</p>
      </div>
    </Link>
  );
}
