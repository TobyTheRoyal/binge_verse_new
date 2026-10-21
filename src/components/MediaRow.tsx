import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaCard } from "./MediaCard";
import type { MediaItem } from "@/lib/tmdb.functions";

export function MediaRow({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: MediaItem[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  if (!items?.length) return null;

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="hidden md:flex gap-1.5">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={`${title}: zurück`}
            title="Zurück"
            className="icon-button"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={`${title}: weiter`}
            title="Weiter"
            className="icon-button"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="flex gap-4 overflow-x-auto scroll-row pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 snap-x snap-mandatory"
      >
        {items.map((it) => (
          <div
            key={`${it.media_type}-${it.id}`}
            className="shrink-0 w-[150px] sm:w-[170px] md:w-[185px] snap-start"
          >
            <MediaCard item={it} />
          </div>
        ))}
      </div>
    </section>
  );
}
